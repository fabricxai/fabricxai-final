/**
 * What MARBIM can be asked to read, and where the draft lands.
 *
 * The canvas promises a drop-zone that works out what a document is before reading it. That
 * classifier does not exist, and guessing would be worse than not offering it: a tech pack
 * filed as a buyer PO puts a wrong draft in somebody's approve inbox, where it looks exactly
 * like a right one.
 *
 * So the person holding the document says what it is. That is not a lesser version of the
 * feature — it is the honest ordering of it. The classifier is a convenience for somebody
 * who already knows the answer; it was never the thing that makes extraction safe. What
 * makes it safe is that every draft goes to `pending_changes` with per-field confidence and
 * a human approves it, and that is true either way.
 *
 * **Every entry is checked against the module registry at load.** A kind naming a target the
 * module never whitelisted would be refused by `propose` at runtime, one upload at a time,
 * long after somebody demoed it. `assertIntakeKinds` turns that into a boot failure.
 *
 * **And every entry must be completable from a document**, which the registry cannot tell
 * you — see the note under the list, and `intake.test.ts`, which asserts it. A schema
 * requiring a UUID is asking the paper for something only this system knows.
 */
import { AppError } from '../core/errors'
import { listModules } from '../core/registry'

/**
 * A field the PERSON supplies, because the document cannot.
 *
 * `orderFromPoDraft` requires `buyerId`; a buyer's PO names the buyer in words and has never
 * heard of the uuid this system files them under. That is not an undeliverable schema — it
 * is one input the extractor was never going to find, and the person uploading knows it.
 */
export interface IntakeContextField {
  /** The payload field it fills. Must be a required field of the target schema. */
  field: string
  /** What the picker asks, in the words a person would use. */
  label: string
  /** Which list the screen offers. The action resolves it; the id never comes from a form. */
  source: 'buyers' | 'audits'
}

export interface IntakeKind {
  /** Stable id used by the screen and the queued job. */
  id: string
  /** What a person calls this document, in the words they would use. */
  label: string
  /** What the reader should expect to be looking at — shown under the label. */
  hint: string
  moduleId: string
  targetTable: string
  zodSchemaKey: string
  /** Ids the schema requires and no document carries. Empty for most kinds. */
  context?: readonly IntakeContextField[]
}

/**
 * The documents a factory actually receives and re-types.
 *
 * Deliberately not every registered target. A `ud_override_v1` or a `pay_payable` is a
 * human decision, not something anybody scans — offering them here would suggest a document
 * exists that does not.
 */
export const INTAKE_KINDS: readonly IntakeKind[] = [
  {
    id: 'buyer_po',
    label: "A buyer's purchase order",
    hint: 'The PO or order sheet a buyer sends. Drafts the order, its quantities and dates.',
    moduleId: 'orders',
    targetTable: 'orders',
    zodSchemaKey: 'order_from_po_v1',
    context: [{ field: 'buyerId', label: 'Which buyer sent it?', source: 'buyers' }],
  },
  {
    id: 'ud_scan',
    label: 'A customs Utilization Declaration',
    hint: 'The UD paper for duty-free bonded material. Drafts the authorised items and quantities.',
    moduleId: 'commercial',
    targetTable: 'uds',
    zodSchemaKey: 'ud_from_scan_v1',
  },
  {
    id: 'tech_pack',
    label: 'A tech pack',
    hint: 'The buyer’s construction sheet. Drafts the bill of materials behind a cost sheet.',
    moduleId: 'costing',
    targetTable: 'boms',
    zodSchemaKey: 'bom_from_tech_pack_v1',
  },
  {
    id: 'wage_gazette',
    label: 'A wage gazette notification',
    hint: 'The government grade table. Drafts the grades payroll computes against.',
    moduleId: 'workforce',
    targetTable: 'wage_gazettes',
    zodSchemaKey: 'gazette_from_scan_v1',
  },
  {
    id: 'audit_report',
    label: 'A compliance audit report',
    hint: 'The auditor’s findings list. Drafts each finding with its severity.',
    moduleId: 'compliance',
    targetTable: 'findings',
    zodSchemaKey: 'findings_batch_v1',
    context: [{ field: 'auditId', label: 'Which audit is this the report for?', source: 'audits' }],
  },
  {
    id: 'measurement_chart',
    label: 'A measurement chart',
    hint: 'The buyer’s points of measure and tolerances. Drafts the chart QC measures against.',
    moduleId: 'quality',
    targetTable: 'measurement_specs',
    zodSchemaKey: 'measurement_spec',
  },
] as const

/*
 * Two kinds were offered here and removed, and the reason is worth keeping.
 *
 * `supplier_quote` and `buyer_terms` both passed every check `assertIntakeKinds` makes —
 * real module, whitelisted target, schema that exists — and were still impossible to
 * complete. `supplierQuotePayload` requires `purchaseRequisitionId`, `supplierId` and a
 * per-line `itemId`; `buyerTermsPayload` requires `buyerId`. All UUIDs, and **no document
 * contains a UUID**. A supplier's quote names "Meghna Knit Composite Ltd"; the id standing
 * for them exists only inside this system. The extraction ran, returned what the paper
 * actually said, and zod rejected it — as it would for every document, forever.
 *
 * Offering a kind that can never produce a draft is worse than not offering it: the person
 * uploads, is told it is queued, and waits for something that is not coming.
 *
 * What would make them offerable is a document-shaped schema that carries the supplier and
 * buyer by NAME, with the resolution to an id happening at commit where a human can confirm
 * "this is the Meghna we already trade with" — which is a real feature, not a schema tweak.
 * `intake.test.ts` fails the moment either is re-added without one.
 */

const BY_ID = new Map(INTAKE_KINDS.map((kind) => [kind.id, kind]))

export function intakeKind(id: string): IntakeKind {
  const kind = BY_ID.get(id)
  if (!kind) {
    throw new AppError('validation_failed', 'marbim.errors.unknown_intake_kind', { id })
  }
  return kind
}

/**
 * Prove every kind targets something its module actually registered.
 *
 * Called at module load. `propose` would refuse an unregistered target anyway — but at
 * runtime, on one upload, to one person, after a demo has already promised it works.
 */
export function assertIntakeKinds(): void {
  const modules = new Map(listModules().map((m) => [m.id, m]))

  for (const kind of INTAKE_KINDS) {
    const definition = modules.get(kind.moduleId)
    if (!definition) {
      throw new Error(`intake kind "${kind.id}" names module "${kind.moduleId}", which is not registered`)
    }
    if (!definition.pendingTargets.includes(kind.targetTable)) {
      throw new Error(
        `intake kind "${kind.id}" drafts into "${kind.targetTable}", which ${kind.moduleId} has not registered as a pending target`,
      )
    }
    if (!(kind.zodSchemaKey in definition.zodMap)) {
      throw new Error(
        `intake kind "${kind.id}" names schema "${kind.zodSchemaKey}", which ${kind.moduleId} does not define`,
      )
    }
  }
}
