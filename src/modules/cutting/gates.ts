/**
 * The PP-approval gate seam (core `GATES.ppApproval`, 1.4 → 5.1).
 *
 * Pre-production sample approval is the buyer signing off that the factory has made the
 * garment correctly once before it makes eighty thousand. Cutting before that approval is
 * how a factory produces an entire order to a spec the buyer then rejects, and the fabric
 * is already cut.
 *
 * Module 1.4 Sampling owns the answer and does not exist yet, so this is a registration
 * seam (PLAYBOOK §2 step A). **With no provider registered the gate FAILS CLOSED.** The
 * alternative — defaulting to `passed` — would mean shipping a system whose most
 * expensive quality gate is silently disabled, and nobody would notice until an order was
 * rejected. A gate that blocks visibly is a bug report; a gate that passes silently is a
 * claim.
 */
import type { AnyCtx } from '../core/ctx'
import { GATES, type GateResult } from '../core/gates'
import type { TenantDb } from '../core/tenancy'

export type PpApprovalProvider = (
  ctx: AnyCtx,
  tx: TenantDb,
  input: { orderId: string; orderStyleId: string },
) => Promise<GateResult>

let provider: PpApprovalProvider | null = null

/** Registered by 1.4 Sampling when it lands. Tests register their own. */
export function registerPpApprovalProvider(next: PpApprovalProvider): void {
  provider = next
}

/** Test-only: the provider is module-global, so suites must be able to reset it. */
export function resetPpApprovalProvider(): void {
  provider = null
}

export async function checkPpApproval(
  ctx: AnyCtx,
  tx: TenantDb,
  input: { orderId: string; orderStyleId: string },
): Promise<GateResult> {
  if (!provider) {
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.no_provider',
      facts: { gate: GATES.ppApproval, orderId: input.orderId },
    }
  }
  return provider(ctx, tx, input)
}
