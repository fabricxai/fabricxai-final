/**
 * The measurement-spec schema reads a buyer's chart as buyers write them.
 *
 * Found live: the kit's POM chart failed on every point. Charts write ONE "Tol +/-"
 * column (a symmetric magnitude, sometimes transcribed signed, sometimes as a JSON
 * number), and grade specs across sizes — the schema demanded an unsigned string pair
 * and one spec, so a correct transcription could not validate.
 */
import { describe, expect, it } from 'vitest'

import { measurementSpecPayload } from '../zod'

describe('a measurement chart, as the model actually transcribes one', () => {
  it('1 · a signed tolerance is a magnitude with the column already saying the direction', () => {
    const parsed = measurementSpecPayload.parse({
      styleCode: 'JJ-CORE-PL-26',
      unit: 'cm',
      points: [{ name: 'A Chest — size M', spec: '55.0', tolPlus: '1.0', tolMinus: '-1.0' }],
    })
    expect(parsed.points[0]!.tolMinus).toBe('1.0')
  })

  it('2 · one "Tol +/-" value folds across both directions', () => {
    const parsed = measurementSpecPayload.parse({
      styleCode: 'JJ-CORE-PL-26',
      points: [{ name: 'B Body length — size L', spec: '74.0', tolPlus: '1.0', tolMinus: '' }],
    })
    expect(parsed.points[0]!.tolMinus).toBe('1.0')
  })

  it('3 · numbers arriving as JSON numbers are the same chart', () => {
    const parsed = measurementSpecPayload.parse({
      styleCode: 'JJ-CORE-PL-26',
      points: [{ name: 'F Collar height CB — size S', spec: 7.0, tolPlus: 0.3, tolMinus: -0.3 }],
    })
    expect(parsed.points[0]).toMatchObject({ spec: '7', tolPlus: '0.3', tolMinus: '0.3' })
  })

  it('4 · a point with no tolerance at all still fails — folding is not inventing', () => {
    expect(() =>
      measurementSpecPayload.parse({
        styleCode: 'X',
        points: [{ name: 'A', spec: '52.0', tolPlus: '', tolMinus: '' }],
      }),
    ).toThrow()
  })
})
