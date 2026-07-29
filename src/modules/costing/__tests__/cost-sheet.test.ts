/**
 * Cost-sheet vectors — written before the implementation.
 *
 * This is the arithmetic that decides whether an order makes money. A systematic error
 * here is not a bug that shows up in testing; it is eighteen months of quoting slightly
 * too low and finding out at the year end.
 *
 * The one ambiguity worth naming: **margin on price is not margin on cost.** A 20% margin
 * on a $10 cost is $12.50 if margin means "share of the selling price" and $12.00 if it
 * means "markup on cost". Garment costing usually means the former; plenty of
 * spreadsheets do the latter. Picking one silently would be a 4% pricing error nobody
 * would ever notice, so the basis is an explicit field and both are tested.
 */
import { describe, expect, it } from 'vitest'

import {
  computeCostSheet,
  computeScenario,
  CostingError,
  type CostSheetInput,
} from '../cost-sheet'

const SHEET: CostSheetInput = {
  currency: 'USD',
  localCurrency: 'BDT',
  /** BDT per USD, snapshotted onto the sheet. */
  fxRateLocalToBase: '0.0091',
  fabric: [
    // 1.45 m at $2.10, plus 5% wastage
    { ref: 'FAB-COTTON-160', consumption: '1.45', uom: 'M', ratePerUom: '2.10', wastagePct: '5' },
  ],
  trims: [
    { ref: 'TRM-BUTTON-18L', consumption: '6', uom: 'PCS', ratePerUom: '0.02', wastagePct: '2' },
    { ref: 'TRM-LABEL', consumption: '1', uom: 'PCS', ratePerUom: '0.05', wastagePct: '0' },
  ],
  embellishment: [{ description: 'Chest print', costPerPiece: '0.18' }],
  cm: {
    method: 'smv',
    smv: '12.5',
    efficiencyPct: '60',
    /** BDT per minute of line time. */
    labourRatePerMinuteLocal: '3.50',
  },
  commercial: [
    { description: 'Buying commission', kind: 'pct_of_cost', value: '3' },
    { description: 'Inspection', kind: 'per_piece', value: '0.04' },
  ],
  marginPct: '12',
  marginBasis: 'price',
}

describe('computeCostSheet · materials', () => {
  it('1 · applies wastage to consumption before costing it', () => {
    const sheet = computeCostSheet(SHEET)
    // 1.45 × 1.05 = 1.5225 m → × 2.10 = 3.19725 → 3.20
    expect(sheet.sections.fabric.total).toBe('3.20')
  })

  it('2 · totals every trim line', () => {
    const sheet = computeCostSheet(SHEET)
    // buttons 6 × 1.02 × 0.02 = 0.1224 → 0.12 ; label 1 × 0.05 = 0.05
    expect(sheet.sections.trims.total).toBe('0.17')
  })

  it('3 · includes embellishment at its per-piece cost', () => {
    expect(computeCostSheet(SHEET).sections.embellishment.total).toBe('0.18')
  })

  it('4 · refuses a negative consumption or rate', () => {
    expect(() =>
      computeCostSheet({
        ...SHEET,
        fabric: [{ ref: 'F', consumption: '-1', uom: 'M', ratePerUom: '2', wastagePct: '0' }],
      }),
    ).toThrow(CostingError)
  })
})

describe('computeCostSheet · CM', () => {
  it('5 · SMV method divides by efficiency and converts to the base currency', () => {
    const sheet = computeCostSheet(SHEET)
    // 12.5 SMV ÷ 0.60 efficiency = 20.833… standard minutes actually paid for
    // × 3.50 BDT/min = 72.9166 BDT → × 0.0091 = 0.6635… USD → 0.66
    expect(sheet.sections.cm.total).toBe('0.66')
    expect(sheet.sections.cm.localAmount).toBe('72.92')
  })

  it('6 · per-dozen method divides by twelve', () => {
    const sheet = computeCostSheet({
      ...SHEET,
      cm: { method: 'per_dozen', perDozenRateLocal: '96.00' },
    })
    // 96 BDT/dozen ÷ 12 = 8 BDT/pc → × 0.0091 = 0.0728 → 0.07
    expect(sheet.sections.cm.localAmount).toBe('8.00')
    expect(sheet.sections.cm.total).toBe('0.07')
  })

  it('7 · refuses zero efficiency instead of dividing by zero', () => {
    // A line at 0% efficiency produces nothing; there is no CM to quote.
    expect(() =>
      computeCostSheet({
        ...SHEET,
        cm: { method: 'smv', smv: '12.5', efficiencyPct: '0', labourRatePerMinuteLocal: '3.50' },
      }),
    ).toThrow(CostingError)
  })

  it('8 · refuses an SMV sheet that is missing its inputs', () => {
    expect(() =>
      computeCostSheet({ ...SHEET, cm: { method: 'smv', smv: '12.5' } }),
    ).toThrow(/efficiency|labour/i)
  })
})

describe('computeCostSheet · margin, the part that is easy to get wrong', () => {
  it('9 · margin on PRICE is a share of the selling price', () => {
    const sheet = computeCostSheet(SHEET)
    // cost = 3.20 + 0.17 + 0.18 + 0.66 = 4.21
    // commercial: 3% of 4.21 = 0.1263 → 0.13, plus 0.04 = 0.17
    // total cost = 4.38 ; FOB = 4.38 ÷ (1 − 0.12) = 4.9772… → 4.98
    expect(sheet.totalCost).toBe('4.38')
    expect(sheet.fobPrice).toBe('4.98')
  })

  it('10 · margin on COST is a markup, and gives a different number', () => {
    // Same 12%, different meaning: 4.38 × 1.12 = 4.9056 → 4.91.
    // Seven cents a piece on 100,000 pieces is $7,000 — which is why this is explicit.
    const sheet = computeCostSheet({ ...SHEET, marginBasis: 'cost' })
    expect(sheet.fobPrice).toBe('4.91')
  })

  it('11 · refuses a 100% price-basis margin rather than returning infinity', () => {
    expect(() =>
      computeCostSheet({ ...SHEET, marginPct: '100', marginBasis: 'price' }),
    ).toThrow(CostingError)
  })

  it('12 · reports the achieved margin, which is what a manager checks', () => {
    const sheet = computeCostSheet(SHEET)
    expect(sheet.achievedMarginPct).toBe('12.05')
  })

  it('13 · flags a sheet below the company margin floor', () => {
    // Settings holds the floor; below it the approval routes to the owner, not a manager.
    const sheet = computeCostSheet({ ...SHEET, marginPct: '4' }, { marginFloorPct: '8' })

    expect(sheet.belowMarginFloor).toBe(true)
    expect(sheet.flags.map((f) => f.code)).toContain('below_margin_floor')
  })

  it('14 · is exact — no float touches a price', () => {
    const sheet = computeCostSheet({
      ...SHEET,
      fabric: [{ ref: 'F', consumption: '0.10', uom: 'M', ratePerUom: '0.10', wastagePct: '0' }],
      trims: [{ ref: 'T', consumption: '1', uom: 'PCS', ratePerUom: '0.20', wastagePct: '0' }],
      embellishment: [],
      commercial: [],
      cm: { method: 'per_dozen', perDozenRateLocal: '0' },
      marginPct: '0',
    })

    // 0.01 + 0.20 — the classic float would give 0.21000000000000002
    expect(sheet.totalCost).toBe('0.21')
  })
})

describe('computeScenario · the sliders', () => {
  it('15 · a fabric price change moves fabric and everything downstream, nothing else', () => {
    const base = computeCostSheet(SHEET)
    const scenario = computeScenario(SHEET, { fabricRateMultiplier: '1.10' })

    expect(scenario.sections.fabric.total).toBe('3.52') // 3.19725 × 1.1 → 3.517 → 3.52
    // Trims and CM are untouched.
    expect(scenario.sections.trims.total).toBe(base.sections.trims.total)
    expect(scenario.sections.cm.total).toBe(base.sections.cm.total)
    // But the price moves, because cost did.
    expect(scenario.fobPrice).not.toBe(base.fobPrice)
  })

  it('16 · an efficiency change moves CM only', () => {
    const base = computeCostSheet(SHEET)
    const scenario = computeScenario(SHEET, { efficiencyPct: '75' })

    // 12.5 ÷ 0.75 × 3.50 = 58.333 BDT → 58.33
    expect(scenario.sections.cm.localAmount).toBe('58.33')
    expect(scenario.sections.fabric.total).toBe(base.sections.fabric.total)
  })

  it('17 · a target price reports the margin it would actually achieve', () => {
    // The question a merchandiser actually asks: the buyer says $4.50 — can we do it?
    const scenario = computeScenario(SHEET, { targetFobPrice: '4.50' })

    expect(scenario.fobPrice).toBe('4.50')
    // 1 − 4.38/4.50 = 2.666…% — thin, and the flag says so.
    expect(scenario.achievedMarginPct).toBe('2.67')
    expect(scenario.flags.map((f) => f.code)).toContain('target_price_below_margin')
  })

  it('18 · is pure — the input sheet is not mutated', () => {
    const snapshot = JSON.stringify(SHEET)
    computeScenario(SHEET, { fabricRateMultiplier: '1.5', efficiencyPct: '80' })
    expect(JSON.stringify(SHEET)).toBe(snapshot)
  })
})
