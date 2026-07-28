/**
 * Server-side business gates (architecture §1.3, dev-plan §2.2.8).
 *
 * A gate is a precondition that costs real money or legal exposure to get wrong. Every
 * one of them lives here and returns a STRUCTURED result — the UI reflects a gate, it
 * never implements one. A disabled button is not a gate.
 *
 * ⚠ Implementations land with their owning modules; the shapes are fixed here now so
 * consumers can be written against them and stubbed per PLAYBOOK §2 step A.
 */
import { AppError } from './errors'

export interface GateResult {
  passed: boolean
  /** i18n key explaining the block, e.g. 'gates.ud_balance.insufficient'. */
  reasonKey?: string
  /** Numbers the UI shows next to the block: available vs requested, dates, ids. */
  facts?: Record<string, unknown>
}

export const GATES = {
  /** PP (pre-production) sample approval before cutting may start — 1.4 → 5.1. */
  ppApproval: 'pp_approval',
  /** Bonded fabric issue against a customs Utilization Declaration — 2.2 → 3.1.
   *  Overdraw is legal exposure, so this one is a hard block, never a warning. */
  udBalance: 'ud_balance',
  /** Back-to-back LC headroom as a % of the master LC before an import PO — 2.1 → 3.2. */
  btbHeadroom: 'btb_headroom',
  /** EXP number present before export documents go to the bank — 8.1 → 2.1. */
  expNumber: 'exp_number',
  /** Shipment date vs the LC's latest-shipment clause — red alert everywhere. */
  lcLatestShipment: 'lc_latest_shipment',
} as const

export type GateId = (typeof GATES)[keyof typeof GATES]

/** Turn a failed gate into the typed 409 the action boundary knows how to map. */
export function assertGate(gate: GateId, result: GateResult): void {
  if (result.passed) return
  throw new AppError('gate_blocked', result.reasonKey ?? `gates.${gate}.blocked`, {
    gate,
    ...result.facts,
  })
}
