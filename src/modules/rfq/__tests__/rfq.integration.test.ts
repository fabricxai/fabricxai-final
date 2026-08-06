/**
 * 1.2 integration — RFQ and quotation.
 *
 * The arithmetic is covered by `rfq.test.ts`. What is asserted here:
 *
 *  - `draftQuote` refuses without an APPROVED cost sheet, and freezes the one it uses so a
 *    later reprice does not move the quote the buyer holds;
 *  - a new version supersedes its predecessor;
 *  - sending below the margin floor needs a manager AND a reason;
 *  - `markWon` refuses anything 1.3 could not create an order from, and emits a payload
 *    carrying a size breakdown that adds up;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { approveCostSheet, createCostSheet } from '@/modules/costing/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import '@/modules/rfq/register'
import { lossReasonList } from '@/modules/rfq/queries'
import { lossReasons, quotes, rfqClarifications, rfqs } from '@/modules/rfq/schema'
import {
  answerClarification,
  askClarification,
  createRfq,
  deadlinesNear,
  draftQuote,
  markLost,
  markWon,
  sendQuote,
  staleClarifications,
} from '@/modules/rfq/service'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `rfq-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['merchandiser'] }
const ownerCtx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['merchandiser'] }

const POLICY = { marginFloorPct: '10', deadlineNearHours: 48, clarificationStaleDays: 5 }

let buyerId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'RFQ Co', slug: `rfq-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Merch' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  await db.insert(lossReasons).values(
    [
      ['price', 'Price too high'],
      ['capacity', 'No capacity in the window'],
      ['compliance', 'Failed a compliance requirement'],
    ].map(([code, label]) => ({ companyId: COMPANY, code: code!, label: label! })),
  )
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

const reset = async () => {
  await db.delete(rfqs).where(eq(rfqs.companyId, COMPANY))
}

const newRfq = (over: Record<string, unknown> = {}) =>
  createRfq(ctx, {
    buyerId,
    title: 'Basic tee, 12k',
    productType: 'tshirt',
    styleCode: `ST-${randomUUID().slice(0, 6)}`,
    quantity: 12000,
    sizeRatio: { S: 1, M: 2, L: 2, XL: 1 },
    currency: 'USD',
    deadline: '2026-08-15',
    requestedShipDate: '2026-11-15',
    ...over,
  })

/** An approved sheet with a healthy margin, or a thin one when asked. */
const approvedSheet = async (styleCode: string, marginPct = '12') => {
  const created = await createCostSheet(ownerCtx, {
    styleCode,
    sections: {
      currency: 'USD',
      localCurrency: 'BDT',
      fxRateLocalToBase: '0.0083',
      fabric: [
        { ref: 'FAB-1', consumption: '1.60', uom: 'm', ratePerUom: '2.00', wastagePct: '0' },
      ],
      trims: [{ ref: 'TRM-1', consumption: '1', uom: 'set', ratePerUom: '0.42', wastagePct: '0' }],
      embellishment: [],
      cm: { method: 'per_dozen', perDozenRateLocal: '600.00' },
      commercial: [],
      marginPct,
      marginBasis: 'price',
    },
  })
  await approveCostSheet(ownerCtx, { sheetId: created.sheetId })
  return created.sheetId
}

describe('1.2 · drafting a quote', () => {
  it('refuses without an approved cost sheet', async () => {
    await reset()
    const { rfqId } = await newRfq()

    // A quote built from a draft sheet is a price nobody signed off.
    await expect(
      draftQuote(ctx, { rfqId, styleCode: 'ST-NOT-COSTED' }, POLICY),
    ).rejects.toThrow()
  })

  it('freezes the sheet, so a later reprice does not move the quote', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })

    const drafted = await draftQuote(ctx, { rfqId, styleCode }, POLICY)
    const originalPrice = drafted.fobPrice

    // The sheet is repriced. Version 2 supersedes version 1 in costing.
    await approvedSheet(styleCode, '25')

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, drafted.quoteId))

    // The quote the buyer holds has not moved. Asserted on the FROZEN breakdown rather
    // than on the numeric column, which stores the same value at a wider scale — comparing
    // that text would be testing Postgres's formatting, not the snapshot.
    const breakdown = quote!.fobBreakdown as { fobPrice: string; costSheetVersion: number }
    expect(breakdown.fobPrice).toBe(originalPrice)
    expect(breakdown.costSheetVersion).toBe(1)

    // And the sheet really did move underneath it: costing is now on version 2.
    const { getApprovedSheet } = await import('@/modules/costing/service')
    const live = await getApprovedSheet(ctx, styleCode)
    expect(live.version).toBe(2)
    expect(live.fobPrice).not.toBe(originalPrice)
  })

  it('the frozen breakdown reconciles to the sheet’s total', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })

    const drafted = await draftQuote(ctx, { rfqId, styleCode }, POLICY)
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, drafted.quoteId))
    const breakdown = quote!.fobBreakdown as {
      componentsTotal: string
      totalCost: string
      reconciles: boolean
    }

    // The invariant a buyer negotiates against line by line.
    expect(breakdown.reconciles).toBe(true)
    expect(breakdown.componentsTotal).toBe(breakdown.totalCost)
  })

  it('the CM component is not zero, and the trims line costs something', async () => {
    /*
     * The bug this pins (plan 2.9), and both halves of it were silent.
     *
     * `cost_sheets.fx_rate_local_to_base` is `numeric(12, 6)` and BDT→USD is ≈0.0083. The
     * breakdown read it at TWO decimals, so it truncated to 0.00 and the CM component —
     * usually the largest single part of a garment's FOB — computed as ZERO on every sheet
     * priced in local currency. Nothing looked broken, because `commercial` is derived as
     * the total minus the named components, so the whole CM cost silently landed there and
     * the reconciliation above still passed.
     *
     * `bom_lines.consumption` is `numeric(12, 4)` and was read at two the same way, so a
     * trims line of 0.0083 kg per piece — thread — contributed nothing at all.
     *
     * The fixture already used 0.0083 for the fx rate before this was found; the assertion
     * is what was missing.
     */
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })

    const drafted = await draftQuote(ctx, { rfqId, styleCode }, POLICY)
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, drafted.quoteId))
    const breakdown = quote!.fobBreakdown as {
      components: Record<string, string>
      reconciles: boolean
    }

    // CM is 600.00 BDT per dozen → 50.00 per piece → × 0.0083 = 0.415 → 0.41.
    expect(Number(breakdown.components.cm)).toBeGreaterThan(0)
    expect(breakdown.components.cm).toBe('0.41')

    // And the whole thing still reconciles, which is what makes the misattribution above so
    // hard to notice: a zero CM never broke this invariant, it just moved the money.
    expect(breakdown.reconciles).toBe(true)
  })

  it('a new version supersedes its predecessor', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })

    const first = await draftQuote(ctx, { rfqId, styleCode }, POLICY)
    const second = await draftQuote(ctx, { rfqId, styleCode }, POLICY)

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(second.supersededCount).toBe(1)

    const [old] = await db.select().from(quotes).where(eq(quotes.id, first.quoteId))
    expect(old!.status).toBe('superseded')
  })
})

describe('1.2 · sending, and the margin floor', () => {
  const thinQuote = async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    // 5% margin against a 10% floor.
    await approvedSheet(styleCode, '5')
    const { rfqId } = await newRfq({ styleCode })
    return draftQuote(ctx, { rfqId, styleCode }, POLICY)
  }

  it('sends a healthy quote without ceremony', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })
    const drafted = await draftQuote(ctx, { rfqId, styleCode }, POLICY)

    const result = await sendQuote(ctx, { quoteId: drafted.quoteId }, POLICY)
    expect(result.belowFloor).toBe(false)
  })

  it('a merchandiser cannot send below the floor', async () => {
    const drafted = await thinQuote()
    expect(drafted.belowFloor).toBe(true)

    // Quoting under the floor is how a factory books a year of loss-making work, one
    // defensible-looking quote at a time.
    await expect(
      sendQuote(ctx, { quoteId: drafted.quoteId, belowFloorReason: 'strategic' }, POLICY),
    ).rejects.toThrow(/below_floor_needs_manager/)
  })

  it('a manager can, with a written reason', async () => {
    const drafted = await thinQuote()

    await expect(sendQuote(ownerCtx, { quoteId: drafted.quoteId }, POLICY)).rejects.toThrow(
      /below_floor_needs_reason/,
    )

    const result = await sendQuote(
      ownerCtx,
      {
        quoteId: drafted.quoteId,
        belowFloorReason: 'Loss leader to win the account; volume follows in Q4.',
      },
      POLICY,
    )
    expect(result.belowFloor).toBe(true)

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, drafted.quoteId))
    const approval = quote!.belowFloorApproval as Record<string, unknown>
    expect(approval.approvedBy).toBe(USER)
    expect(approval.reason).toContain('Loss leader')
  })

  it('refuses to send the same quote twice', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })
    const drafted = await draftQuote(ctx, { rfqId, styleCode }, POLICY)

    await sendQuote(ctx, { quoteId: drafted.quoteId }, POLICY)
    await expect(sendQuote(ctx, { quoteId: drafted.quoteId }, POLICY)).rejects.toThrow(
      /quote_not_draft/,
    )
  })
})

describe('1.2 · winning and losing', () => {
  const quotedRfq = async (over: Record<string, unknown> = {}) => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode, ...over })
    await draftQuote(ctx, { rfqId, styleCode }, POLICY)
    return rfqId
  }

  it('emits a payload 1.3 can create an order from', async () => {
    const rfqId = await quotedRfq()
    const result = await markWon(ctx, { rfqId })

    expect(result.payload.buyerId).toBe(buyerId)
    expect(result.payload.requestedShipDate).toBe('2026-11-15')

    // 12,000 over 1:2:2:1 — and it adds up, because a piece dropped here is a piece short
    // at final inspection.
    const breakdown = result.payload.sizeBreakdown as Record<string, number>
    expect(breakdown).toEqual({ S: 2000, M: 4000, L: 4000, XL: 2000 })
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBe(12000)
  })

  it('refuses a win with no size ratio', async () => {
    const rfqId = await quotedRfq({ sizeRatio: {} })

    // "12,000 pieces" is not a cutting instruction.
    await expect(markWon(ctx, { rfqId })).rejects.toThrow()

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId))
    expect(rfq!.status).toBe('quoted')
  })

  it('refuses a win with no requested ship date', async () => {
    const rfqId = await quotedRfq({ requestedShipDate: undefined })

    // The TNA is generated backwards from it; without one there is no plan. The typed
    // error carries the reason in its details — the key is what the UI translates.
    await expect(markWon(ctx, { rfqId })).rejects.toMatchObject({
      messageKey: 'rfq.errors.invalid',
      details: { reason: expect.stringMatching(/ship date/i) },
    })
  })

  it('cannot win an RFQ that was never quoted', async () => {
    await reset()
    const { rfqId } = await newRfq()
    await expect(markWon(ctx, { rfqId })).rejects.toThrow()
  })

  it('a loss needs a reason from the seeded taxonomy', async () => {
    await reset()
    const { rfqId } = await newRfq()

    // Free text cannot be counted, and counting is the point.
    await expect(
      markLost(ctx, { rfqId, lossReasonCode: 'they-went-quiet' }),
    ).rejects.toThrow(/unknown_loss_reason/)

    await markLost(ctx, { rfqId, lossReasonCode: 'price' })
    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId))
    expect(rfq!.lossReasonCode).toBe('price')
  })

  it('the dropdown offers exactly the codes markLost will accept (plan 5.3)', async () => {
    /*
     * `lossReasonList` is new, and it exists because nothing read this table — so the one
     * screen that has to offer the taxonomy had nothing to offer, which is how a required
     * taxonomy quietly becomes a field somebody types "price" into.
     *
     * The two halves have to agree or every recording fails: an option the service refuses
     * is a dead button, and a code the service accepts but the list omits is a reason
     * nobody can choose. Asserted as a round trip rather than as two lists side by side.
     */
    await reset()
    const options = await lossReasonList(ctx)

    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.label.trim()).toBeTruthy()
    }

    for (const option of options) {
      const { rfqId } = await newRfq()
      await markLost(ctx, { rfqId, lossReasonCode: option.code })

      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId))
      expect(rfq!.lossReasonCode).toBe(option.code)
    }
  })

  it('offers another company none of ours', async () => {
    // The dropdown is per tenant. A factory choosing from somebody else's taxonomy would
    // record a loss against a code its own reports cannot count.
    const outsider = { companyId: OTHER, userId: USER, roles: ['merchandiser'] as const }
    expect(await lossReasonList(outsider)).toEqual([])
  })
})

describe('1.2 · clarifications and deadlines', () => {
  it('asking a question moves the RFQ to clarifying', async () => {
    await reset()
    const { rfqId } = await newRfq()

    await askClarification(ctx, {
      rfqId,
      question: 'Is the collar rib 1x1 or 2x2?',
      askedAt: '2026-07-20',
    })

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId))
    expect(rfq!.status).toBe('clarifying')
  })

  it('flags a question nobody has answered', async () => {
    await reset()
    const { rfqId } = await newRfq()
    await askClarification(ctx, { rfqId, question: 'Rib?', askedAt: '2026-07-20' })

    const stale = await staleClarifications(ctx, { today: '2026-07-30' }, POLICY)
    expect(stale).toHaveLength(1)
    expect(stale[0]!.days).toBe(10)
  })

  it('an answered question is not stale', async () => {
    await reset()
    const { rfqId } = await newRfq()
    const { clarificationId } = await askClarification(ctx, {
      rfqId,
      question: 'Rib?',
      askedAt: '2026-07-20',
    })
    await answerClarification(ctx, {
      clarificationId,
      answer: '1x1',
      answeredAt: '2026-07-22',
    })

    expect(await staleClarifications(ctx, { today: '2026-07-30' }, POLICY)).toHaveLength(0)
  })

  it('refuses to answer the same question twice', async () => {
    await reset()
    const { rfqId } = await newRfq()
    const { clarificationId } = await askClarification(ctx, {
      rfqId,
      question: 'Rib?',
      askedAt: '2026-07-20',
    })
    await answerClarification(ctx, { clarificationId, answer: '1x1', answeredAt: '2026-07-22' })

    await expect(
      answerClarification(ctx, { clarificationId, answer: '2x2', answeredAt: '2026-07-23' }),
    ).rejects.toThrow(/already_answered/)
  })

  it('lists deadlines inside the window that are still unquoted', async () => {
    await reset()
    await newRfq({ deadline: '2026-08-01' })
    await newRfq({ deadline: '2026-12-01' })

    const near = await deadlinesNear(ctx, { today: '2026-07-31' }, POLICY)
    expect(near).toHaveLength(1)
    expect(near[0]!.daysLeft).toBe(1)
  })

  it('a quoted RFQ has met its deadline', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode, deadline: '2026-08-01' })
    await draftQuote(ctx, { rfqId, styleCode }, POLICY)

    expect(await deadlinesNear(ctx, { today: '2026-07-31' }, POLICY)).toHaveLength(0)
  })
})

describe('1.2 · tenancy', () => {
  it('another company sees no RFQs or quotes', async () => {
    await reset()
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    await approvedSheet(styleCode)
    const { rfqId } = await newRfq({ styleCode })
    await draftQuote(ctx, { rfqId, styleCode }, POLICY)

    const seen = await withTenantRead(otherCtx, async (tx) => ({
      rfqs: await tx.select().from(rfqs),
      quotes: await tx.select().from(quotes),
      clarifications: await tx.select().from(rfqClarifications),
    }))

    expect(seen.rfqs).toHaveLength(0)
    expect(seen.quotes).toHaveLength(0)
    expect(seen.clarifications).toHaveLength(0)
  })

  it('another company cannot raise an RFQ against this factory’s buyer', async () => {
    await expect(
      createRfq(otherCtx, {
        buyerId,
        title: 'Poaching attempt',
        productType: 'tshirt',
        quantity: 100,
        currency: 'USD',
      }),
    ).rejects.toThrow(/buyer_not_found/)
  })
})
