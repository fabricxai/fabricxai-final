/**
 * Payloads for 1.4, including every `pending_changes` payload.
 *
 * `feedbackRoundPayload` is the one that matters. It is what MARBIM drafts when it reads
 * a buyer's comment sheet, and it is what decides whether a cutting floor may start — so
 * the verdict is a closed enum with no default. A payload that could arrive without a
 * verdict is a payload that could clear a gate by omission.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const money = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/, 'expected a money amount')

export const sampleTypes = ['proto', 'fit', 'sms', 'pp', 'top', 'shipment'] as const
export const sampleStages = [
  'pattern',
  'cutting',
  'sewing',
  'finishing',
  'qc',
  'dispatched',
] as const

export const sampleRequestPayload = z
  .object({
    rfqId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    type: z.enum(sampleTypes),
    styleCode: z.string().min(1),
    requestNo: z.string().min(1).max(60),
    dueDate: isoDate.optional(),
  })
  .refine((r) => (r.rfqId === undefined) !== (r.orderId === undefined), {
    // A proto sample is made to win an order; a PP sample is made against one that
    // exists. A row in both flows is read by neither screen.
    message: 'a sample request belongs to an RFQ or to an order, never both',
    path: ['orderId'],
  })
  .refine((r) => r.type !== 'pp' || r.orderId !== undefined, {
    // There is no such thing as a pre-production sample for an order that does not exist,
    // and the PP gate looks the sample up BY order.
    message: 'a PP sample must belong to an order',
    path: ['orderId'],
  })

export const stageAdvancePayload = z.object({
  sampleRequestId: z.string().uuid(),
  stage: z.enum(sampleStages),
  occurredAt: z.string().optional(),
  offlineKey: z.string().min(1).max(120).optional(),
})

export const dispatchPayload = z.object({
  sampleRequestId: z.string().uuid(),
  courier: z.string().min(1).max(120),
  awb: z.string().min(1).max(120),
  dispatchedAt: z.string().optional(),
})

/**
 * One itemised buyer note on a sample.
 *
 * Exported because the READ side parses the stored jsonb with the same schema
 * the write side validated it against — two definitions of the same shape drift,
 * and the one that drifts is always the one nobody is looking at.
 */
export const buyerComment = z.object({
  area: z.string().min(1),
  comment: z.string().min(1),
  /** Page of the buyer's comment sheet, so a reviewer can check the extraction. */
  page: z.number().int().min(1).optional(),
})

export const feedbackRoundPayload = z.object({
  sampleRequestId: z.string().uuid(),
  /** No default. A verdict that could arrive by omission could clear a gate by omission. */
  verdict: z.enum(['approved', 'approved_with_comments', 'rejected']),
  comments: z.array(buyerComment).default([]),
  recordedOn: isoDate,
  documentId: z.string().uuid().optional(),
  /**
   * The client's idempotency key (audit BE-M3). Optional because a round drafted through
   * the approve inbox has no client behind it — a reviewer clicking approve is already
   * protected by the draft's own status lock.
   */
  offlineKey: z.string().min(1).max(120).optional(),
})

export const sampleCostPayload = z.object({
  sampleRequestId: z.string().uuid(),
  amount: money,
  currency: z.string().length(3).default('BDT'),
  note: z.string().max(500).optional(),
})

export const SAMPLING_ZOD_MAP = {
  sample_request: sampleRequestPayload,
  feedback_round: feedbackRoundPayload,
} as const

export type SampleRequestPayload = z.infer<typeof sampleRequestPayload>
export type FeedbackRoundPayload = z.infer<typeof feedbackRoundPayload>
export type StageAdvancePayload = z.infer<typeof stageAdvancePayload>

/**
 * One requisition line — the ask, and later the answer (HANDOFF-sampling-requisition).
 *
 * `qty` is a decimal string with a free-text unit because these are consumption figures
 * ("2.5 m of collar rib"), not money and not arithmetic inputs. `used` starts `pending`;
 * a substitution must say what actually went into the garment, because that note is the
 * difference between a fit comment and a trim comment when the buyer's feedback lands.
 */
export const requisitionLine = z
  .object({
    material: z.string().trim().min(1).max(120),
    spec: z.string().trim().max(200).default(''),
    qty: z.string().regex(/^\d{1,7}(\.\d{1,3})?$/, 'expected a quantity'),
    unit: z.string().trim().min(1).max(16),
    used: z.enum(['pending', 'as_specified', 'substituted']).default('pending'),
    substituteNote: z.string().trim().max(200).default(''),
  })
  .refine((l) => l.used !== 'substituted' || l.substituteNote.length > 0, {
    message: 'a substitution must say what went in instead',
    path: ['substituteNote'],
  })

export type RequisitionLine = z.output<typeof requisitionLine>

export const setRequisitionPayload = z.object({
  sampleRequestId: z.string().uuid(),
  lines: z.array(requisitionLine).max(60),
})

export const recordUsagePayload = z.object({
  sampleRequestId: z.string().uuid(),
  /** Index into the stored lines — the set is small and rewritten whole by the editor. */
  lineIndex: z.number().int().min(0).max(59),
  used: z.enum(['as_specified', 'substituted']),
  substituteNote: z.string().trim().max(200).optional(),
})
