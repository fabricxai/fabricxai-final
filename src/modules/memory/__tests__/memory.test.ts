/**
 * 1.6 Order Memory — pure vectors, written before the implementation.
 *
 * This module's whole claim is "here is what actually happened last time". Everything below
 * guards the difference between a measurement and a guess, because a plausible-looking
 * consumption figure or match percentage is exactly the kind of thing a merchandiser quotes
 * without re-deriving.
 *
 * The two that matter most:
 *
 *  - `efficiencyCurve` FLAGS a day a line shared with another order instead of splitting the
 *    number. A 62% day on a line that ran two orders is not this order's 62%, and there is no
 *    honest way to divide it after the fact.
 *  - `perPieceConsumption` divides exactly and refuses a zero denominator, because the figure
 *    it produces goes straight into the next quote's cost sheet.
 */
import { describe, expect, it } from 'vitest'

import {
  delayEvents,
  efficiencyCurve,
  EMBEDDING_DIM,
  fingerprintText,
  MemoryError,
  matchPercent,
  noteWindowOpen,
  perPieceConsumption,
  seededLineConfidence,
  topDefects,
  assertOutcomePatch,
} from '../memory'

describe('fingerprintText · the same style must embed to the same vector', () => {
  it('1 · is identical whatever order the attributes arrive in', () => {
    // Attributes come out of jsonb, whose key order is not guaranteed. If the text changed
    // with it, re-embedding a style nobody touched would move it in the index.
    const a = fingerprintText({
      styleCode: 'TS-100',
      attrs: { productType: 'tshirt', gsm: 180, construction: 'single jersey' },
    })
    const b = fingerprintText({
      styleCode: 'TS-100',
      attrs: { construction: 'single jersey', productType: 'tshirt', gsm: 180 },
    })
    expect(a).toBe(b)
  })

  it('2 · drops empty attributes rather than embedding the word "null"', () => {
    const text = fingerprintText({
      styleCode: 'TS-100',
      attrs: { productType: 'tshirt', gsm: null, gauge: undefined, construction: '  ' },
    })
    expect(text).not.toMatch(/null|undefined/)
    expect(text).toContain('producttype=tshirt')
    expect(text).not.toContain('gsm')
  })

  it('3 · normalises case and whitespace so two spellings of one style agree', () => {
    const a = fingerprintText({ styleCode: 'TS-100', attrs: { productType: 'T-Shirt' } })
    const b = fingerprintText({ styleCode: 'ts-100', attrs: { productType: '  t-shirt  ' } })
    expect(a).toBe(b)
  })

  it('4 · caps the tech-pack text so one long document cannot drown the attributes', () => {
    const text = fingerprintText({
      styleCode: 'TS-100',
      attrs: { productType: 'tshirt' },
      techPackText: 'x'.repeat(10_000),
    })
    expect(text.length).toBeLessThanOrEqual(4_500)
    // The attributes survive the cap — they are the part that carries the most signal.
    expect(text).toContain('producttype=tshirt')
  })

  it('5 · REFUSES a fingerprint with nothing in it', () => {
    // A vector embedded from an empty string sits somewhere arbitrary and matches everything
    // it happens to be near. Better to have no fingerprint than a confident wrong one.
    expect(() => fingerprintText({ styleCode: '  ', attrs: {} })).toThrow(MemoryError)
  })
})

describe('matchPercent · what a merchandiser is shown', () => {
  it('6 · an exact match is 100%', () => {
    expect(matchPercent(0)).toBe('100.0')
  })

  it('7 · an orthogonal vector is 0%', () => {
    expect(matchPercent(1)).toBe('0.0')
  })

  it('8 · clamps an opposed vector to 0 rather than showing a negative match', () => {
    // Cosine distance runs to 2. "-100% similar" is not a thing to put on a screen.
    expect(matchPercent(2)).toBe('0.0')
  })

  it('9 · converts the middle of the range exactly', () => {
    expect(matchPercent(0.25)).toBe('75.0')
    expect(matchPercent(0.125)).toBe('87.5')
  })

  it('10 · REFUSES a distance that is not a number', () => {
    expect(() => matchPercent(Number.NaN)).toThrow(MemoryError)
    expect(() => matchPercent(Number.POSITIVE_INFINITY)).toThrow(MemoryError)
    expect(() => matchPercent(-0.001)).toThrow(MemoryError)
    expect(() => matchPercent(2.5)).toThrow(MemoryError)
  })
})

describe('efficiencyCurve · a shared day is not this order’s day', () => {
  const rows = [
    { lineId: 'L2', forDate: '2026-03-02', efficiencyPct: '58.00' },
    { lineId: 'L1', forDate: '2026-03-01', efficiencyPct: '62.50' },
    { lineId: 'L1', forDate: '2026-03-02', efficiencyPct: '71.00' },
  ]

  it('11 · FLAGS a day the line also ran another order, and does not scale the number', () => {
    // The line's efficiency that day covers both orders and there is no record of the split.
    // Dividing it by two would look like a measurement and be an invention.
    const curve = efficiencyCurve({ rows, ordersOnLineDate: { 'L1|2026-03-02': 2 } })

    const shared = curve.find((d) => d.lineId === 'L1' && d.date === '2026-03-02')!
    expect(shared.sharedWithOtherOrders).toBe(true)
    expect(shared.efficiencyPct).toBe('71.00')

    const sole = curve.find((d) => d.lineId === 'L1' && d.date === '2026-03-01')!
    expect(sole.sharedWithOtherOrders).toBe(false)
  })

  it('12 · is sorted by date then line, so two compilations of one order agree', () => {
    const curve = efficiencyCurve({ rows, ordersOnLineDate: {} })
    expect(curve.map((d) => `${d.date}/${d.lineId}`)).toEqual([
      '2026-03-01/L1',
      '2026-03-02/L1',
      '2026-03-02/L2',
    ])
  })

  it('13 · REFUSES two rows for the same line and day', () => {
    // `efficiency_daily` is unique on (line, date). Two rows means the source is wrong, and
    // silently keeping one of them would bury it.
    expect(() =>
      efficiencyCurve({
        rows: [
          { lineId: 'L1', forDate: '2026-03-01', efficiencyPct: '62.50' },
          { lineId: 'L1', forDate: '2026-03-01', efficiencyPct: '40.00' },
        ],
        ordersOnLineDate: {},
      }),
    ).toThrow(MemoryError)
  })
})

describe('topDefects · what went wrong, in order', () => {
  const checks = [
    { defects: [{ code: 'BROKEN_STITCH', count: 12 }, { code: 'OIL_STAIN', count: 3 }] },
    { defects: [{ code: 'BROKEN_STITCH', count: 8 }, { code: 'SKIP_STITCH', count: 8 }] },
  ]

  it('14 · aggregates across checks and ranks by count', () => {
    const top = topDefects(checks, 2)
    expect(top[0]).toEqual({ code: 'BROKEN_STITCH', count: 20, pctOfDefects: '64.5' })
    expect(top).toHaveLength(2)
  })

  it('15 · breaks a tie by code so the list is stable between runs', () => {
    // Three codes on 8. Without a tie-break the order comes from however the rows arrived,
    // and two compilations of the same closed order would disagree about its top defect.
    const tied = topDefects(
      [
        {
          defects: [
            { code: 'SKIP_STITCH', count: 8 },
            { code: 'OIL_STAIN', count: 8 },
            { code: 'BROKEN_STITCH', count: 8 },
          ],
        },
      ],
      3,
    )
    expect(tied.map((d) => d.code)).toEqual(['BROKEN_STITCH', 'OIL_STAIN', 'SKIP_STITCH'])
  })

  it('16 · an order with no defects has no top defects, not a zero row', () => {
    expect(topDefects([{ defects: [] }], 5)).toEqual([])
  })

  it('17 · ignores a non-positive count rather than letting it skew the percentages', () => {
    const top = topDefects([{ defects: [{ code: 'A', count: 5 }, { code: 'B', count: 0 }] }], 5)
    expect(top).toEqual([{ code: 'A', count: 5, pctOfDefects: '100.0' }])
  })
})

describe('delayEvents · which milestone actually slipped', () => {
  const milestones = [
    { name: 'PP Sample', plannedDate: '2026-01-10', actualDate: '2026-01-10' },
    { name: 'Fabric In', plannedDate: '2026-01-05', actualDate: '2026-01-19' },
    { name: 'Cutting', plannedDate: '2026-01-20', actualDate: '2026-01-18' },
    { name: 'Ex-Factory', plannedDate: '2026-02-28', actualDate: null },
  ]

  it('18 · reports the slip in whole days, late positive and early negative', () => {
    const events = delayEvents(milestones)
    expect(events.find((e) => e.milestone === 'Fabric In')).toEqual({
      milestone: 'Fabric In',
      days: 14,
      direction: 'late',
    })
    expect(events.find((e) => e.milestone === 'Cutting')).toEqual({
      milestone: 'Cutting',
      days: -2,
      direction: 'early',
    })
  })

  it('19 · leaves out what hit its date and what never happened', () => {
    const names = delayEvents(milestones).map((e) => e.milestone)
    expect(names).not.toContain('PP Sample')
    // An unactualized milestone on a closed order is a gap in the record, not a delay of
    // zero — claiming it was on time would be the wrong reading.
    expect(names).not.toContain('Ex-Factory')
  })

  it('20 · counts across a month boundary correctly', () => {
    const [event] = delayEvents([
      { name: 'Sewing', plannedDate: '2026-02-26', actualDate: '2026-03-03' },
    ])
    expect(event!.days).toBe(5)
  })

  it('21 · is sorted worst first', () => {
    expect(delayEvents(milestones).map((e) => e.milestone)).toEqual(['Fabric In', 'Cutting'])
  })
})

describe('perPieceConsumption · the number that becomes the next quote', () => {
  it('22 · divides exactly', () => {
    expect(perPieceConsumption('1500.00', 1_000)).toBe('1.5000')
  })

  it('23 · keeps four decimals and rounds once, at the end', () => {
    // 1000 / 3 = 333.3333… Fabric consumption at two decimals loses real money over 100k pcs.
    expect(perPieceConsumption('1000.00', 3)).toBe('333.3333')
    expect(perPieceConsumption('2.00', 3)).toBe('0.6667')
  })

  it('24 · REFUSES a zero or negative piece count', () => {
    // Dividing by the pieces produced is only meaningful if any were. A default of 0 here
    // would put an infinite or silently-zero consumption into a cost sheet.
    expect(() => perPieceConsumption('1500.00', 0)).toThrow(MemoryError)
    expect(() => perPieceConsumption('1500.00', -10)).toThrow(MemoryError)
  })

  it('25 · REFUSES a negative issue quantity', () => {
    expect(() => perPieceConsumption('-5.00', 100)).toThrow(MemoryError)
  })
})

describe('the outcome is a record, not a working document', () => {
  const compiledAt = new Date('2026-03-01T08:00:00Z')

  it('26 · the note window is open for seven days', () => {
    expect(noteWindowOpen(compiledAt, new Date('2026-03-07T23:59:00Z'))).toBe(true)
    expect(noteWindowOpen(compiledAt, new Date('2026-03-08T08:00:01Z'))).toBe(false)
  })

  it('27 · only the note may be edited', () => {
    expect(() => assertOutcomePatch({ merchandiserNote: 'Fabric arrived 14 days late.' })).not.toThrow()
  })

  it('28 · REFUSES an edit to a compiled figure', () => {
    // The outcome is what the next quote is built on. A margin somebody improved after the
    // fact is worse than no memory at all.
    expect(() => assertOutcomePatch({ actualMarginPct: '18.00' })).toThrow(MemoryError)
    expect(() =>
      assertOutcomePatch({ merchandiserNote: 'ok', topDefects: [] }),
    ).toThrow(MemoryError)
  })
})

describe('EMBEDDING_DIM', () => {
  it('29 · matches the column the migration creates', () => {
    // Drizzle cannot check this for us: a vector(1536) column and a 768-dim model produce a
    // runtime error on insert, per row, in a background job nobody is watching.
    expect(EMBEDDING_DIM).toBe(1536)
  })
})

describe('seededLineConfidence · a seeded figure is not one number', () => {
  it('30 · a carried-over estimate scores lowest — it was never measured here', () => {
    expect(seededLineConfidence({ basis: 'planned', piecesProduced: 12_000 })).toBe(0.3)
  })

  it('31 · a figure measured across a full run scores highest', () => {
    expect(seededLineConfidence({ basis: 'actual', piecesProduced: 12_000 })).toBe(0.95)
  })

  it('32 · the same figure over a short run scores lower', () => {
    // 400 pieces has not averaged out the end bits or the re-cuts. A reviewer should look.
    expect(seededLineConfidence({ basis: 'actual', piecesProduced: 400 })).toBe(0.63)
  })

  it('33 · is monotone — more evidence never scores lower', () => {
    const scores = [100, 500, 2_000, 5_000, 50_000].map((pieces) =>
      seededLineConfidence({ basis: 'actual', piecesProduced: pieces }),
    )
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('34 · REFUSES a negative piece count', () => {
    expect(() => seededLineConfidence({ basis: 'actual', piecesProduced: -1 })).toThrow(MemoryError)
  })
})

