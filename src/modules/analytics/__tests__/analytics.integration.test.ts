/**
 * 11.2 integration.
 *
 * The pure rules are in `analytics.test.ts`. What is asserted here is the behaviour of the
 * dashboard as a whole — the parts where an owner would be misled rather than merely
 * inconvenienced:
 *
 *  - a period figure is one ratio, not the mean of the daily ones, computed over real rows;
 *  - a figure that cannot honestly be produced comes back `unavailable` WITH a reason, and
 *    never as a zero;
 *  - the exceptions feed keeps `since` across refreshes, so age means something;
 *  - a cleared exception is resolved, not forgotten;
 *  - the refresher never resolves a kind it does not scan;
 *  - the feed reports its own coverage;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import '@/modules/analytics/register'
import {
  buyerScorecards,
  cash,
  dhuTrend,
  efficiencyTrend,
  exceptions,
  orderBook,
  otd,
  type AnalyticsPolicy,
} from '@/modules/analytics/queries'
import { exceptionsFeed } from '@/modules/analytics/schema'
import { buyers } from '@/modules/buyers/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { orderStyles, orders } from '@/modules/orders/schema'
import { lines } from '@/modules/planning/schema'
import { efficiencyDaily } from '@/modules/production/schema'
import { dhuDaily } from '@/modules/quality/schema'
import { shipments } from '@/modules/shipment/schema'
import { refreshExceptionsFeed } from '@/worker/processors/exceptions-feed'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `ana-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['owner'] }

const POLICY: AnalyticsPolicy = {
  ttlSeconds: 300,
  minShipmentsForOtd: 5,
  scorecard: { minOrders: 5, weights: { otd: 0.5, dhu: 0.3, margin: 0.2 } },
  trend: { minPoints: 4, thresholdPct: '2' },
}

const WINDOW = { from: '2026-03-01', to: '2026-03-31' }
const NOW = new Date('2026-03-20T09:00:00Z')

let buyerId: string
let lineId: string
let orderId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Ana Co', slug: `ana-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Owner' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const [line] = await db
    .insert(lines)
    .values({ companyId: COMPANY, code: 'L1', name: 'Line 1', capacityManpower: 40 })
    .returning({ id: lines.id })
  lineId = line!.id

  const [order] = await db
    .insert(orders)
    .values({
      companyId: COMPANY,
      buyerId,
      poNumbers: ['PO-ANA-1'],
      currency: 'USD',
      plannedExFactoryDate: '2026-04-30',
      status: 'in_production',
    })
    .returning({ id: orders.id })
  orderId = order!.id

  await db.insert(orderStyles).values({
    companyId: COMPANY,
    orderId,
    styleCode: 'TS-100',
    contractedQty: 12_000,
    unitPrice: '4.50',
    currency: 'USD',
  })
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

beforeEach(async () => {
  await db.delete(exceptionsFeed).where(eq(exceptionsFeed.companyId, COMPANY))
  await db.delete(efficiencyDaily).where(eq(efficiencyDaily.companyId, COMPANY))
  await db.delete(dhuDaily).where(eq(dhuDaily.companyId, COMPANY))
  await db.delete(shipments).where(eq(shipments.companyId, COMPANY))
})

describe('11.2 · a period figure is one ratio', () => {
  it('sums the minutes rather than averaging the daily percentages', async () => {
    await db.insert(efficiencyDaily).values([
      // A near-perfect day on which almost nothing was made…
      {
        companyId: COMPANY,
        lineId,
        forDate: '2026-03-02',
        earnedMinutes: '900.00',
        availableMinutes: '1000.00',
        efficiencyPct: '90.00',
        outputTotal: 100,
      },
      // …and the day that actually carried the month.
      {
        companyId: COMPANY,
        lineId,
        forDate: '2026-03-03',
        earnedMinutes: '9000.00',
        availableMinutes: '20000.00',
        efficiencyPct: '45.00',
        outputTotal: 5_000,
      },
    ])

    const trend = await efficiencyTrend(ctx, WINDOW, POLICY)

    // 9,900 / 21,000 = 47.14%. The mean of the two days is 67.50% — twenty points of
    // flattery, produced entirely by the quiet day.
    expect(trend.period.value).toBe('47.14')
    expect(trend.period.value).not.toBe('67.50')
    expect(trend.points.map((p) => p.pct)).toEqual(['90.00', '45.00'])
  })

  it('says a shut factory has no efficiency, rather than 0%', async () => {
    const trend = await efficiencyTrend(ctx, WINDOW, POLICY)

    // Reporting 0% puts the factory at the bottom of a league table it is not in.
    expect(trend.period.value).toBeUndefined()
    expect(trend.period.unavailable).toMatch(/no available minutes/)
  })

  it('does the same for DHU, and reads a falling series as improving', async () => {
    await db.insert(dhuDaily).values([
      { companyId: COMPANY, lineId, dhuDate: '2026-03-01', defects: 50, checked: 500, dhu: '10.00' },
      { companyId: COMPANY, lineId, dhuDate: '2026-03-02', defects: 40, checked: 500, dhu: '8.00' },
      { companyId: COMPANY, lineId, dhuDate: '2026-03-03', defects: 20, checked: 500, dhu: '4.00' },
      { companyId: COMPANY, lineId, dhuDate: '2026-03-04', defects: 10, checked: 500, dhu: '2.00' },
    ])

    const trend = await dhuTrend(ctx, WINDOW, POLICY)

    // 120 defects over 2,000 checked = 6.00.
    expect(trend.period.value).toBe('6.00')
    // Falling DHU is a factory getting better, not worse.
    expect(trend.direction).toBe('improving')
  })
})

describe('11.2 · a percentage needs a denominator worth having', () => {
  const ship = async (planned: string, actual: string, partialNo: number) => {
    await db.insert(shipments).values({
      companyId: COMPANY,
      orderId,
      partialNo,
      plannedExFactory: planned,
      actualExFactory: actual,
    })
  }

  it('withholds the percentage below the minimum, and returns the counts', async () => {
    await ship('2026-03-10', '2026-03-10', 1)
    await ship('2026-03-12', '2026-03-15', 2)

    const result = await otd(ctx, WINDOW, POLICY)

    expect(result.shipments).toBe(2)
    expect(result.onTime).toBe(1)
    // Two shipments, one late, is not "50% on-time delivery" — it is two shipments.
    expect(result.pct.value).toBeUndefined()
    expect(result.pct.unavailable).toMatch(/too few/)
  })

  it('states it once there are enough shipments, counting the date itself as on time', async () => {
    for (let i = 1; i <= 5; i += 1) await ship('2026-03-10', '2026-03-10', i)

    const result = await otd(ctx, WINDOW, POLICY)
    // Every one left ON its date. The commitment is the date, not the day before it.
    expect(result.pct.value).toBe('100.00')
  })

  it('ignores shipments that have not left yet', async () => {
    for (let i = 1; i <= 5; i += 1) await ship('2026-03-10', '2026-03-10', i)
    await db.insert(shipments).values({
      companyId: COMPANY,
      orderId,
      partialNo: 99,
      plannedExFactory: '2026-03-25',
      actualExFactory: null,
    })

    const result = await otd(ctx, WINDOW, POLICY)
    // Counting an unshipped commitment as late reports the future as a failure.
    expect(result.shipments).toBe(5)
    expect(result.pct.value).toBe('100.00')
  })
})

describe('11.2 · buyer scorecards keep the unrated', () => {
  it('returns a new buyer unrated with a reason, rather than dropping or scoring them', async () => {
    const cards = await buyerScorecards(ctx, WINDOW, POLICY)
    const card = cards.find((c) => c.buyerId === buyerId)!

    // One order. Dropping them would make the list look like the whole book, and the newest
    // buyers are exactly the ones an owner is deciding about.
    expect(card.rated).toBe(false)
    expect(card.score).toBeNull()
    // `orders?` — the reason says "1 order" and "4 orders". The assertion is that it
    // names what is missing, not that it is always plural.
    expect(card.reason).toMatch(/orders?/)
  })
})

describe('11.2 · the exceptions feed', () => {
  const lapsedLc = async () => {
    const { lcs } = await import('@/modules/commercial/schema')
    const [lc] = await db
      .insert(lcs)
      .values({
        companyId: COMPANY,
        buyerId,
        number: `LC-${randomUUID().slice(0, 8)}`,
        value: '100000.00',
        currency: 'USD',
        latestShipmentDate: '2026-03-01',
        expiryDate: '2026-03-20',
        status: 'active',
      })
      .returning({ id: lcs.id })
    return lc!.id
  }

  it('opens a row and reports which kinds it actually scanned', async () => {
    const lcId = await lapsedLc()

    try {
      const result = await refreshExceptionsFeed(ctx, '2026-03-10')
      expect(result.opened).toBeGreaterThanOrEqual(1)

      const feed = await exceptions(ctx, NOW, POLICY)
      expect(feed.exceptions.some((e) => e.ref === lcId)).toBe(true)

      // Two of the six kinds have no source wired. An owner seeing no payroll anomalies
      // must be able to tell that from nobody having looked.
      expect(feed.coverage.payroll_anomaly).toBe(false)
      expect(feed.coverage.lc_conflict).toBe(true)
    } finally {
      const { lcs } = await import('@/modules/commercial/schema')
      await db.delete(lcs).where(eq(lcs.id, lcId))
    }
  })

  it('KEEPS `since` across refreshes, so age means something', async () => {
    const lcId = await lapsedLc()

    try {
      await refreshExceptionsFeed(ctx, '2026-03-10')
      const [first] = await db
        .select()
        .from(exceptionsFeed)
        .where(eq(exceptionsFeed.ref, lcId))

      await refreshExceptionsFeed(ctx, '2026-03-10')
      const [second] = await db
        .select()
        .from(exceptionsFeed)
        .where(eq(exceptionsFeed.ref, lcId))

      // Recomputing this every five minutes would make every exception permanently new,
      // and "open for nine days" is the part an owner acts on.
      expect(second!.since.getTime()).toBe(first!.since.getTime())
      expect(second!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first!.lastSeenAt.getTime())
    } finally {
      const { lcs } = await import('@/modules/commercial/schema')
      await db.delete(lcs).where(eq(lcs.id, lcId))
    }
  })

  it('resolves what cleared rather than forgetting it', async () => {
    const lcId = await lapsedLc()
    await refreshExceptionsFeed(ctx, '2026-03-10')

    const { lcs } = await import('@/modules/commercial/schema')
    await db.delete(lcs).where(eq(lcs.id, lcId))

    await refreshExceptionsFeed(ctx, '2026-03-10')

    const [row] = await db.select().from(exceptionsFeed).where(eq(exceptionsFeed.ref, lcId))
    // Kept with a resolution time — a feed that forgets cannot answer "how long was that
    // open", which is the question asked afterwards.
    expect(row).toBeDefined()
    expect(row!.resolvedAt).not.toBeNull()

    const feed = await exceptions(ctx, NOW, POLICY)
    expect(feed.exceptions.some((e) => e.ref === lcId)).toBe(false)
  })

  it('NEVER resolves a kind it does not scan', async () => {
    // A payroll anomaly, put there by something this refresher has no source for.
    const [planted] = await db
      .insert(exceptionsFeed)
      .values({
        companyId: COMPANY,
        kind: 'payroll_anomaly',
        ref: randomUUID(),
        detail: { note: 'from a source 11.2 does not scan yet' },
        severity: 'high',
      })
      .returning({ id: exceptionsFeed.id })

    await refreshExceptionsFeed(ctx, '2026-03-10')

    const [row] = await db.select().from(exceptionsFeed).where(eq(exceptionsFeed.id, planted!.id))
    // A blanket "resolve everything not seen" would report it as fixed on the strength of
    // never having looked.
    expect(row!.resolvedAt).toBeNull()
  })

  it('keeps an exception whose detail will not parse', async () => {
    const ref = randomUUID()
    await db.insert(exceptionsFeed).values({
      companyId: COMPANY,
      kind: 'payroll_anomaly',
      ref,
      // Nested, where the feed stores scalars — what an older writer or a hand-run
      // UPDATE leaves behind. The dashboard renders this line as prose.
      detail: { worker: { id: 'w-1', name: 'Rima' } },
      severity: 'high',
    })

    const feed = await exceptions(ctx, NOW, POLICY)
    const row = feed.exceptions.find((e) => e.ref === ref)

    // The exception is real whether or not its explanation survived. Dropping the
    // row would hide a payroll anomaly because a JSON shape drifted.
    expect(row, 'a malformed detail must not remove the exception').toBeDefined()
    expect(row!.severity).toBe('high')
    // Null, not `{}` — the screen must be able to tell "nothing to say" from
    // "something I could not read", and never print [object Object].
    expect(row!.detail).toBeNull()

    await db.delete(exceptionsFeed).where(eq(exceptionsFeed.ref, ref))
  })

  it('another company sees none of it', async () => {
    const lcId = await lapsedLc()
    try {
      await refreshExceptionsFeed(ctx, '2026-03-10')
      const feed = await exceptions(otherCtx, NOW, POLICY)
      expect(feed.exceptions).toEqual([])
    } finally {
      const { lcs } = await import('@/modules/commercial/schema')
      await db.delete(lcs).where(eq(lcs.id, lcId))
    }
  })
})

describe('11.2 · the rest of the dashboard', () => {
  it('reports the order book by status', async () => {
    const book = await orderBook(ctx)
    expect(book.totalOrders).toBeGreaterThanOrEqual(1)
    expect(book.byStatus.find((s) => s.status === 'in_production')!.pieces).toBe(12_000)
  })

  it('nets cash in one currency and refuses to mix them', async () => {
    const position = await cash(ctx, 'USD')
    expect(position.net.currency).toBe('USD')
    // Nothing outstanding in this fixture — an empty position is zero, which is a real
    // answer rather than an error.
    expect(position.net.amount).toBe('0.00')
  })

  it('another company sees an empty order book', async () => {
    expect((await orderBook(otherCtx)).totalOrders).toBe(0)
  })
})
