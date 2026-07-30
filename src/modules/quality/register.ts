/**
 * Module registration for 7.1 ⚖
 *
 * `inline_checks` is registered as an offline operation because it is captured on a tablet
 * standing next to a sewing machine, dozens of times a shift, on a network that comes and
 * goes.
 *
 * `final_inspections` is deliberately NOT a pending target. A drafted AQL verdict is a
 * decision about whether a shipment goes, and the brief's whole point is that the verdict
 * is computed server-side from seeded tables. There is nothing for a model to propose:
 * given the defect counts, the answer is arithmetic.
 *
 * `defect_codes` and `measurement_specs` ARE pending targets — a taxonomy and a buyer's
 * measurement chart are both transcribed from documents, and a mistyped tolerance rejects
 * a whole shipment.
 */
import { registerSyncHandler } from '../core/offline-sync'
import { registerModule } from '../core/registry'

import { offlineCaptureInlineCheck } from './service'
import { inlineCheckPayload, QUALITY_ZOD_MAP } from './zod'

export const qualityModule = registerModule({
  id: 'quality',

  pendingTargets: ['defect_codes', 'measurement_specs'],
  zodMap: QUALITY_ZOD_MAP,

  // QC manager approves; the owner and admin can too.
  approvalDefaults: { requiredRoles: ['owner', 'admin', 'quality'] },

  domainPrimer: {
    version: '7.1.0',
    text: `You are helping the quality department of a Bangladeshi garment export factory.

THE THREE THINGS THAT GET MEASURED
- DHU — defects per hundred UNITS: defects ÷ garments checked × 100. It can exceed 100,
  because one garment can carry three defects. A line at 150 DHU is in serious trouble;
  never present it as capped at 100.
- The 4-POINT SYSTEM for incoming fabric is a RATE: points per hundred square yards, not a
  point count. The same twenty points is a pass on a 60" roll and a fail on a 36" one.
  Always quote the rate and the roll's width together.
- AQL at final inspection decides whether the shipment goes.

HOW AQL WORKS, AND THE MISTAKE EVERYONE MAKES
A buyer specifies something like "2.5 major / 4.0 minor". Those are TWO INDEPENDENT
verdicts against one physical sample:
- the sample size comes from the lot size and the inspection level;
- majors are compared to the acceptance number for AQL 2.5, minors to the one for 4.0;
- NEVER add majors and minors together. Eight majors against a "combined allowance of
  seventeen" is a fail that a netted reading would pass, and the shipment would go.
- A CRITICAL defect has no acceptance number. One fails the lot.

You must never compute an AQL verdict yourself or state an acceptance number from memory.
The plan comes from the seeded standard, server-side. If a buyer's AQL level is not in the
table, say so — do not substitute a neighbouring level, because one number out decides
whether a container ships.

MEASUREMENTS
Tolerances are asymmetric: +1/2" and −1/4" is a normal spec. A garment 0.4" over on a
+0.5/−0.25 point is IN spec; 0.4" under is out. And a point nobody measured is not a good
point — report it as missing, never as passing.

PATTERNS
The same defect code at the same operation on three consecutive days is a pattern worth
raising. A gap in the middle is not — the alert exists to surface a problem that is still
there.

DRAFTING
You may draft a defect-code taxonomy and a measurement chart read off a buyer's spec
sheet. Put the source page on every point. You may not draft an inspection verdict.`,
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline operations (rule 7) — inline capture happens on the floor
// ─────────────────────────────────────────────────────────────────────────────

registerSyncHandler('quality', 'inline_check', async (ctx, tx, row) => {
  const payload = inlineCheckPayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlineCaptureInlineCheck(ctx, tx, payload)
  return { rowId: result.inlineCheckId }
})
