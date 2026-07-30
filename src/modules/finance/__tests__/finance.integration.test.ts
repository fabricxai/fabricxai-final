/**
 * 11.1 integration — commercial finance.
 *
 * The arithmetic is covered by `finance.test.ts`. What is asserted here:
 *
 *  - a receivable's expected date comes from the BUYER's realization lag when there is one,
 *    and from the stated company default when there is not — never from zero;
 *  - the cash timeline reads only open items, so realized money never appears twice;
 *  - the accrual reads costs from the modules that own them, and records a component it
 *    cannot compute as zero WITH its reason rather than omitting it;
 *  - the P&L reads the margin basis off the cost sheet and refuses to guess;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import '@/modules/commercial/register'
import { docSubmissions, lcs } from '@/modules/commercial/schema'
import {
  openSubmission,
  postRealization,
  recordBankCharge,
  setSubmissionStatus,
} from '@/modules/commercial/service'
import { approveCostSheet, createCostSheet } from '@/modules/costing/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import '@/modules/finance/register'
import {
  invoices,
  orderCostsActual,
  orderProfitabilityRows,
  payables,
  receivables,
} from '@/modules/finance/schema'
import {
  accrueOrderCosts,
  cashTimelineFor,
  draftInvoice,
  emitCashShortfall,
  openPayable,
  orderPnl,
  overdueReceivables,
  payPayable,
  postRealizationToReceivable,
} from '@/modules/finance/service'
import { orders } from '@/modules/orders/schema'
import { grnLines, grns, issueLines, issues, items } from '@/modules/store/schema'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `fin-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['finance'] }
const ownerCtx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['finance'] }

const POLICY = { defaultRealizationLagDays: 30, marginErosionPct: '2' }
const BANK_POLICY = { discrepancyEscalateAfterDays: 5, explainShortfallAbovePct: '5' }

let buyerId: string
let orderId: string
let itemId: string
let lcId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Fin Co', slug: `fin-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Finance' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const [order] = await db
    .insert(orders)
    .values({ companyId: COMPANY, buyerId, poNumbers: ['PO-1'], createdBy: USER })
    .returning({ id: orders.id })
  orderId = order!.id

  const [lc] = await db
    .insert(lcs)
    .values({
      companyId: COMPANY,
      buyerId,
      number: `LC-${randomUUID().slice(0, 8)}`,
      value: '100000.00',
      currency: 'USD',
      status: 'active',
      createdBy: USER,
    })
    .returning({ id: lcs.id })
  lcId = lc!.id

  // Store fixtures so the materials accrual has issues priced against a GRN.
  const [item] = await db
    .insert(items)
    .values({ companyId: COMPANY, code: 'FAB-1', name: 'Single Jersey', kind: 'fabric', uom: 'm' })
    .returning({ id: items.id })
  itemId = item!.id

  const [grn] = await db
    .insert(grns)
    .values({
      companyId: COMPANY,
      challanNo: `CH-${randomUUID().slice(0, 6)}`,
      receivedAt: '2026-07-01',
      createdBy: USER,
    })
    .returning({ id: grns.id })
  await db.insert(grnLines).values({
    companyId: COMPANY,
    grnId: grn!.id,
    itemId,
    qty: '2000.00',
    unit: 'm',
    unitPrice: '2.00',
    currency: 'USD',
  })

  const [issue] = await db
    .insert(issues)
    .values({ companyId: COMPANY, orderId, createdBy: USER })
    .returning({ id: issues.id })
  // 1,000 m at 2.00 = 2,000 of material for 1,000 pieces → 2.00 per piece.
  await db.insert(issueLines).values({
    companyId: COMPANY,
    issueId: issue!.id,
    itemId,
    qty: '1000.00',
    unit: 'm',
  })
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

const reset = async () => {
  await db.delete(receivables).where(eq(receivables.companyId, COMPANY))
  await db.delete(invoices).where(eq(invoices.companyId, COMPANY))
  await db.delete(payables).where(eq(payables.companyId, COMPANY))
  await db.delete(docSubmissions).where(eq(docSubmissions.companyId, COMPANY))
}

const invoice = (over: Record<string, unknown> = {}) =>
  draftInvoice(
    ctx,
    {
      orderId,
      number: `INV-${randomUUID().slice(0, 8)}`,
      invoiceDate: '2026-08-01',
      value: '50000.00',
      currency: 'USD',
      ...over,
    },
    POLICY,
  )

describe('11.1 · invoices and receivables', () => {
  it('opens a receivable using the company default when the buyer has no history', async () => {
    await reset()
    const result = await invoice()

    // 1 August + 30 days. Never zero, which would forecast the money arriving on the day the
    // invoice was raised.
    expect(result.expectedAt).toBe('2026-08-31')

    const [row] = await db.select().from(receivables).where(eq(receivables.id, result.receivableId))
    const basis = row!.expectedBasis as Record<string, unknown>
    expect(basis.source).toBe('company_default')
    expect(basis.observations).toBe(0)
  })

  it('uses the buyer’s own median lag once there is history', async () => {
    await reset()

    // Two realized presentations for this buyer: 10 and 12 days → median 11.
    for (const [submitted, realized] of [
      ['2026-01-01', '2026-01-11'],
      ['2026-02-01', '2026-02-13'],
    ] as const) {
      const { submissionId } = await openSubmission(ctx, {
        lcId,
        docs: [],
        invoicedAmount: '1000.00',
        currency: 'USD',
      })
      await setSubmissionStatus(ctx, { submissionId, bankStatus: 'submitted', submittedAt: submitted })
      await setSubmissionStatus(ctx, { submissionId, bankStatus: 'accepted' })
      await postRealization(
        ctx,
        { submissionId, realizedAmount: '1000.00', realizedAt: realized },
        BANK_POLICY,
      )
    }

    const result = await invoice()
    // 1 August + 11 days. Payment TERMS would have said 30; the bank actually takes 11.
    expect(result.expectedAt).toBe('2026-08-12')

    const [row] = await db.select().from(receivables).where(eq(receivables.id, result.receivableId))
    expect((row!.expectedBasis as Record<string, unknown>).source).toBe('buyer_median_lag')
  })

  it('records the shortfall when the bank credits less than invoiced', async () => {
    await reset()
    const drafted = await invoice()

    const result = await postRealizationToReceivable(ctx, {
      invoiceId: drafted.invoiceId,
      realizedAmount: '49250.00',
      realizedAt: '2026-08-20',
    })

    // The bank's deduction is a real cost; a receivable closed at the invoice value loses it.
    expect(result.shortfall).toBe('750.00')
    expect(result.status).toBe('realized')
  })

  it('cannot settle the same receivable twice', async () => {
    await reset()
    const drafted = await invoice()
    await postRealizationToReceivable(ctx, {
      invoiceId: drafted.invoiceId,
      realizedAmount: '50000.00',
      realizedAt: '2026-08-20',
    })

    await expect(
      postRealizationToReceivable(ctx, {
        invoiceId: drafted.invoiceId,
        realizedAmount: '50000.00',
        realizedAt: '2026-08-21',
      }),
    ).rejects.toThrow(/already_settled/)
  })

  it('lists receivables past their expected date', async () => {
    await reset()
    await invoice()

    const overdue = await overdueReceivables(ctx, { asOf: '2026-09-30' })
    expect(overdue).toHaveLength(1)
  })
})

describe('11.1 · the cash timeline', () => {
  it('counts an open receivable once and a realized one never', async () => {
    await reset()
    await invoice({ value: '30000.00' })
    const settled = await invoice({ value: '80000.00' })
    await postRealizationToReceivable(ctx, {
      invoiceId: settled.invoiceId,
      realizedAmount: '80000.00',
      realizedAt: '2026-08-10',
    })

    // The realized receivable is still on the books — it is its STATUS that keeps it out of
    // the forecast, so the row has to exist for this test to mean anything.
    const settledRow = await db
      .select()
      .from(receivables)
      .where(eq(receivables.invoiceId, settled.invoiceId))
    expect(settledRow[0]!.status).toBe('realized')

    const timeline = await cashTimelineFor(ctx, { from: '2026-08-31', currency: 'USD' })

    // Only the open one. Counting the realized 80,000 as arriving again is how a forecast
    // promises the same cash twice.
    expect(timeline.totalInflow).toBe('30000.00')
  })

  it('excludes a paid payable', async () => {
    await reset()
    const { payableId } = await openPayable(ctx, {
      supplierPoId: randomUUID(),
      reference: `PAY-${randomUUID().slice(0, 8)}`,
      amount: '20000.00',
      currency: 'USD',
      dueAt: '2026-09-05',
    })

    const before = await cashTimelineFor(ctx, { from: '2026-08-31', currency: 'USD' })
    expect(before.totalOutflow).toBe('20000.00')

    await payPayable(ctx, { payableId, paidAmount: '20000.00', paidAt: '2026-09-01' })

    const after = await cashTimelineFor(ctx, { from: '2026-08-31', currency: 'USD' })
    expect(after.totalOutflow).toBe('0.00')
  })

  it('raises the shortfall alert with the week it happens', async () => {
    await reset()
    await db.execute(sql`delete from outbox where company_id = ${COMPANY}`)

    await openPayable(ctx, {
      grnId: randomUUID(),
      reference: `PAY-${randomUUID().slice(0, 8)}`,
      amount: '5000.00',
      currency: 'USD',
      dueAt: '2026-09-10',
    })

    const result = await emitCashShortfall(ctx, {
      from: '2026-08-31',
      currency: 'USD',
      openingBalance: '1000.00',
    })

    expect(result.raised).toBe(true)
    expect(result.week).toBe('2026-09-07')
  })

  it('stays quiet when the forecast never dips', async () => {
    await reset()
    const result = await emitCashShortfall(ctx, {
      from: '2026-08-31',
      currency: 'USD',
      openingBalance: '1000000.00',
    })
    expect(result.raised).toBe(false)
  })
})

describe('11.1 · the accrual', () => {
  it('values materials from store issues at their GRN price', async () => {
    const result = await accrueOrderCosts(
      ctx,
      { orderId, pieces: 1000, currency: 'USD' },
      POLICY,
    )

    // 1,000 m × 2.00 = 2,000 over 1,000 pieces.
    expect(result.components.materials).toBe('2.00')
    expect((result.basis.materials as Record<string, unknown>).totalValue).toBe('2000.00')
  })

  it('records a component it cannot compute as ZERO with its reason, not omitted', async () => {
    // No loaded line-day rate configured, so CM cannot be allocated. Omitting it would make
    // the total look smaller and the margin look better — the wrong direction to be wrong in.
    const result = await accrueOrderCosts(
      ctx,
      { orderId, pieces: 1000, currency: 'USD' },
      POLICY,
    )

    expect(result.components.cm).toBe('0.00')
    expect((result.basis.cm as Record<string, unknown>).source).toBe('unavailable')
  })

  it('allocates CM from planning line-days once a rate is configured', async () => {
    const result = await accrueOrderCosts(
      ctx,
      { orderId, pieces: 1000, currency: 'USD' },
      { ...POLICY, loadedLineDayRate: '15000.00' },
    )

    // No allocations for this order, so zero line-days — but the basis now names the model
    // rather than saying it is unavailable.
    expect((result.basis.cm as Record<string, unknown>).source).toContain('line-days')
  })

  it('is recomputed, not accumulated — running it twice gives the same answer', async () => {
    const first = await accrueOrderCosts(ctx, { orderId, pieces: 1000, currency: 'USD' }, POLICY)
    const second = await accrueOrderCosts(ctx, { orderId, pieces: 1000, currency: 'USD' }, POLICY)

    expect(second.components).toEqual(first.components)

    const rows = await db
      .select()
      .from(orderCostsActual)
      .where(eq(orderCostsActual.orderId, orderId))
    expect(rows).toHaveLength(1)
  })

  it('refuses a per-piece cost with no pieces to divide by', async () => {
    await expect(
      accrueOrderCosts(ctx, { orderId, pieces: 0, currency: 'USD' }, POLICY),
    ).rejects.toThrow(/pieces_required/)
  })

  it('includes bank charges in the commercial component', async () => {
    await recordBankCharge(ctx, {
      lcId,
      kind: 'negotiation',
      amount: '500.00',
      currency: 'USD',
      chargedOn: '2026-08-01',
    })

    const result = await accrueOrderCosts(
      ctx,
      { orderId, pieces: 1000, currency: 'USD' },
      POLICY,
    )
    expect((result.basis.commercial as Record<string, unknown>).charges).toBeGreaterThan(0)
    // Freight is named as excluded rather than silently missing.
    expect((result.basis.commercial as Record<string, unknown>).excludes).toEqual(['freight'])
  })
})

describe('11.1 · per-order P&L', () => {
  const approvedSheet = async (marginBasis: 'price' | 'cost') => {
    const styleCode = `ST-${randomUUID().slice(0, 6)}`
    const created = await createCostSheet(ownerCtx, {
      styleCode,
      sections: {
        currency: 'USD',
        localCurrency: 'BDT',
        fxRateLocalToBase: '0.0083',
        fabric: [
          { ref: 'FAB-1', consumption: '1.60', uom: 'm', ratePerUom: '2.00', wastagePct: '0' },
        ],
        trims: [],
        embellishment: [],
        cm: { method: 'per_dozen', perDozenRateLocal: '1200.00' },
        commercial: [],
        marginPct: '12',
        marginBasis,
      },
    })
    await approveCostSheet(ownerCtx, { sheetId: created.sheetId })
    return styleCode
  }

  it('reads the margin basis off the sheet and computes both sides on it', async () => {
    const styleCode = await approvedSheet('price')
    await accrueOrderCosts(ctx, { orderId, pieces: 1000, currency: 'USD' }, POLICY)

    const result = await orderPnl(ctx, { orderId, styleCode }, POLICY)

    expect(result.profitability.marginBasis).toBe('price')

    const [row] = await db
      .select()
      .from(orderProfitabilityRows)
      .where(eq(orderProfitabilityRows.orderId, orderId))
    expect(row!.marginBasis).toBe('price')
  })

  it('the waterfall steps sum to the total variance', async () => {
    const styleCode = await approvedSheet('price')
    await accrueOrderCosts(ctx, { orderId, pieces: 1000, currency: 'USD' }, POLICY)

    const result = await orderPnl(ctx, { orderId, styleCode }, POLICY)

    const cents = (value: string): bigint => {
      const negative = value.startsWith('-')
      const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
      const minor = BigInt(whole + fraction.padEnd(2, '0'))
      return negative ? -minor : minor
    }
    const summed = result.waterfall.steps.reduce(
      (carried, step) => carried + cents(step.variance),
      0n,
    )

    // The invariant the shape exists for. A waterfall whose steps do not reach the total is
    // decoration.
    expect(summed).toBe(cents(result.waterfall.totalVariance))
  })

  it('reads the basis off the sheet rather than assuming one', async () => {
    await accrueOrderCosts(ctx, { orderId, pieces: 1000, currency: 'USD' }, POLICY)

    // A cost-basis sheet must come back on the cost basis. Asserting only that the two
    // margins DIFFER would pass even with the basis hard-coded, because a cost-basis sheet
    // also has a different FOB price — so assert the basis itself, on both sides.
    const onCost = await orderPnl(ctx, { orderId, styleCode: await approvedSheet('cost') }, POLICY)
    expect(onCost.profitability.marginBasis).toBe('cost')

    const [costRow] = await db
      .select()
      .from(orderProfitabilityRows)
      .where(eq(orderProfitabilityRows.orderId, orderId))
    expect(costRow!.marginBasis).toBe('cost')

    const onPrice = await orderPnl(ctx, { orderId, styleCode: await approvedSheet('price') }, POLICY)
    expect(onPrice.profitability.marginBasis).toBe('price')

    // And the same actual costs on the two bases are genuinely different numbers, which is
    // why comparing across them would produce a variance made entirely of arithmetic.
    expect(onCost.profitability.actualMarginPct).not.toBe(onPrice.profitability.actualMarginPct)
  })

  it('refuses a P&L with no accrual on record', async () => {
    await db.delete(orderCostsActual).where(eq(orderCostsActual.orderId, orderId))
    const styleCode = await approvedSheet('price')

    await expect(orderPnl(ctx, { orderId, styleCode }, POLICY)).rejects.toThrow(/no_accrual/)
  })
})

describe('11.1 · tenancy', () => {
  it('another company sees no invoices, receivables or payables', async () => {
    await reset()
    await invoice()
    await openPayable(ctx, {
      grnId: randomUUID(),
      reference: `PAY-${randomUUID().slice(0, 8)}`,
      amount: '100.00',
      currency: 'USD',
      dueAt: '2026-09-05',
    })

    const seen = await withTenantRead(otherCtx, async (tx) => ({
      invoices: await tx.select().from(invoices),
      receivables: await tx.select().from(receivables),
      payables: await tx.select().from(payables),
    }))

    expect(seen.invoices).toHaveLength(0)
    expect(seen.receivables).toHaveLength(0)
    expect(seen.payables).toHaveLength(0)
  })

  it('another company cannot invoice this factory’s order', async () => {
    await expect(
      draftInvoice(
        otherCtx,
        {
          orderId,
          number: `INV-${randomUUID().slice(0, 8)}`,
          invoiceDate: '2026-08-01',
          value: '1.00',
          currency: 'USD',
        },
        POLICY,
      ),
    ).rejects.toThrow(/order_not_found/)
  })
})
