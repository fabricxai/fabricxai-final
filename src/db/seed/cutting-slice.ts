/**
 * 5.1 Cutting seed slice.
 *
 * A marker, three lays, their cut reports and the bundles that went to sewing.
 *
 * The numbers are built from the marker outward rather than typed, because the whole point
 * of the cutting screens is that four figures have to reconcile: plies × the marker's size
 * ratio is what the lay yields, the cut report is what actually came off the table, and the
 * difference between them is the variance a supervisor argues about. Seed data where those
 * do not tie makes every screen that checks them look broken.
 *
 * Deliberate states:
 *
 *  - **Lay 3 is short by 18 pieces on one cell.** Within a 2% tolerance on some sizes and
 *    outside it on M, so the cut report shows both an accepted variance and one that needs
 *    a decision. A demo where everything ties teaches nobody what the screen is for.
 *  - **Wastage is 3.4% against a 3.0% marker plan.** Real, unremarkable, and the number an
 *    owner actually asks about.
 *
 * The PP gate is not bypassed here: the sampling slice approves this style first, and these
 * lays are what a floor that was allowed to cut would have produced.
 */
import { and, eq } from 'drizzle-orm'

import { addQty, multiplyQty, quantity, subtractQty, zeroQty } from '@/lib/quantity'

import { bundles, cutReports, cutWastage, lays, markers } from '@/modules/cutting/schema'
import { orders, orderStyles } from '@/modules/orders/schema'

import type { SeedContext, SeedSlice } from './types'

/** Pieces of each size in ONE ply. The marker's identity — changing it makes a new marker. */
const SIZE_RATIO: Record<string, number> = { S: 1, M: 2, L: 2, XL: 1 }
const MARKER_LENGTH = 6.4
const MARKER_CODE = 'MK-SH4471-A'

/** One spread. `shortfall` is how many pieces of `shortSize` failed to come off the table. */
const LAYS = [
  { no: 'LAY-0041', colour: 'Navy', plies: 60, shade: 'A', cutOn: -6, shortSize: null, shortfall: 0 },
  { no: 'LAY-0042', colour: 'Navy', plies: 60, shade: 'A', cutOn: -4, shortSize: null, shortfall: 0 },
  { no: 'LAY-0043', colour: 'Navy', plies: 55, shade: 'B', cutOn: -2, shortSize: 'M', shortfall: 18 },
] as const

export const CUTTING_SLICE: SeedSlice = {
  id: 'cutting',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const short = ctx.companyId.slice(0, 8)
    const counts: Record<string, number> = {}

    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))
      .limit(1)
    if (!order) return counts

    const [style] = await ctx.db
      .select({ id: orderStyles.id, styleCode: orderStyles.styleCode })
      .from(orderStyles)
      .where(eq(orderStyles.orderId, order.id))
      .limit(1)
    if (!style) return counts

    // ── The marker ───────────────────────────────────────────────────────────
    await ctx.db
      .insert(markers)
      .values({
        companyId: ctx.companyId,
        code: MARKER_CODE,
        styleCode: style.styleCode,
        sizeRatio: SIZE_RATIO,
        efficiencyPct: '84.60',
        fabricWidthInches: '58.00',
        layLengthMeters: MARKER_LENGTH.toFixed(2),
        createdBy: `seed-${short}-production`,
      })
      .onConflictDoNothing()
    counts.markers = 1

    // Scoped to the company: every tenant seeds a MK-SH4471-A of its own, and an unscoped
    // match here handed a second tenant the FIRST tenant's marker id — lays pointing across
    // the tenancy wall.
    const [marker] = await ctx.db
      .select({ id: markers.id })
      .from(markers)
      .where(and(eq(markers.companyId, ctx.companyId), eq(markers.code, MARKER_CODE)))
    if (!marker) return counts

    // Rolls the store issued against this order. A lay may draw nothing else — the
    // issued-fabric gate refuses it — so the seeded lays draw from the same set a cutter
    // would be offered, and the floor chain reconciles end to end: received → issued →
    // spread → cut → bundled.
    const { issueLines, issues } = await import('@/modules/store/schema')
    const issuedRolls = await ctx.db
      .select({ rollId: issueLines.rollId })
      .from(issueLines)
      .innerJoin(issues, eq(issues.id, issueLines.issueId))
      .where(eq(issues.orderId, order.id))
    const drawable = issuedRolls.map((r) => r.rollId).filter((id): id is string => id !== null)

    // ── Lays, reports and bundles ────────────────────────────────────────────
    let layCount = 0
    let reportCount = 0
    let bundleCount = 0
    // Metres, in exact decimal. Fabric drawn across three lays summed as doubles drifts,
    // and wastage percent is a number a factory argues about with its own owner.
    let drawnTotal = zeroQty('m')
    let markerTotal = zeroQty('m')

    let rollCursor = 0

    for (const spec of LAYS) {
      // Also company-scoped: lay numbers repeat across tenants by design (each gets the
      // same three), and a global match meant the second tenant seeded zero lays.
      const existing = await ctx.db
        .select({ id: lays.id })
        .from(lays)
        .where(and(eq(lays.companyId, ctx.companyId), eq(lays.layNo, spec.no)))
      if (existing.length > 0) continue

      // What the marker says this spread consumes, and what the floor actually drew. The
      // gap between them IS the wastage figure — it is not stored on the lay twice.
      const markerConsumption = multiplyQty(quantity(MARKER_LENGTH.toFixed(2), 'm'), spec.plies)
      // 3.4% over the marker plan — real, unremarkable, and the figure the wastage screen
      // reports against a 3.0% plan.
      const drawn = multiplyQty(markerConsumption, '1.034')
      markerTotal = addQty(markerTotal, markerConsumption)
      drawnTotal = addQty(drawnTotal, drawn)

      // Two or three rolls per lay, taken in order so no roll is on two tables at once.
      const rollsDrawn = drawable.slice(rollCursor, rollCursor + 3)
      rollCursor += rollsDrawn.length

      const [lay] = await ctx.db
        .insert(lays)
        .values({
          companyId: ctx.companyId,
          orderId: order.id,
          orderStyleId: style.id,
          markerId: marker.id,
          layNo: spec.no,
          color: spec.colour,
          plies: spec.plies,
          layLengthMeters: MARKER_LENGTH.toFixed(2),
          rollsDrawn,
          fabricDrawnMeters: drawn.value,
          status: 'cut',
          createdBy: `seed-${short}-production`,
        })
        .returning({ id: lays.id })
      if (!lay) continue
      layCount += 1

      // Cells are plies × ratio, less any shortfall on the one size that came up short.
      const cells: Record<string, number> = {}
      for (const [size, perPly] of Object.entries(SIZE_RATIO)) {
        const expected = perPly * spec.plies
        // "Colour|Size" — the separator `cutting/zod.ts` validates and `parseCells` splits
        // on. A seed writing `/` produces rows the product's own schema would refuse.
        cells[`${spec.colour}|${size}`] =
          spec.shortSize === size ? expected - spec.shortfall : expected
      }

      const [report] = await ctx.db
        .insert(cutReports)
        .values({
          companyId: ctx.companyId,
          layId: lay.id,
          cells,
          breakdownRevision: 1,
          tolerancePct: '2.00',
          variances: spec.shortSize
            ? [
                {
                  cell: `${spec.colour}|${spec.shortSize}`,
                  expected: SIZE_RATIO[spec.shortSize]! * spec.plies,
                  actual: SIZE_RATIO[spec.shortSize]! * spec.plies - spec.shortfall,
                  // 18 short of 110 is 16.4% — well outside the 2% the report allows, so
                  // this is the one a supervisor has to accept or re-cut.
                  withinTolerance: false,
                },
              ]
            : [],
          createdBy: `seed-${short}-production`,
        })
        .returning({ id: cutReports.id })
      if (!report) continue
      reportCount += 1

      // Bundles of 30 — the tie size a bundle boy can actually carry.
      for (const [cell, qty] of Object.entries(cells)) {
        // '|' — the separator the cells above are written with. '/' here produced bundles
        // sized "undefined" the one time the loop got this far.
        const size = cell.split('|')[1]!
        const full = Math.floor(qty / 30)
        const remainder = qty % 30
        const sizes = [...Array<number>(full).fill(30), ...(remainder > 0 ? [remainder] : [])]

        for (const [index, bundleQty] of sizes.entries()) {
          const bundleNo = `${spec.no}-${size}-${String(index + 1).padStart(2, '0')}`
          await ctx.db
            .insert(bundles)
            .values({
              companyId: ctx.companyId,
              cutReportId: report.id,
              bundleNo,
              color: spec.colour,
              size,
              qty: bundleQty,
              // Distinct from the row id on purpose: a photographed ticket must not leak
              // an internal identifier.
              qrToken: `bdl_${short}_${spec.no}_${size}_${index + 1}`,
              status: spec.cutOn <= -4 ? 'in_sewing' : 'created',
            })
            .onConflictDoNothing()
          bundleCount += 1
        }
      }
    }

    counts.lays = layCount
    counts.cut_reports = reportCount
    counts.bundles = bundleCount

    // ── Wastage, recomputed rather than accumulated ──────────────────────────
    if (layCount > 0) {
      const over = subtractQty(drawnTotal, markerTotal)
      // A RATIO of two exact quantities, not a quantity — percentages have no unit and
      // `lib/quantity` has no divide, because dividing metres by metres does not produce
      // metres. The operands stayed exact all the way here; only the ratio is a float, and
      // it is stored rounded to two places like every other percent in the schema.
      // eslint-disable-next-line fabricxai/no-float-money
      const wastagePct = (Number(over.value) / Number(markerTotal.value)) * 100
      await ctx.db
        .insert(cutWastage)
        .values({
          companyId: ctx.companyId,
          orderId: order.id,
          fabricDrawn: drawnTotal.value,
          markerConsumption: markerTotal.value,
          wastagePct: wastagePct.toFixed(2),
          unit: 'm',
        })
        .onConflictDoNothing()
      counts.cut_wastage = 1
    }

    return counts
  },
}
