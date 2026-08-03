/**
 * 7.1 Quality seed slice.
 *
 * The point of this slice is that DHU reads like a real floor rather than a demo:
 *
 *  - **Every line has a denominator.** Most checks find nothing wrong. A seed where every
 *    inline row carries a defect produces a DHU near 100 and teaches nobody anything —
 *    what a QC actually does all day is confirm that garments are fine.
 *  - **The defects cluster.** Roughly 80% of them sit in a handful of causes, because that
 *    is what a Pareto chart is for; a flat spread across seventeen codes would make the
 *    dashboard's "80% sits in 4 causes" panel a lie.
 *  - **One line is over threshold.** L6 runs hot on skipped stitches — the same defect, the
 *    same station, day after day, which is exactly the shape the repeat-defect alert looks
 *    for and the only shape worth a conversation with a supervisor.
 *
 * Defect codes come from `seedDefaultDefectCodes()` in the service rather than being
 * duplicated here. A taxonomy that drifts between the seed and the product is a taxonomy
 * that makes every comparison across factories wrong.
 */
import { and, asc, eq } from 'drizzle-orm'

import type { RequestCtx, SystemCtx } from '@/modules/core/ctx'
import { lines } from '@/modules/planning/schema'
import { dailyLinePlans } from '@/modules/production/schema'
import { fabricInspections, measurementSpecs } from '@/modules/quality/schema'
import { inlineChecks } from '@/modules/quality/schema'
import { runQualityDayClose } from '@/modules/quality/jobs'
import { createMeasurementSpec, inspectFabric, seedDefaultDefectCodes } from '@/modules/quality/service'
import { roles } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { termsFor, upsertTerms } from '@/modules/buyers/service'
import { orderStyles } from '@/modules/orders/schema'
import { grnLines, grns, items, rolls } from '@/modules/store/schema'
import { workers } from '@/modules/workforce/schema'

import type { SeedContext, SeedSlice } from './types'

/** The operations a woven shirt line is checked at, in sewing order. */
const OPERATIONS = [
  'Shoulder join',
  'Collar attach',
  'Sleeve attach',
  'Side seam',
  'Cuff attach',
  'Placket',
  'Button attach',
  'Buttonhole',
] as const

/**
 * Per line: how many checks a QC filed today, and how the defects fall.
 *
 * `defectRate` is the share of checks that find something — not the DHU. A line at 0.04
 * lands near 4 DHU because each check covers one garment.
 */
const LINE_QC = [
  { code: 'L1', checks: 90, defectRate: 0.033, bias: 'stitching' },
  { code: 'L2', checks: 88, defectRate: 0.037, bias: 'stitching' },
  { code: 'L3', checks: 84, defectRate: 0.030, bias: 'finishing' },
  { code: 'L4', checks: 62, defectRate: 0.045, bias: 'trims' },
  { code: 'L5', checks: 80, defectRate: 0.039, bias: 'finishing' },
  // Over threshold, and always the same defect at the same operation.
  { code: 'L6', checks: 86, defectRate: 0.072, bias: 'repeat' },
] as const

/** Where the mass sits, so the Pareto has a head and a tail. */
const COMMON_DEFECTS: Record<string, readonly string[]> = {
  stitching: ['SKIP_STITCH', 'SKIP_STITCH', 'BROKEN_STITCH', 'PUCKERING', 'OPEN_SEAM'],
  finishing: ['LOOSE_THREAD', 'LOOSE_THREAD', 'OIL_STAIN', 'POOR_PRESSING', 'SKIP_STITCH'],
  trims: ['ZIPPER_FAULT', 'WRONG_LABEL', 'LOOSE_THREAD', 'SKIP_STITCH', 'BROKEN_STITCH'],
  repeat: ['SKIP_STITCH'],
}

/** Operators, so the third tap has somebody to attribute a defect to. */
const OPERATORS_PER_LINE = 4
const OPERATOR_NAMES = [
  'Ruma Begum',
  'Shefali Akter',
  'Jorina Khatun',
  'Momtaz Parvin',
  'Rekha Sultana',
  'Anwara Bibi',
] as const

const today = () => new Date().toISOString().slice(0, 10)

/** A normal woven shirting roll. Width matters: the 4-point result is per unit AREA. */
const FABRIC_WIDTH_INCHES = 58
/** Fabric left deliberately ungraded, so the store gate has something to block. */
const UNGRADED_ROLLS = 6
/** Days of history behind today — the canvas dashboard shows a fortnight. */
const TREND_DAYS = 14
const FRIDAY = 5
/** Rows per insert. Large enough to be fast, small enough to stay under parameter limits. */
const CHUNK = 500

function dayBefore(date: string, back: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)
}

const SEED_QUALITY_POLICY = {
  aqlStandard: 'ansi-z1.4',
  fabricMaxPointsPer100SqYd: '20',
  dhuAlertThreshold: '5',
  repeatDefectDays: 3,
} as const

/** Shift hours 8..16, spread so "last few" reads like a morning's work. */
function occurredAtFor(day: string, index: number, total: number): Date {
  const minutesOfShift = 9 * 60
  const offset = Math.floor((index / Math.max(1, total)) * minutesOfShift)
  return new Date(Date.parse(`${day}T08:00:00Z`) + offset * 60_000)
}

export const QUALITY_SLICE: SeedSlice = {
  id: 'quality',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    const day = today()
    const short = ctx.companyId.slice(0, 8)

    // The taxonomy, through the real service — see the file note.
    const systemCtx: SystemCtx = {
      companyId: ctx.companyId,
      userId: null,
      roles: ['quality'],
      system: true,
    }
    const codes = await seedDefaultDefectCodes(systemCtx)
    counts.defect_codes = codes.created.length

    const lineRows = await ctx.db
      .select({ id: lines.id, code: lines.code })
      .from(lines)
      .where(eq(lines.companyId, ctx.companyId))
    if (lineRows.length === 0) return counts

    const lineByCode = new Map(lineRows.map((l) => [l.code, l.id]))

    const plans = await ctx.db
      .select({ lineId: dailyLinePlans.lineId, orderId: dailyLinePlans.orderId })
      .from(dailyLinePlans)
      .where(and(eq(dailyLinePlans.companyId, ctx.companyId), eq(dailyLinePlans.planDate, day)))
    const orderByLine = new Map(plans.map((p) => [p.lineId, p.orderId]))

    let operators = 0
    let checks = 0

    for (const spec of LINE_QC) {
      const lineId = lineByCode.get(spec.code)
      if (!lineId) continue

      // ── Operators on the line ────────────────────────────────────────────
      for (let i = 0; i < OPERATORS_PER_LINE; i += 1) {
        const employeeNo = `${spec.code}-OP-${String(i + 1).padStart(2, '0')}`
        const [existing] = await ctx.db
          .select({ id: workers.id })
          .from(workers)
          .where(and(eq(workers.companyId, ctx.companyId), eq(workers.employeeNo, employeeNo)))
        if (existing) continue

        await ctx.db.insert(workers).values({
          companyId: ctx.companyId,
          employeeNo,
          name: `${OPERATOR_NAMES[(i + spec.code.charCodeAt(1)) % OPERATOR_NAMES.length]}`,
          designation: 'Sewing operator',
          grade: '4',
          joinDate: '2025-11-03',
          lineId,
          status: 'active',
        })
        operators += 1
      }

      // ── Inline checks, today and the fortnight behind it ────────────────
      const [already] = await ctx.db
        .select({ id: inlineChecks.id })
        .from(inlineChecks)
        .where(
          and(
            eq(inlineChecks.companyId, ctx.companyId),
            eq(inlineChecks.lineId, lineId),
            eq(inlineChecks.checkedOn, day),
          ),
        )
      if (already) continue

      const lineOperators = await ctx.db
        .select({ id: workers.id })
        .from(workers)
        .where(and(eq(workers.companyId, ctx.companyId), eq(workers.lineId, lineId)))

      const pool = COMMON_DEFECTS[spec.bias] ?? COMMON_DEFECTS.stitching!

      // Built as one array and inserted in chunks. Row-at-a-time took fifteen seconds for a
      // single day; the fourteen the trend needs would have taken minutes, and a seed slow
      // enough to avoid running is a seed that goes stale.
      const values: (typeof inlineChecks.$inferInsert)[] = []

      for (let back = 0; back < TREND_DAYS; back += 1) {
        const checkedOn = dayBefore(day, back)
        // Friday is the weekly holiday — the floor does not run and nobody inspects. A
        // trend with no gaps in it is a trend nobody believes.
        if (new Date(`${checkedOn}T00:00:00Z`).getUTCDay() === FRIDAY) continue

        // Today is still in progress, so it carries fewer checks than a closed day.
        const total = back === 0 ? spec.checks : Math.round(spec.checks * (1.05 + ctx.rng() * 0.1))

        for (let i = 0; i < total; i += 1) {
          const hasDefect = ctx.rng() < spec.defectRate
          // A repeat line always fails at the same operation — that is what makes it a
          // repeat rather than six unrelated defects that happen to share a code.
          const operation =
            spec.bias === 'repeat' && hasDefect
              ? 'Buttonhole'
              : OPERATIONS[Math.floor(ctx.rng() * OPERATIONS.length)]!
          const code = pool[Math.floor(ctx.rng() * pool.length)]!

          values.push({
            companyId: ctx.companyId,
            lineId,
            orderId: orderByLine.get(lineId) ?? null,
            checkedOn,
            occurredAt: occurredAtFor(checkedOn, i, total),
            operation,
            operatorId: hasDefect ? (lineOperators[i % lineOperators.length]?.id ?? null) : null,
            checkedQty: 1,
            defects: hasDefect ? [{ code, count: 1 }] : [],
            defectQty: hasDefect ? 1 : 0,
            createdBy: null,
            offlineKey: `seed-${short}-qc-${spec.code}-${checkedOn}-${i}`,
          })
        }
      }

      for (let i = 0; i < values.length; i += CHUNK) {
        await ctx.db
          .insert(inlineChecks)
          .values(values.slice(i, i + CHUNK))
          .onConflictDoNothing()
      }
      checks += values.length
    }

    counts.workers = operators
    counts.inline_checks = checks
    counts.dhu_daily = await closeSeededDhuDays(ctx, day)
    counts.fabric_inspections = await seedFabricInspections(ctx)
    counts.buyer_terms = await seedBuyerAqlTerms(ctx)
    counts.measurement_specs = await seedMeasurementSpecs(ctx)
    return counts
  },
}

/**
 * 4-point results for the fabric already in the store.
 *
 * Filed through `inspectFabric` rather than inserted, so the seed exercises the same
 * arithmetic and the same GRN roll-up the screen does. A seed that writes `result: 'pass'`
 * straight into the table would happily produce a row whose points and verdict disagree,
 * and the first person to notice would be a buyer reading a claim.
 *
 * **The newest consignment is left ungraded on purpose.** `GATES.fabricInspection` fails
 * closed, so those rolls genuinely cannot be issued — which is the behaviour the canvas is
 * describing when it says "Store cannot issue this fabric yet". A seed where everything is
 * already inspected would hide the gate entirely.
 *
 * One roll is graded as a fail: a real delivery has the odd bad roll, and `failed_partial`
 * — some rolls good, some not — is the state a partial claim against the mill is built on.
 */
async function seedFabricInspections(ctx: SeedContext): Promise<number> {
  const [owner] = await ctx.db
    .select({ userId: roles.userId })
    .from(roles)
    .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
  if (!owner) return 0

  const requestCtx: RequestCtx = {
    companyId: ctx.companyId,
    userId: owner.userId,
    roles: ['quality'],
  }

  const rollRows = await ctx.db
    .select({
      rollId: rolls.id,
      qty: rolls.qty,
      grnId: grnLines.grnId,
      uom: items.uom,
    })
    .from(rolls)
    .innerJoin(grnLines, eq(grnLines.id, rolls.grnLineId))
    .innerJoin(grns, eq(grns.id, grnLines.grnId))
    .innerJoin(items, eq(items.id, rolls.itemId))
    // Fabric only. Grading a carton of buttons on the 4-point scale produces a number with
    // no meaning, and the gate does not ask for one.
    .where(and(eq(rolls.companyId, ctx.companyId), eq(items.kind, 'fabric')))
    .orderBy(asc(rolls.rollNo))
  if (rollRows.length === 0) return 0

  const existing = await ctx.db
    .select({ rollId: fabricInspections.rollId })
    .from(fabricInspections)
    .where(eq(fabricInspections.companyId, ctx.companyId))
  const graded = new Set(existing.map((e) => e.rollId))

  // The last few fabric rolls stay ungraded on purpose. `GATES.fabricInspection` fails
  // closed, so they genuinely cannot be issued — which is the behaviour the canvas describes
  // as "Store cannot issue this fabric yet", and it gives the inspection screen real work.
  // A seed where everything is already graded hides the gate completely.
  const gradeUpTo = Math.max(1, rollRows.length - UNGRADED_ROLLS)

  let filed = 0
  for (const [index, roll] of rollRows.entries()) {
    if (graded.has(roll.rollId) || index >= gradeUpTo) continue

    // Rolls are held in metres here; the 4-point system is defined in yards. Passing metres
    // straight through would overstate the inspected area by 9% and quietly pass rolls that
    // should fail. 1 yard is exactly 0.9144 m.
    const quantity = Number(roll.qty)
    const lengthYards = roll.uom === 'm' ? quantity / 0.9144 : quantity
    if (!(lengthYards > 0)) continue

    const squareYards = (lengthYards * FABRIC_WIDTH_INCHES) / 36
    const bad = index % 11 === 10
    const targetPer100SqYd = bad ? 26 + ctx.rng() * 8 : 7 + ctx.rng() * 8

    await inspectFabric(
      requestCtx,
      {
        grnId: roll.grnId,
        rollId: roll.rollId,
        points4: bandsForRate(targetPer100SqYd, squareYards),
        inspectedLengthYards: lengthYards.toFixed(2),
        widthInches: FABRIC_WIDTH_INCHES.toFixed(2),
      },
      SEED_QUALITY_POLICY,
    )
    filed += 1
  }

  return filed
}

/**
 * Work backwards from a points-per-100-yd² rate to plausible band counts.
 *
 * Faults scale with area — a 700-yard roll carrying five faults is not a good roll, it is
 * an uninspected one — so the seed picks the RATE it wants and derives the counts, rather
 * than picking counts and letting the rate fall wherever the roll length puts it. Fixing
 * the counts is what produced rolls grading 0.19 against a limit of 20.
 *
 * The mix is weighted to short faults because that is what a loom actually produces: slubs
 * and small knots far outnumber holes.
 */
function bandsForRate(
  pointsPer100SqYd: number,
  squareYards: number,
): { 1: number; 2: number; 3: number; 4: number } {
  const points = Math.max(1, Math.round((pointsPer100SqYd * squareYards) / 100))

  // Shares of the POINT total, not of the fault count, so the arithmetic closes.
  const four = Math.floor((points * 0.08) / 4)
  const three = Math.floor((points * 0.12) / 3)
  const two = Math.floor((points * 0.3) / 2)
  const one = Math.max(0, points - (four * 4 + three * 3 + two * 2))

  return { 1: one, 2: two, 3: three, 4: four }
}

/**
 * AQL terms for every buyer, so a final inspection has acceptance numbers to work to.
 *
 * These belong to 1.2 Buyers, and this is the wrong slice to own them — but buyers are
 * created by `scripts/demo.ts` through the real service rather than by any seed slice, and
 * without terms the final-inspection screen has nothing to inspect against. `finalInspection
 * Payload` deliberately refuses to default an AQL level, because an acceptance number the
 * system chose is one nobody agreed to, so the screen would simply be unusable.
 *
 * 2.5 major / 4.0 minor is what a mainstream high-street buyer writes for woven tops. They
 * are two independent verdicts, never netted — that is the whole point of carrying both.
 */
async function seedBuyerAqlTerms(ctx: SeedContext): Promise<number> {
  const [owner] = await ctx.db
    .select({ userId: roles.userId })
    .from(roles)
    .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
  if (!owner) return 0

  const requestCtx: RequestCtx = {
    companyId: ctx.companyId,
    userId: owner.userId,
    roles: ['merchandiser'],
  }

  const buyerRows = await ctx.db
    .select({ id: buyers.id })
    .from(buyers)
    .where(eq(buyers.companyId, ctx.companyId))

  let written = 0
  for (const buyer of buyerRows) {
    // Idempotent: `upsertTerms` versions on every call, so re-running the seed would stack
    // up identical versions of the same contract.
    const existing = await termsFor(requestCtx, { buyerId: buyer.id, onDate: today() })
    if (existing) continue

    await upsertTerms(requestCtx, {
      buyerId: buyer.id,
      validFrom: '2026-01-01',
      payment: 'lc',
      incoterm: 'FOB',
      tolerancePct: '5.00',
      aqlLevel: '2.5',
      minorAqlLevel: '4.0',
      nominatedBanks: [],
      nominatedForwarders: [],
      nominatedLabs: [],
    })
    written += 1
  }

  return written
}

/**
 * Close every seeded day's DHU, through the real job.
 *
 * `dhu_daily` is a derived table, and the fourteen-day trend reads it rather than the raw
 * checks. Seeding the checks without closing the days would leave the dashboard empty on a
 * database full of inspections — which is exactly the failure the nightly job exists to
 * prevent, so the seed exercises the job rather than reimplementing it.
 */
async function closeSeededDhuDays(ctx: SeedContext, today: string): Promise<number> {
  const systemCtx: SystemCtx = {
    companyId: ctx.companyId,
    userId: null,
    roles: ['quality'],
    system: true,
  }

  let closed = 0
  for (let back = 0; back < TREND_DAYS; back += 1) {
    const result = await runQualityDayClose(
      systemCtx,
      { forDate: dayBefore(today, back) },
      SEED_QUALITY_POLICY,
    )
    closed += result.lines
  }
  return closed
}

/**
 * A measurement chart for every style on the books.
 *
 * Real points off a men's shirt spec sheet, and the tolerances are ASYMMETRIC on purpose —
 * +1.0 / −0.5 on a body length, not ±0.75. That asymmetry is the whole reason
 * `measurement_specs` carries two tolerance columns: a buyer will take a shirt slightly long
 * far more readily than slightly short, and collapsing the pair into one number rejects half
 * the garments that should have passed.
 */
const SHIRT_POINTS = [
  { name: 'Chest 2.5cm below armhole', spec: '56.00', tolPlus: '1.50', tolMinus: '1.00' },
  { name: 'Body length from HPS', spec: '76.00', tolPlus: '1.00', tolMinus: '0.50' },
  { name: 'Shoulder seam to seam', spec: '46.50', tolPlus: '0.75', tolMinus: '0.75' },
  { name: 'Sleeve length from CB', spec: '86.00', tolPlus: '1.00', tolMinus: '0.50' },
  { name: 'Cuff opening', spec: '24.00', tolPlus: '0.50', tolMinus: '0.50' },
  { name: 'Collar point length', spec: '7.50', tolPlus: '0.30', tolMinus: '0.30' },
  { name: 'Neck circumference', spec: '41.00', tolPlus: '0.60', tolMinus: '0.30' },
  { name: 'Bottom sweep', spec: '58.00', tolPlus: '1.50', tolMinus: '1.00' },
] as const

async function seedMeasurementSpecs(ctx: SeedContext): Promise<number> {
  const [owner] = await ctx.db
    .select({ userId: roles.userId })
    .from(roles)
    .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
  if (!owner) return 0

  const requestCtx: RequestCtx = {
    companyId: ctx.companyId,
    userId: owner.userId,
    roles: ['quality'],
  }

  const styles = await ctx.db
    .selectDistinct({ styleCode: orderStyles.styleCode })
    .from(orderStyles)
    .where(eq(orderStyles.companyId, ctx.companyId))

  let written = 0
  for (const style of styles) {
    // Idempotent: `createMeasurementSpec` always writes the NEXT version, so re-running the
    // seed would stack identical charts and quietly change which one a check is judged on.
    const [existing] = await ctx.db
      .select({ id: measurementSpecs.id })
      .from(measurementSpecs)
      .where(
        and(
          eq(measurementSpecs.companyId, ctx.companyId),
          eq(measurementSpecs.styleCode, style.styleCode),
        ),
      )
    if (existing) continue

    await createMeasurementSpec(requestCtx, {
      styleCode: style.styleCode,
      unit: 'cm',
      points: SHIRT_POINTS.map((p) => ({ ...p })),
    })
    written += 1
  }

  return written
}
