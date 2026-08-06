/**
 * The confidence derivation (plan 6.4, audit AI-B2/AI-B1).
 *
 * Every other part of the real provider is a network call and cannot be tested here. This
 * part is pure, and it is the part that decides whether an extraction can honestly claim a
 * per-field score at all — so it is tested to the point where the SDK wrapper around it is
 * doing nothing but passing bytes.
 */
import { describe, expect, it } from 'vitest'

import {
  ConfidenceError,
  fieldConfidenceFromTokens,
  topLevelValueSpans,
  type ChosenToken,
} from '../providers/field-confidence'

/** Tokens at a given certainty. `p` is the probability, converted to the logprob Gemini sends. */
const tok = (text: string, p: number): ChosenToken => ({
  token: text,
  logProbability: Math.log(p),
})

/** A whole string as one certain token — for the parts of a fixture under no test. */
const sure = (text: string): ChosenToken => tok(text, 1)

describe('topLevelValueSpans · offsets survive real document text', () => {
  it('1 · finds each value, not its key', () => {
    const json = '{"styleCode":"ST-100","quantity":12000}'
    const spans = topLevelValueSpans(json)

    expect(json.slice(spans.styleCode!.start, spans.styleCode!.end)).toBe('"ST-100"')
    expect(json.slice(spans.quantity!.start, spans.quantity!.end)).toBe('12000')
  })

  it('2 · is not confused by braces and commas inside a string', () => {
    // A buyer's amendment note is free text and routinely contains both. A regex-based
    // reader breaks here, which is why this walks the JSON.
    const json = '{"note":"qty {revised}, see p.2","qty":40}'
    const spans = topLevelValueSpans(json)

    expect(json.slice(spans.note!.start, spans.note!.end)).toBe('"qty {revised}, see p.2"')
    expect(json.slice(spans.qty!.start, spans.qty!.end)).toBe('40')
  })

  it('3 · is not confused by an escaped quote', () => {
    const json = '{"note":"the buyer said \\"hold\\"","qty":40}'
    const spans = topLevelValueSpans(json)

    expect(json.slice(spans.note!.start, spans.note!.end)).toBe('"the buyer said \\"hold\\""')
    expect(spans.qty).toBeDefined()
  })

  it('4 · takes a nested object or array whole', () => {
    const json = '{"lines":[{"item":"a","qty":1},{"item":"b","qty":2}],"total":3}'
    const spans = topLevelValueSpans(json)

    expect(json.slice(spans.lines!.start, spans.lines!.end)).toBe(
      '[{"item":"a","qty":1},{"item":"b","qty":2}]',
    )
    expect(json.slice(spans.total!.start, spans.total!.end)).toBe('3')
    // One key per top-level field. `lines` is ONE row in the approve inbox, not eight.
    expect(Object.keys(spans)).toEqual(['lines', 'total'])
  })

  it('5 · handles literals and whitespace', () => {
    const json = '{\n  "ok": true,\n  "missing": null,\n  "rate": -1.5e3\n}'
    const spans = topLevelValueSpans(json)

    expect(json.slice(spans.ok!.start, spans.ok!.end)).toBe('true')
    expect(json.slice(spans.missing!.start, spans.missing!.end)).toBe('null')
    expect(json.slice(spans.rate!.start, spans.rate!.end)).toBe('-1.5e3')
  })

  it('6 · refuses text that is not a JSON object', () => {
    expect(() => topLevelValueSpans('[1,2]')).toThrow(ConfidenceError)
    expect(() => topLevelValueSpans('{"a":"unterminated')).toThrow(ConfidenceError)
  })
})

describe('fieldConfidenceFromTokens · the score is the model’s own doubt', () => {
  it('1 · scores a certain field high and a doubted one low', () => {
    const tokens: ChosenToken[] = [
      sure('{"styleCode":'),
      tok('"ST-100"', 0.99),
      sure(',"quantity":'),
      tok('12', 0.55),
      tok('000', 0.9),
      sure('}'),
    ]

    const { fieldConfidence } = fieldConfidenceFromTokens(tokens)

    expect(fieldConfidence.styleCode).toBe(0.99)
    // exp(mean(log .55, log .9)) = sqrt(.495) ≈ 0.70 — and crucially NOT the .725 an
    // arithmetic mean would give, because the doubt is in the number as a whole.
    expect(fieldConfidence.quantity).toBe(0.7)
  })

  it('2 · does not let the KEY inflate the value', () => {
    /*
     * The key is dictated by the schema, so its tokens are always near-certain. Scoring the
     * whole property would pull every field towards 1.0 in proportion to how long its NAME
     * is — `purchaseRequisitionId` would outrank `qty` for no reason but spelling.
     */
    const long: ChosenToken[] = [
      sure('{"purchaseRequisitionId":'),
      tok('"PR-1"', 0.4),
      sure('}'),
    ]
    const short: ChosenToken[] = [sure('{"qty":'), tok('4', 0.4), sure('}')]

    expect(fieldConfidenceFromTokens(long).fieldConfidence.purchaseRequisitionId).toBe(0.4)
    expect(fieldConfidenceFromTokens(short).fieldConfidence.qty).toBe(0.4)
  })

  it('3 · scores a list as one field, at the weight of everything in it', () => {
    // The `lines` behaviour the procurement tool used to approximate with a typed 0.68: one
    // badly-read lead time inside the array drags the whole field down, and the reviewer
    // sees `lines` sitting low and opens it.
    const tokens: ChosenToken[] = [
      sure('{"lines":['),
      tok('{"item":"a","leadDays":30}', 0.95),
      sure(','),
      tok('{"item":"b","leadDays":45}', 0.3),
      sure(']}'),
    ]

    const { fieldConfidence } = fieldConfidenceFromTokens(tokens)

    // sqrt(.95 × .3) ≈ 0.53 — the two elements, and nothing else.
    expect(fieldConfidence.lines).toBe(0.53)
  })

  it('4 · reconstructs the JSON exactly, because the tokens ARE the response', () => {
    const tokens: ChosenToken[] = [sure('{"a":'), tok('1', 0.9), sure('}')]
    const { text } = fieldConfidenceFromTokens(tokens)

    expect(text).toBe('{"a":1}')
    expect(JSON.parse(text)).toEqual({ a: 1 })
  })

  it('5 · scores a value whose only token also carries the next key', () => {
    /*
     * Real tokenisers do this constantly — `,"` is one token, and a one-digit value is
     * frequently glued to the punctuation after it. Requiring a token to be CONTAINED in the
     * span rather than to overlap it would leave `a` with nothing scored at all, and short
     * numeric fields are exactly the ones a reviewer cares most about.
     *
     * `b` is unaffected: the straddling token ends before `b`'s value begins, so the doubt
     * stays with the field the doubted digit belongs to.
     */
    const tokens: ChosenToken[] = [
      sure('{"a":'),
      tok('1,"b":', 0.5),
      tok('2', 0.8),
      sure('}'),
    ]

    const { fieldConfidence } = fieldConfidenceFromTokens(tokens)

    expect(fieldConfidence.a).toBe(0.5)
    expect(fieldConfidence.b).toBe(0.8)
  })

  it('5b · schema-forced punctuation does not vote', () => {
    /*
     * Found by a red test. Written to count every token inside the span, the `lines` case
     * above scored 0.78 — the brackets and the comma between the two elements arrived
     * near-certain and outvoted a clearly misread element. That is backwards: a longer list
     * is more to get wrong, not less, and the separators are not something the model decided.
     */
    const punctuated: ChosenToken[] = [
      sure('{"lines":['),
      tok('{"a":1}', 0.4),
      sure(','),
      tok('{"a":2}', 0.4),
      sure(']}'),
    ]

    // Both elements read at 0.4, so the field is 0.4 — not pulled up by the four certain
    // structural tokens surrounding them.
    expect(fieldConfidenceFromTokens(punctuated).fieldConfidence.lines).toBe(0.4)
  })

  it('5c · a value that is nothing BUT structure still scores', () => {
    // `{}` has no content tokens to fall back on, and the model's certainty about emitting
    // an empty object is the only signal there is. Must not throw.
    const tokens: ChosenToken[] = [sure('{"meta":'), tok('{}', 0.6), sure('}')]

    expect(fieldConfidenceFromTokens(tokens).fieldConfidence.meta).toBe(0.6)
  })

  it('6 · refuses to score an extraction with no logprobs at all', () => {
    /*
     * The fail-closed case, and the one that matters most. `responseLogprobs` is not
     * supported on every Gemini model. Returning a plausible number here instead of throwing
     * would put the whole of 6.3 back — a per-field score nothing measured — and it would be
     * invisible, because it would look exactly like a working extractor.
     */
    expect(() => fieldConfidenceFromTokens([])).toThrow(/nothing measured how sure it was/)
  })

  it('7 · clamps a rounding artefact rather than emitting an impossible score', () => {
    // A logprob of +1e-9 comes back from real providers at the top of the range. Unclamped
    // it becomes 1.000000001, which `assertExtractionConfidence` rejects three layers away
    // where the error reads as a schema fault.
    const tokens: ChosenToken[] = [
      { token: '{"a":', logProbability: 0 },
      { token: '1', logProbability: 1e-9 },
      { token: '}', logProbability: 0 },
    ]

    expect(fieldConfidenceFromTokens(tokens).fieldConfidence.a).toBe(1)
  })

  it('8 · every score is a probability', () => {
    const tokens: ChosenToken[] = [
      sure('{"a":'),
      tok('1', 0.01),
      sure(',"b":'),
      tok('2', 0.999),
      sure('}'),
    ]

    for (const value of Object.values(fieldConfidenceFromTokens(tokens).fieldConfidence)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('9 · does not produce a constant across fields, which is the whole point', () => {
    /*
     * `assertExtractionConfidence` refuses a uniform result without a justification, and
     * this provider supplies none. A derivation that collapsed to one number per extraction
     * would therefore fail at the door — correctly — so it is worth proving here that real
     * token variation comes through as field variation.
     */
    const tokens: ChosenToken[] = [
      sure('{"a":'),
      tok('1', 0.99),
      sure(',"b":'),
      tok('2', 0.42),
      sure(',"c":'),
      tok('3', 0.77),
      sure('}'),
    ]

    const scores = Object.values(fieldConfidenceFromTokens(tokens).fieldConfidence)
    expect(new Set(scores).size).toBe(3)
  })
})
