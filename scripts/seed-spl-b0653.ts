/**
 * One real order, from the merchandiser's own working papers.
 *
 * `pnpm tsx scripts/seed-spl-b0653.ts --slug=<tenant>`
 *
 * ## Why this seed exists next to the other four
 *
 * `seed-running-factory` invents three plausible orders. This one invents nothing: every
 * figure below is transcribed from the purchase order, the pre-order fabric sheet, the
 * in-house check list and the sample requisition the merchandising department actually
 * works from — the same papers the 2026-08-22 design canvas was drawn against. It exists
 * so the screens built from those papers can be looked at holding the paper.
 *
 * The order is SPL 27-1-91171, style B0653 (a button-through blouse), 20,000 pieces at
 * USD 2.96, and it exercises nearly every feature the merchandiser round shipped:
 *
 *   · **Two drops, not one.** The PO's three lines carry two different latest-ship dates
 *     — 8,000 pcs on 08 Oct and 12,000 on 15 Oct. One `planned_ex_factory_date` cannot say
 *     that, which is exactly why `order_drops` exists.
 *   · **A third axis on the grid.** Cream appears in BOTH drops at the same sizes, so
 *     Cream/12 is two cells, not one. This is the `variant` column's whole reason for
 *     being, and this order is the case that motivated it.
 *   · **Inputs that are words, not dates.** The check list's PP column for this style
 *     reads "REPEATED" — it is a repeat of a style already approved — and a zipper column
 *     that is blank because a button-through blouse has no zipper. A cell that only took
 *     dates could hold neither.
 *   · **Fabric with a life.** Kaiming mill via the agent, ex-mill 12 Aug, on board no
 *     later than 17 Aug, 18,200 m at USD 0.84. Seven legs, and the slip is visible.
 *   · **A colour chain per colourway.** The fabric sheet's own key dates: lab dip at X−7,
 *     bulk dye lots at X−20, per colour.
 *   · **A requisition that answers itself.** The PP sample's trims, with the one line the
 *     room substituted — the fusing paper — recorded as such.
 *
 * Idempotent by PO number, like every other seed here: re-running leaves the order alone.
 *
 * **On the data.** This is the tenant's own commercial paperwork going into the tenant's
 * own database. No personal names, phone numbers or bank details from those files are
 * reproduced anywhere in this script — only the trade facts the product is built to hold.
 */
import 'dotenv/config'
// Importing the registry IS registration — without it `propose()` refuses every target.
import '@/modules/registry'

import { and, eq, sql } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles as rolesTable } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { scoped } from '@/modules/core/scoped'
import { withTenantRead, withTenantTx } from '@/modules/core/tenancy'
import { orders, orderStyles } from '@/modules/orders/schema'
import {
  createOrder,
  findTemplateForProductType,
  generateTna,
  refreshMilestoneStatuses,
  saveBreakdown,
  saveDrops,
  seedDefaultTnaTemplates,
  setColourApproval,
  setFabricLeg,
  setInputCell,
  setOrderStatus,
} from '@/modules/orders/service'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')

const SLUG = flag('slug') ?? 'test-textile'

// ─────────────────────────────────────────────────────────────────────────────
// The papers, transcribed
// ─────────────────────────────────────────────────────────────────────────────

/** The buyer as the PO heads it, and the label it ships under. */
const BUYER = { code: 'SPL', name: 'Shields Protection Ltd', country: 'GB' }

const PO = '27-1-91171'
/** The buyer's own PO number, which travels on every document they send back. */
const CUSTOMER_PO = '180532'
const STYLE = 'B0653'
const DESCRIPTION = 'LDS Blouse Button Through · Roma Plain Airflow, 100% polyester'
const UNIT_PRICE = '2.96'
const TOTAL_QTY = 20_000
const TOTAL_VALUE = '59200.00'

/** The PO's own order date — carried on the booking leg's note, since orders have no such column. */
const ORDER_DATE = '2026-08-03'
/** The last of the two drops — the date the order as a whole must be clear by. */
const EX_FACTORY = '2026-10-15'

const SIZES = ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24'] as const

/**
 * The PO's three lines, by size run.
 *
 * Lines 1 and 2 are both Cream and both this style; they differ only in which drop they
 * ship on. That is the third axis: without `variant` they would collide on the grid's
 * unique key, and the second one would be refused as a duplicate.
 */
const LINES = [
  {
    color: 'Cream',
    customerStyle: '4203010 H01',
    variant: 'Drop 1',
    qty: [160, 640, 1120, 1680, 1920, 1280, 640, 320, 160, 80],
    lsd: '2026-10-08',
  },
  {
    color: 'Cream',
    customerStyle: '4203010 H01',
    variant: 'Drop 2',
    qty: [80, 320, 560, 840, 960, 640, 320, 160, 80, 40],
    lsd: '2026-10-15',
  },
  {
    color: 'Pink',
    customerStyle: '4203010 J05',
    variant: 'Drop 2',
    qty: [160, 640, 1120, 1680, 1920, 1280, 640, 320, 160, 80],
    lsd: '2026-10-15',
  },
] as const

/**
 * The in-house check list's row for this style, category by category.
 *
 * A cell holds a date, a word or nothing — the three things the paper cell holds, which is
 * why the state and the note travel together. `not_applicable` means the category does not
 * apply to this garment and the roll-up must not count it against the order: a
 * button-through blouse has no zipper and no hook-and-bar, and scoring it 10/12 for that
 * would be a lie the spreadsheet never told.
 */
const INPUTS: {
  category: string
  state: 'pending' | 'booked' | 'in_house' | 'not_applicable'
  planDate?: string
  actualDate?: string
  note?: string
}[] = [
  // "REPEATED" is what the sheet says: the PP of a style already approved, carried over.
  // It goes in the note, because the note is where the sheet's WORDS live — the cell
  // itself is satisfied, and a plan date invented for it would be a date nobody agreed.
  { category: 'pp', state: 'in_house', note: 'REPEATED — PP carried over from SS-26 B0653' },
  { category: 'fabric', state: 'booked', planDate: '2026-09-16' },
  { category: 'pocketing', state: 'booked', planDate: '2026-09-16' },
  { category: 'thread', state: 'booked', planDate: '2026-09-16' },
  { category: 'labels', state: 'booked', planDate: '2026-09-16' },
  {
    category: 'elastic',
    state: 'booked',
    planDate: '2026-09-16',
    note: '0.7cm tunnel and shirring elastic',
  },
  { category: 'hook_bar', state: 'not_applicable' },
  { category: 'zipper', state: 'not_applicable' },
  { category: 'buttons', state: 'booked', planDate: '2026-09-16', note: '28L horn' },
  { category: 'hangtag', state: 'booked', planDate: '2026-09-26' },
  { category: 'barcode', state: 'booked', planDate: '2026-09-26' },
  {
    category: 'poly_carton',
    state: 'pending',
    note: 'after PPM we will get the poly measurements',
  },
]

/**
 * The pre-order fabric sheet's own dates, as seven legs.
 *
 * The sheet gives two: "Ex Mill 12/08" and "On Board NO later than 17/08". Everything
 * between and after is the merchandiser's own chase plan, which is what this screen is
 * for. The vessel actually sailed two days late — the kind of slip that only shows when
 * the legs are kept apart, and the reason the trail exists at all.
 */
const FABRIC_LEGS: {
  leg: string
  planDate?: string
  actualDate?: string
  note?: string
}[] = [
  {
    leg: 'booking_placed',
    planDate: ORDER_DATE,
    actualDate: ORDER_DATE,
    note: `PO dated ${ORDER_DATE} · Kaiming mill through the agent · 18,200 m @ USD 0.84 · 120-day LC`,
  },
  { leg: 'pi_received', planDate: '2026-08-06', actualDate: '2026-08-07' },
  { leg: 'ex_mill', planDate: '2026-08-12', actualDate: '2026-08-12', note: 'ex-mill per the sheet' },
  {
    leg: 'on_vessel',
    planDate: '2026-08-17',
    actualDate: '2026-08-19',
    note: 'sheet says on board no later than 17/08 — sailed on the 19th',
  },
  { leg: 'at_port', planDate: '2026-09-08' },
  { leg: 'customs_cleared', planDate: '2026-09-12' },
  { leg: 'in_house', planDate: '2026-09-16', note: 'store GRN is the truth of in-house' },
]

/**
 * The fabric sheet's key dates, per colourway: lab dip at X−7, bulk dye lots at X−20.
 * Cream is a repeat from AW26 and cleared early; Pink is a repeat from SS26 option C and
 * its shade band is still out — the state a merchandiser needs to see before cutting.
 */
const COLOURS: {
  color: string
  stage: string
  status: 'pending' | 'sent' | 'approved' | 'rejected'
  decidedOn?: string
  note?: string
}[] = [
  { color: 'Cream', stage: 'lab_dip', status: 'approved', decidedOn: '2026-08-10', note: 'repeat from AW26' },
  { color: 'Cream', stage: 'bulk_lot', status: 'approved', decidedOn: '2026-08-24' },
  { color: 'Cream', stage: 'shade_band', status: 'approved', decidedOn: '2026-09-02' },
  { color: 'Pink', stage: 'lab_dip', status: 'approved', decidedOn: '2026-08-11', note: 'repeat from SS26 option C' },
  { color: 'Pink', stage: 'bulk_lot', status: 'approved', decidedOn: '2026-08-26' },
  { color: 'Pink', stage: 'shade_band', status: 'sent', note: 'with the buyer — cutting Pink waits on this' },
]

/**
 * The PP sample's requisition, off the sample request sheet's own trim rows.
 *
 * One line answers differently from how it was asked: the room had no P777 fusing and used
 * what it had. That substitution is the reason this column exists — six weeks later, when
 * the buyer comments on the placket, this is the line that explains it.
 */
const REQUISITION = [
  { material: 'Main fabric — Roma Plain Airflow', spec: '100% polyester, 160 g/m, 145 cm', qty: '12', unit: 'm', used: 'as_specified', substituteNote: '' },
  { material: 'Fusing paper', spec: 'P777, placket only', qty: '2', unit: 'm', used: 'substituted', substituteNote: 'P777 out of stock — used P550, same weight class' },
  { material: 'Button', spec: '28L horn', qty: '48', unit: 'pcs', used: 'as_specified', substituteNote: '' },
  { material: 'Sewing thread', spec: 'DTM', qty: '6', unit: 'cone', used: 'as_specified', substituteNote: '' },
  { material: 'Elastic', spec: '0.7cm tunnel and shirring', qty: '5', unit: 'm', used: 'as_specified', substituteNote: '' },
  { material: 'Main / size / care label', spec: 'as per approved artwork', qty: '4', unit: 'set', used: 'pending', substituteNote: '' },
  { material: 'Hanger loop', spec: 'DTM', qty: '4', unit: 'pcs', used: 'as_specified', substituteNote: '' },
]

async function main(): Promise<void> {
  const client = createDirectClient()
  const db = createDirectDb(client)

  try {
    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.slug, SLUG))
    if (!company) throw new Error(`no company with slug "${SLUG}"`)

    const [owner] = await db
      .select({ userId: rolesTable.userId })
      .from(rolesTable)
      .where(and(eq(rolesTable.companyId, company.id), eq(rolesTable.role, 'owner')))
    if (!owner) throw new Error(`company ${company.name} has no owner`)

    const ctx: RequestCtx = {
      companyId: company.id,
      userId: owner.userId,
      roles: ['owner', 'merchandiser', 'commercial', 'planner', 'quality'],
    }

    console.log(`[b0653] ${company.name} (${company.id})`)

    // ── the buyer ─────────────────────────────────────────────────────────────
    const [buyerRow] = await withTenantTx(ctx, (tx) =>
      tx
        .insert(buyers)
        .values({
          companyId: ctx.companyId,
          code: BUYER.code,
          name: BUYER.name,
          country: BUYER.country,
          createdBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [buyers.companyId, buyers.code],
          set: { name: BUYER.name, country: BUYER.country },
        })
        .returning({ id: buyers.id }),
    )
    const buyerId = buyerRow!.id
    console.log(`[b0653] buyer ${BUYER.name} (${BUYER.code})`)

    await seedDefaultTnaTemplates(ctx)

    // ── the order, idempotent by PO ───────────────────────────────────────────
    const [existing] = await withTenantRead(ctx, (tx) =>
      tx
        .select({ id: orders.id })
        .from(orders)
        .where(scoped(orders, ctx, sql`${orders.poNumbers} @> ARRAY[${PO}]::text[]`)),
    )

    let orderId: string
    if (existing) {
      orderId = existing.id
      console.log(`[b0653] ${PO} already booked, left alone — filling the dossier around it`)
    } else {
      const created = await createOrder(ctx, {
        order: {
          buyerId,
          // Both numbers travel: ours and the buyer's own, which is what their emails quote.
          poNumbers: [PO, CUSTOMER_PO],
          totalValue: TOTAL_VALUE,
          currency: 'USD',
          plannedExFactoryDate: EX_FACTORY,
        },
        styles: [
          {
            styleCode: STYLE,
            description: DESCRIPTION,
            contractedQty: TOTAL_QTY,
            unitPrice: UNIT_PRICE,
            currency: 'USD',
          },
        ],
      })
      orderId = created.orderId
      console.log(`[b0653] booked ${PO} · ${TOTAL_QTY.toLocaleString()} pcs · USD ${TOTAL_VALUE}`)

      const template = await findTemplateForProductType(ctx, { productType: 'woven' })
      if (template) {
        await generateTna(ctx, { orderId, templateId: template.id, exFactoryDate: EX_FACTORY })
        console.log(`[b0653] TNA generated from "${template.name}" against ${EX_FACTORY}`)
      }

      await setOrderStatus(ctx, { orderId, status: 'in_production' })
    }

    const [style] = await withTenantRead(ctx, (tx) =>
      tx
        .select({ id: orderStyles.id })
        .from(orderStyles)
        .where(scoped(orderStyles, ctx, eq(orderStyles.orderId, orderId))),
    )
    if (!style) throw new Error('the order has no style row')

    // ── the grid, with its third axis ─────────────────────────────────────────
    const cells = LINES.flatMap((line) =>
      line.qty.map((qty, i) => ({
        color: line.color,
        size: SIZES[i]!,
        variant: line.variant,
        qty,
      })),
    )
    const pieces = cells.reduce((n, c) => n + c.qty, 0)
    await saveBreakdown(ctx, { orderStyleId: style.id, cells })
    console.log(
      `[b0653] breakdown · ${cells.length} cells across ${new Set(LINES.map((l) => l.color)).size} colours and 10 sizes · ${pieces.toLocaleString()} pcs`,
    )

    // ── the two drops the PO's latest-ship dates imply ────────────────────────
    const dropQty = (lsd: string): number =>
      LINES.filter((l) => l.lsd === lsd).reduce((n, l) => n + l.qty.reduce((a, b) => a + b, 0), 0)
    await saveDrops(ctx, {
      orderId,
      drops: [
        {
          dropNo: 1,
          qty: dropQty('2026-10-08'),
          shipDate: '2026-10-08',
          note: 'Cream only — the earlier retail window',
        },
        {
          dropNo: 2,
          qty: dropQty('2026-10-15'),
          shipDate: '2026-10-15',
          note: 'balance of Cream, and all of Pink',
        },
      ],
    })
    console.log(
      `[b0653] drops · ${dropQty('2026-10-08').toLocaleString()} on 08 Oct, ${dropQty('2026-10-15').toLocaleString()} on 15 Oct`,
    )

    // ── the in-house check list ───────────────────────────────────────────────
    for (const input of INPUTS) {
      await setInputCell(ctx, {
        orderId,
        category: input.category,
        state: input.state,
        planDate: input.planDate ?? null,
        actualDate: input.actualDate ?? null,
        note: input.note ?? null,
      })
    }
    const applicable = INPUTS.filter((i) => i.state !== 'not_applicable').length
    console.log(
      `[b0653] inputs · ${applicable} tracked, ${INPUTS.length - applicable} n/a (a button-through blouse has no zipper and no hook & bar)`,
    )

    // ── where the fabric is ───────────────────────────────────────────────────
    for (const leg of FABRIC_LEGS) {
      await setFabricLeg(ctx, {
        orderId,
        leg: leg.leg,
        planDate: leg.planDate ?? null,
        actualDate: leg.actualDate ?? null,
        note: leg.note ?? null,
      })
    }
    console.log('[b0653] fabric · seven legs from booking to store, vessel two days late')

    // ── the colour chain ──────────────────────────────────────────────────────
    for (const c of COLOURS) {
      await setColourApproval(ctx, {
        orderId,
        color: c.color,
        stage: c.stage,
        status: c.status,
        decidedOn: c.decidedOn ?? null,
        note: c.note ?? null,
      })
    }
    console.log('[b0653] colours · Cream cleared, Pink still out at shade band')

    // ── the PP sample and its requisition ─────────────────────────────────────
    await seedSample(ctx, orderId)

    await refreshMilestoneStatuses(ctx, {})
    console.log('\n[b0653] done.')
  } finally {
    await client.end()
  }
}

/**
 * The PP sample, and the requisition under it.
 *
 * A repeat order's PP is carried over rather than remade, which is what the check list's
 * "REPEATED" means — so the sample here is raised, run through the room and APPROVED,
 * and the requisition records what the room actually consumed making it.
 */
async function seedSample(ctx: RequestCtx, orderId: string): Promise<void> {
  const { advanceStage, createSampleRequest, recordFeedback, setSampleRequisition } = await import(
    '@/modules/sampling/service'
  )
  const { sampleRequests } = await import('@/modules/sampling/schema')

  const requestNo = `SR-${STYLE}-PP`
  const [already] = await withTenantRead(ctx, (tx) =>
    tx
      .select({ id: sampleRequests.id })
      .from(sampleRequests)
      .where(scoped(sampleRequests, ctx, eq(sampleRequests.requestNo, requestNo))),
  )

  let sampleRequestId: string
  if (already) {
    sampleRequestId = already.id
    console.log(`[b0653] sample ${requestNo} already there — refreshing its requisition only`)
  } else {
    const created = await createSampleRequest(ctx, {
      orderId,
      type: 'pp',
      styleCode: STYLE,
      requestNo,
      dueDate: '2026-08-20',
    })
    sampleRequestId = created.sampleRequestId

    for (const [i, stage] of (
      ['pattern', 'cutting', 'sewing', 'finishing', 'qc', 'dispatched'] as const
    ).entries()) {
      await advanceStage(ctx, {
        sampleRequestId,
        stage,
        occurredAt: new Date(`2026-08-${String(11 + i).padStart(2, '0')}T10:00:00Z`).toISOString(),
      })
    }

    await recordFeedback(ctx, {
      sampleRequestId,
      verdict: 'approved_with_comments',
      comments: [
        { area: 'placket', comment: 'fusing slightly stiff — check the bulk fusing against the spec' },
        { area: 'sleeve', comment: 'shirring even, keep as sample' },
      ],
      recordedOn: '2026-08-19',
    })
    console.log(`[b0653] sample ${requestNo} · approved with comments`)
  }

  await setSampleRequisition(ctx, { sampleRequestId, lines: REQUISITION })
  const substituted = REQUISITION.filter((l) => l.used === 'substituted').length
  console.log(
    `[b0653] requisition · ${REQUISITION.length} lines, ${substituted} substituted (the fusing paper)`,
  )
}

await main()
