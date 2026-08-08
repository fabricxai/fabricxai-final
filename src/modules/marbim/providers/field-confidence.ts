/**
 * Per-field confidence, derived from the tokens the model actually emitted.
 *
 * This is the file 6.3 was clearing the ground for. `assertExtractionConfidence` refuses a
 * constant, `no-invented-confidence` refuses a literal, and the eight modules that had typed
 * plausible numbers into their draft tools have had them removed — all of which only matters
 * if something can produce the real thing. This is that something.
 *
 * ## What a logprob is here
 *
 * Gemini returns, alongside the JSON, the log-probability of every token it chose. A token
 * the model was certain about sits near `log(1) = 0`; one it nearly emitted differently sits
 * well below. Exponentiating gives the probability the model assigned to the token it picked.
 *
 * A FIELD's confidence is the geometric mean of the probabilities of the tokens that make up
 * its value — `exp(mean(logprob))`. Geometric, not arithmetic, for a specific reason: a
 * five-token quantity where four tokens are certain and one is a coin-flip should not score
 * 0.9. The doubt is in the value as a whole, and a value is only as read as its least-read
 * digit. The geometric mean is what multiplies the probabilities and then normalises for
 * length, so `12,000` and `12,000,000` are comparable.
 *
 * ## Why the value span and not the whole property
 *
 * The key — `"quantity":` — is dictated by the schema. The model has no freedom there, so
 * those tokens are always near-certain and including them would drag every field towards 1.0
 * in proportion to how long its NAME is. Only the value is scored.
 *
 * ## Structural tokens are excluded too, INCLUDING inside a value
 *
 * Braces, brackets, commas and quotes are schema-forced wherever they appear. The separators
 * between eight quote lines are not something the model decided; they are what an array of
 * eight things looks like. They arrive near-certain, so counting them pulls every list-valued
 * field towards 1.0 in proportion to how many elements it has — which is backwards, since a
 * longer list is more to get wrong, not less.
 *
 * Written the other way first, and a red test caught it: a `lines` array with one clearly
 * misread element scored 0.78 because the punctuation outvoted the doubt. It now scores 0.53.
 * A token is judged on the part of it that falls inside the span, so `,"leadDays":` between
 * two elements drops out while the digits either side stay.
 *
 * ## Nested and list fields collapse to their top-level name
 *
 * `pending_changes.field_confidence` is keyed by the payload's own field names and the
 * approve inbox renders one row per field. A `lines` array of eight quote lines scores as one
 * `lines` figure — the geometric mean across every token in the array, so one badly-read
 * lead time inside it drags the whole field down and a reviewer sees `lines` sitting low.
 * That is the correct behaviour for a screen that asks "which field do I re-read", and it is
 * what the deleted constants were approximating by hand.
 */

/** One token the model chose, with the log-probability it assigned to that choice. */
export interface ChosenToken {
  token: string
  logProbability: number
}

export class ConfidenceError extends Error {
  override readonly name = 'ConfidenceError'
}

/**
 * A confidence must be a probability. Clamped rather than trusted: a provider returning a
 * positive logprob (some do, through rounding at the top of the range) would otherwise
 * produce a 1.0000001 that `assertExtractionConfidence` rejects three layers away, where the
 * error would read as a schema problem.
 */
const clamp = (value: number): number => Math.min(1, Math.max(0, value))

/** Two decimals. The inbox shows a bar and a number; more precision is false precision. */
/**
 * Four decimals, and the precision is load-bearing.
 *
 * At two, a model transcribing an easy document at temperature 0 — per-token probability
 * 0.995 and up — rounded EVERY field to exactly 1.00, and `assertExtractionConfidence`
 * then correctly refused the result as "a constant, not a measurement": the rounding had
 * destroyed precisely the variation the guard exists to check for. Found live, on a clean
 * tech pack whose extraction deserved to land. Four decimals keeps 0.9987 and 0.9992
 * distinct; screens are free to FORMAT coarser than the measurement they render.
 */
const round = (value: number): number => Number(value.toFixed(4))

/**
 * A slice the schema forced: JSON punctuation and whitespace, nothing else.
 *
 * Note this cannot match inside a string VALUE — a note reading `qty {revised}, see p.2`
 * arrives as tokens carrying letters, so only the slices that are purely punctuation drop
 * out. The opening and closing quotes of a string are structure and correctly go.
 */
const STRUCTURE_ONLY = /^[[\]{},:"\s]*$/

interface Span {
  /** Inclusive character offset into the reconstructed JSON. */
  start: number
  /** Exclusive. */
  end: number
}

/**
 * Where each top-level property's VALUE sits in the JSON text.
 *
 * Hand-walked rather than done with `JSON.parse` and a regex, because the offsets are the
 * whole point and `JSON.parse` throws them away. A regex cannot do it either: a string value
 * may contain `{`, `}`, `"` and `,`, and a buyer's amendment note routinely does.
 */
export function topLevelValueSpans(json: string): Record<string, Span> {
  const spans: Record<string, Span> = {}

  let i = 0
  const skipWhitespace = () => {
    while (i < json.length && /\s/.test(json[i]!)) i += 1
  }

  /** Read a JSON string starting at an opening quote, honouring escapes. */
  const readString = (): string => {
    let out = ''
    i += 1 // opening quote
    while (i < json.length) {
      const ch = json[i]!
      if (ch === '\\') {
        // Kept verbatim: the caller only needs the key's identity, and unescaping here would
        // mean reimplementing \u handling for no gain.
        out += ch + (json[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === '"') {
        i += 1
        return out
      }
      out += ch
      i += 1
    }
    throw new ConfidenceError('unterminated string in the extraction JSON')
  }

  /** Advance past one complete value, whatever kind it is. Returns where it ended. */
  const skipValue = (): number => {
    skipWhitespace()
    const ch = json[i]

    if (ch === '"') {
      readString()
      return i
    }

    if (ch === '{' || ch === '[') {
      // Depth counting, with strings skipped whole — a `}` inside a note is not a close.
      const open = ch
      const close = ch === '{' ? '}' : ']'
      let depth = 0
      while (i < json.length) {
        const c = json[i]!
        if (c === '"') {
          readString()
          continue
        }
        if (c === open) depth += 1
        if (c === close) {
          depth -= 1
          i += 1
          if (depth === 0) return i
          continue
        }
        i += 1
      }
      throw new ConfidenceError('unterminated object or array in the extraction JSON')
    }

    // A literal: number, true, false, null. Ends at the next structural character.
    while (i < json.length && !/[,}\]\s]/.test(json[i]!)) i += 1
    return i
  }

  skipWhitespace()
  if (json[i] !== '{') throw new ConfidenceError('the extraction did not return a JSON object')
  i += 1

  for (;;) {
    skipWhitespace()
    if (json[i] === '}') break
    if (json[i] === ',') {
      i += 1
      continue
    }
    if (json[i] !== '"') {
      throw new ConfidenceError('expected a property name in the extraction JSON')
    }

    const key = readString()
    skipWhitespace()
    if (json[i] !== ':') throw new ConfidenceError(`no value for "${key}" in the extraction JSON`)
    i += 1
    skipWhitespace()

    const start = i
    const end = skipValue()
    spans[key] = { start, end }
  }

  return spans
}

/**
 * Rebuild the emitted text and note where each token landed in it.
 *
 * The tokens ARE the response — concatenating them reproduces it exactly — so the offsets
 * are exact rather than a fuzzy alignment. That is the reason this works at all: matching
 * logprobs back onto a separately-returned string would be guesswork the moment a token
 * straddles a value boundary.
 */
function placeTokens(tokens: readonly ChosenToken[]): {
  text: string
  placed: { span: Span; logProbability: number }[]
} {
  let text = ''
  const placed: { span: Span; logProbability: number }[] = []

  for (const token of tokens) {
    const start = text.length
    text += token.token
    placed.push({ span: { start, end: text.length }, logProbability: token.logProbability })
  }

  return { text, placed }
}

export interface FieldConfidenceResult {
  /** Field name → the geometric mean of its tokens' probabilities. */
  fieldConfidence: Record<string, number>
  /** The JSON as the model emitted it, reconstructed from the tokens. */
  text: string
}

/**
 * Score every top-level field of an extraction from its tokens.
 *
 * Throws rather than guessing. An extraction that cannot be scored must fail: `propose`
 * requires per-field confidence on `ai_extraction`, and the alternative to failing here is
 * inventing a number, which is the defect this whole path exists to prevent (audit AI-B2).
 */
export function fieldConfidenceFromTokens(
  tokens: readonly ChosenToken[],
): FieldConfidenceResult {
  if (tokens.length === 0) {
    throw new ConfidenceError(
      'the model returned no token log-probabilities, so nothing measured how sure it was — ' +
        'enable responseLogprobs, or the extraction cannot carry confidence',
    )
  }

  const { text, placed } = placeTokens(tokens)
  let spans = topLevelValueSpans(text)
  let valueText = text

  /*
   * The schema-echo unwrap.
   *
   * Handed a JSON Schema as `response_format`, gpt-4o-mini sometimes returns the ENVELOPE
   * with the answer inside it: `{"type":"object","properties":{...the real fields...}}`.
   * Whether it does depends on the document's text shape — the same tech pack extracted
   * clean from pdftotext output and came back wrapped from a browser's flattened copy, so
   * the first live tester hit it and the rehearsal did not.
   *
   * Detected by the signature, not guessed: a top level of exactly `type`/`properties`
   * (`required` tolerated) where `type` is the literal string "object" is the envelope —
   * no draft schema in this system names those fields. The spans are re-derived INSIDE the
   * `properties` object and shifted to absolute offsets, so every score is still computed
   * from the tokens that produced the actual value, not the wrapper punctuation.
   */
  const echoKeys = Object.keys(spans)
  const isEcho =
    echoKeys.includes('type') &&
    echoKeys.includes('properties') &&
    echoKeys.every((k) => k === 'type' || k === 'properties' || k === 'required') &&
    text.slice(spans.type!.start, spans.type!.end).trim() === '"object"'

  if (isEcho) {
    const outer = spans.properties!
    valueText = text.slice(outer.start, outer.end)
    const inner = topLevelValueSpans(valueText)
    spans = Object.fromEntries(
      Object.entries(inner).map(([field, span]) => [
        field,
        { start: span.start + outer.start, end: span.end + outer.start },
      ]),
    )
  }

  const fieldConfidence: Record<string, number> = {}

  for (const [field, span] of Object.entries(spans)) {
    // Any overlap counts. A single token can carry the end of one value and the comma
    // before the next; excluding it would silently drop the last token of short fields,
    // which are exactly the numeric ones a reviewer cares most about.
    const inside = placed.filter((t) => t.span.start < span.end && t.span.end > span.start)

    if (inside.length === 0) {
      throw new ConfidenceError(`no tokens scored for "${field}" — the alignment is wrong`)
    }

    // Judged on the overlapping slice, not the whole token: `,"leadDays":` between two list
    // elements is schema-forced and drops out, while a token carrying both a digit and the
    // following comma stays.
    const chosen = inside.filter((t) => {
      const slice = text.slice(Math.max(t.span.start, span.start), Math.min(t.span.end, span.end))
      return !STRUCTURE_ONLY.test(slice)
    })

    // A value that is ENTIRELY structure — `{}`, `[]` — has nothing else to score, and the
    // model's certainty about emitting an empty object is the only signal there is.
    const scored = chosen.length > 0 ? chosen : inside

    const mean = scored.reduce((sum, t) => sum + t.logProbability, 0) / scored.length
    fieldConfidence[field] = round(clamp(Math.exp(mean)))
  }

  if (Object.keys(fieldConfidence).length === 0) {
    throw new ConfidenceError('the extraction returned an empty object')
  }

  // The text the caller parses is the text the spans were scored against — after an
  // unwrap, that is the inner object, so value and confidence cannot disagree.
  return { fieldConfidence, text: valueText }
}
