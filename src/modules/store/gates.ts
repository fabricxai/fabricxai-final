/**
 * The fabric-inspection gate seam (core `GATES.fabricInspection`, 7.1 → 3.1).
 *
 * Woven fabric is graded on the 4-point system before it may leave the store: faults per
 * hundred square yards, against a threshold the buyer or the factory sets. A roll that
 * fails goes back to the mill as a claim. A roll nobody inspected goes onto the cutting
 * table, and by the time a spreader finds the hole the marker, the lay and the labour have
 * already been spent — and the mill will say the fault happened here.
 *
 * Module 7.1 Quality owns the answer, so this is a registration seam like the PP-approval
 * gate. **With no provider registered the gate FAILS CLOSED**, for the same reason: a
 * quality gate that silently passes is not a disabled feature, it is a claim waiting to be
 * lost, and nobody discovers it until the fabric is cut.
 *
 * Knit composite factories knit their own greige and inspect it at a different point, so
 * the provider — not this seam — decides whether the gate applies to a given roll.
 */
import type { AnyCtx } from '../core/ctx'
import { GATES, type GateResult } from '../core/gates'
import type { TenantDb } from '../core/tenancy'

export type FabricInspectionProvider = (
  ctx: AnyCtx,
  tx: TenantDb,
  input: { rollIds: readonly string[] },
) => Promise<GateResult>

let provider: FabricInspectionProvider | null = null

/** Registered by 7.1 Quality. Tests register their own. */
export function registerFabricInspectionProvider(next: FabricInspectionProvider): void {
  provider = next
}

/** Test-only: the provider is module-global, so suites must be able to reset it. */
export function resetFabricInspectionProvider(): void {
  provider = null
}

export async function checkFabricInspection(
  ctx: AnyCtx,
  tx: TenantDb,
  input: { rollIds: readonly string[] },
): Promise<GateResult> {
  // Nothing roll-tracked in this issue — trims, thread, cartons. The 4-point system grades
  // fabric by area and has nothing to say about a box of buttons.
  if (input.rollIds.length === 0) return { passed: true }

  if (!provider) {
    return {
      passed: false,
      reasonKey: 'gates.fabric_inspection.no_provider',
      facts: { gate: GATES.fabricInspection, rolls: input.rollIds.length },
    }
  }
  return provider(ctx, tx, input)
}
