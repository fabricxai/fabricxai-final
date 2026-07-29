/**
 * 1.5 integration ⚖
 *
 * The margin floor is the reason this suite exists. Quoting below it is how a factory
 * books a year of loss-making work one defensible-looking sheet at a time, so the gate is
 * tested from both sides — and the recompute-before-approve check is tested by tampering
 * with a stored figure.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, outbox, users } from '@/db/schema/core'
import { bomLines, boms, costSheets } from '@/modules/costing/schema'
import { getBomForStyle, getRequisitionConsumption } from '@/modules/costing/queries'
import {
  approveCostSheet,
  createCostSheet,
  getApprovedSheet,
  previewCostSheet,
} from '@/modules/costing/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const MERCH = `merch-${randomUUID().slice(0, 8)}`
const OWNER = `owner-${randomUUID().slice(0, 8)}`

const merchCtx: RequestCtx = { companyId: COMPANY, userId: MERCH, roles: ['merchandiser'] }
const ownerCtx: RequestCtx = { companyId: COMPANY, userId: OWNER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: MERCH, roles: ['merchandiser'] }

const POLICY = { marginFloorPct: '8' }

const sections = (marginPct = '12') => ({
  currency: 'USD',
  localCurrency: 'BDT',
  fxRateLocalToBase: '0.0091',
  fabric: [{ ref: 'FAB-A', consumption: '1.45', uom: 'M', ratePerUom: '2.10', wastagePct: '5' }],
  trims: [{ ref: 'TRM-A', consumption: '6', uom: 'PCS', ratePerUom: '0.02', wastagePct: '2' }],
  embellishment: [],
  cm: { method: 'smv' as const, smv: '12.5', efficiencyPct: '60', labourRatePerMinuteLocal: '3.50' },
  commercial: [],
  marginPct,
  marginBasis: 'price' as const,
})

let bomId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Cost Co', slug: `cost-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values([
    { id: MERCH, email: `${MERCH}@fabricxai.test`, name: 'Merchandiser' },
    { id: OWNER, email: `${OWNER}@fabricxai.test`, name: 'Owner' },
  ])

  const [bom] = await db
    .insert(boms)
    .values({ companyId: COMPANY, styleCode: 'ST-100', source: 'manual', createdBy: MERCH })
    .returning({ id: boms.id })
  bomId = bom!.id

  await db.insert(bomLines).values([
    { companyId: COMPANY, bomId, lineGroup: 'fabric', itemRef: 'FAB-A', consumption: '1.4500', uom: 'M', wastagePct: '5.00' },
    { companyId: COMPANY, bomId, lineGroup: 'trims', itemRef: 'TRM-A', consumption: '6.0000', uom: 'PCS', wastagePct: '2.00' },
  ])
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  for (const id of [MERCH, OWNER]) await db.delete(users).where(eq(users.id, id))
  await client.end()
})

describe('1.5 · preview and versioning', () => {
  it('previews without persisting anything', async () => {
    const before = await db.select().from(costSheets).where(eq(costSheets.companyId, COMPANY))
    const preview = await previewCostSheet(merchCtx, { sections: sections() }, POLICY)

    // fabric 3.20 + trims 0.12 + CM 0.66 = 3.98 cost; 12% margin ON PRICE → 3.98/0.88.
    expect(preview.totalCost).toBe('3.98')
    expect(preview.fobPrice).toBe('4.52')
    const after = await db.select().from(costSheets).where(eq(costSheets.companyId, COMPANY))
    expect(after).toHaveLength(before.length)
  })

  it('answers the buyer’s counter-offer as a scenario', async () => {
    const scenario = await previewCostSheet(
      merchCtx,
      { sections: sections(), overrides: { targetFobPrice: '4.20' } },
      POLICY,
    )

    expect(scenario.fobPrice).toBe('4.20')
    // Thin, and below the floor — both flagged rather than silently accepted.
    expect(scenario.belowMarginFloor).toBe(true)
  })

  it('versions per style, monotonically', async () => {
    const first = await createCostSheet(merchCtx, { styleCode: 'ST-100', bomId, sections: sections() }, POLICY)
    expect(first.version).toBe(1)

    const second = await createCostSheet(merchCtx, { styleCode: 'ST-100', bomId, sections: sections('15') }, POLICY)
    expect(second.version).toBe(2)
  })

  it('is invisible to another company', async () => {
    const visible = await withTenantRead(otherCtx, (tx) =>
      tx.select().from(costSheets).where(eq(costSheets.styleCode, 'ST-100')),
    )
    expect(visible).toHaveLength(0)
  })
})

describe('1.5 · the margin floor gate', () => {
  it('a manager can approve a sheet at or above the floor', async () => {
    const [sheet] = await db
      .select()
      .from(costSheets)
      .where(sql`${costSheets.styleCode} = 'ST-100' and ${costSheets.version} = 1`)

    const result = await approveCostSheet(merchCtx, { sheetId: sheet!.id }, POLICY)
    expect(result.belowFloor).toBe(false)

    const [after] = await db.select().from(costSheets).where(eq(costSheets.id, sheet!.id))
    expect(after?.status).toBe('approved')
  })

  it('approving supersedes the sheet that was in force, not the drafts', async () => {
    const [v2] = await db
      .select()
      .from(costSheets)
      .where(sql`${costSheets.styleCode} = 'ST-100' and ${costSheets.version} = 2`)

    await approveCostSheet(merchCtx, { sheetId: v2!.id }, POLICY)

    const all = await db
      .select()
      .from(costSheets)
      .where(eq(costSheets.styleCode, 'ST-100'))
      .orderBy(costSheets.version)

    expect(all[0]?.status).toBe('superseded')
    expect(all[1]?.status).toBe('approved')

    // The style's live sheet is the newest approved one.
    const live = await getApprovedSheet(merchCtx, 'ST-100')
    expect(live.version).toBe(2)
  })

  it('a manager CANNOT approve below the floor — only the owner can', async () => {
    const thin = await createCostSheet(
      merchCtx,
      { styleCode: 'ST-THIN', sections: sections('4') },
      POLICY,
    )
    expect(thin.computed.belowMarginFloor).toBe(true)

    await expect(
      approveCostSheet(merchCtx, { sheetId: thin.sheetId }, POLICY),
    ).rejects.toMatchObject({
      status: 403,
      messageKey: 'costing.errors.below_floor_needs_owner',
    })

    const result = await approveCostSheet(ownerCtx, { sheetId: thin.sheetId }, POLICY)
    expect(result.belowFloor).toBe(true)

    // A below-floor approval gets its own event so a later margin review finds it.
    const events = await db
      .select()
      .from(outbox)
      .where(sql`${outbox.companyId} = ${COMPANY} and ${outbox.eventName} = 'costing.sheet.below_floor_approved'`)
    expect(events.length).toBeGreaterThan(0)
  })

  it('refuses to approve a sheet whose stored price no longer matches its inputs', async () => {
    const created = await createCostSheet(
      merchCtx,
      { styleCode: 'ST-TAMPER', sections: sections() },
      POLICY,
    )

    // Somebody edited the price directly, or an older build wrote it.
    await db
      .update(costSheets)
      .set({ fobPrice: '9.99' })
      .where(eq(costSheets.id, created.sheetId))

    await expect(
      approveCostSheet(ownerCtx, { sheetId: created.sheetId }, POLICY),
    ).rejects.toMatchObject({ messageKey: 'costing.errors.sheet_stale' })
  })

  it('refuses to approve an already-approved sheet', async () => {
    const live = await getApprovedSheet(merchCtx, 'ST-100')
    await expect(
      approveCostSheet(ownerCtx, { sheetId: live.id }, POLICY),
    ).rejects.toMatchObject({ code: 'illegal_transition', status: 409 })
  })
})

describe('1.5 · feeds the store', () => {
  it('supplies BOM consumption for a requisition', async () => {
    // This is what 3.1 currently takes as caller input — routing it through here means
    // the requisition is sized from the numbers the order was priced on.
    const lines = await getRequisitionConsumption(merchCtx, bomId)

    expect(lines).toHaveLength(2)
    expect(lines.find((line) => line.itemRef === 'FAB-A')).toMatchObject({
      // Full BOM precision — the caller rounds the RESULT, not this.
      consumptionPerPiece: '1.4500',
      unit: 'M',
    })
  })

  it('resolves a style to the BOM behind its live cost sheet', async () => {
    const result = await getBomForStyle(merchCtx, 'ST-100')
    expect(result.bomId).toBe(bomId)
    expect(result.sheetVersion).toBe(2)
  })
})
