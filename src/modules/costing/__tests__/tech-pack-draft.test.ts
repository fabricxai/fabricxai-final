/**
 * The tech-pack draft schema reads documents as documents are written.
 *
 * The extraction instruction says "transcribe exactly as written, do not tidy" and the
 * strict `decimal()` demanded exactly the tidying the instruction forbids — so the model
 * obeyed the prompt and every tech-pack extraction failed validation on values that were
 * transcribed CORRECTLY: `"0.255 kg*"`, `"3 pcs"`, `""`, a style ref in the uuid field.
 * Found live, on the first real tech pack a tester ever submitted.
 *
 * These cases are the actual values gpt-4o-mini returned for the kit's ST-2610 excerpt.
 */
import { describe, expect, it } from 'vitest'

import { bomFromTechPackDraft, transcribedDecimal } from '../zod'

describe('a tech pack draft, as the model actually transcribes one', () => {
  it('1 · the failing live payload now parses, with the numbers read out of the noise', () => {
    const parsed = bomFromTechPackDraft.parse({
      styleCode: 'JJ-CORE-PL-26',
      // The model fills the uuid field with whatever id-shaped string the page has.
      sourceDocumentId: 'JJ-CORE-PL-26',
      lines: [
        // The starred indicative figure — the field most worth extracting on this document.
        { lineGroup: 'fabric', itemRef: 'Body fabric', consumption: '0.255 kg*', uom: 'kg', wastagePct: '' },
        { lineGroup: 'trims', itemRef: 'Placket btn', consumption: '3 pcs', uom: 'pcs', wastagePct: '' },
        // The sew-thread line: no consumption stated, no uom stated.
        { lineGroup: 'trims', itemRef: 'Sew thread', consumption: '—', uom: '', wastagePct: '' },
      ],
    })

    expect(parsed.sourceDocumentId).toBeUndefined() // dropped, refilled by the pipeline
    expect(parsed.lines[0]).toMatchObject({ consumption: '0.255', wastagePct: '0' })
    expect(parsed.lines[1]).toMatchObject({ consumption: '3' })
    // Blank costs zero LOUDLY, with a dash for the unit nobody stated.
    expect(parsed.lines[2]).toMatchObject({ consumption: '0', uom: '—' })
  })

  it('2 · a number arriving as a JSON number is the same transcription', () => {
    expect(transcribedDecimal().parse(0.255)).toBe('0.255')
  })

  it('3 · precision beyond the column is trimmed, not fatal', () => {
    expect(transcribedDecimal(undefined, 12, 4).parse('0.123456')).toBe('0.1234')
  })

  it('4 · genuine garbage still fails — tolerance is not blindness', () => {
    expect(() => transcribedDecimal().parse('no number here')).toThrow()
  })
})
