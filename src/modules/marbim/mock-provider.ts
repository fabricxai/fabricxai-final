/**
 * The deterministic provider — what `MARBIM_MOCK` selects.
 *
 * Retires the STUBS entry that said the flag was validated at boot and did nothing.
 *
 * It is NOT a stub that returns fixed data. It reads the input, extracts what it can find by
 * explicit rules, and produces per-field confidence that reflects how it found each value —
 * a labelled match scores higher than an inferred one. That matters for two reasons:
 *
 *  1. It exercises the real confidence path. A mock returning a constant would sail past
 *     `assertExtractionConfidence`, which is the check the whole module is built around, and
 *     the first real extractor would then be the first thing to ever test it.
 *  2. Somebody demoing without an API key sees the system behave as it will in production —
 *     including the approve inbox ranking a weak field below a strong one.
 *
 * Everything it does is a documented rule, so a demo is reproducible and a test is stable.
 */
import type { ZodType } from 'zod'

import {
  ProviderError,
  type EmbedRequest,
  type EmbedResult,
  type ExtractRequest,
  type ExtractResult,
  type MarbimProvider,
  type TextRequest,
  type TextResult,
} from './provider'

/**
 * How a value was found, and what that is worth.
 *
 * Three tiers rather than one number, because `assertExtractionConfidence` refuses a constant
 * and it is right to. The tiers encode two independent questions: did a LABEL point at this
 * field, and did the value it pointed at look like what that field should contain. Those come
 * apart in real documents, and when they do the answer is genuinely less trustworthy.
 */
const CONFIDENCE = {
  /** A label named the field AND the value matched the shape expected for it. */
  verified: 0.94,
  /** A label named the field; nothing was available to check the value against. */
  labelled: 0.82,
  /**
   * A label named the field and the value did NOT look like what that field holds —
   * `Quantity: to be confirmed`. Scored lowest on purpose: this is the one a reviewer
   * should reach first, and a flat score would bury it among the fields that were fine.
   */
  contradicted: 0.45,
} as const

const LABEL_PATTERNS: readonly { field: RegExp; capture: RegExp }[] = [
  { field: /quantity|qty|pieces|pcs/i, capture: /([\d,]+)\s*(?:pcs|pieces)?/i },
  { field: /style|art(?:icle)?\s*no/i, capture: /([A-Z][A-Z0-9-]{2,})/ },
  { field: /price|fob|unit\s*price/i, capture: /([\d]+\.?\d*)/ },
  { field: /ship|delivery|ex[- ]?factory/i, capture: /(\d{4}-\d{2}-\d{2})/ },
  // Last, so it cannot shadow the patterns above. A buyer's PO writes "PO Number: X" while
  // the schema calls the field `poNumbers`, and plain substring matching never bridges the
  // two — which left the single most important intake kind unreadable by the mock, so
  // nobody without an API key could see it work.
  { field: /po[\s_-]*numbers?/i, capture: /([A-Za-z0-9][A-Za-z0-9/-]{2,})/ },
]

/**
 * Pull a labelled value out of a line like `Quantity: 12,000 pcs`.
 *
 * Line-oriented on purpose: enquiry emails and tech packs are written as labelled lines, and
 * a regex over the whole document would happily match a quantity from one paragraph against
 * a label in another.
 *
 * **There is deliberately no unlabelled fallback.** An earlier version searched the whole
 * document for a field's shape when no label was found, and on an ordinary enquiry email it
 * confidently produced `styleCode: "USD"` and read a target price of 12 out of "12,000 pcs".
 * A shape match with no label attached is not an extraction, it is a coincidence — and a mock
 * that ships coincidences teaches a demo audience to trust the thing that most needs
 * checking. If nothing labels a field, this extractor does not have it.
 */
function findLabelled(
  text: string,
  fieldName: string,
): { value: string; how: keyof typeof CONFIDENCE } | null {
  const pattern = LABEL_PATTERNS.find((entry) => entry.field.test(fieldName))

  for (const line of text.split(/\r?\n/)) {
    const [label, ...rest] = line.split(/[:=]/)
    if (!label || rest.length === 0) continue

    const looksLikeThisField =
      label.toLowerCase().includes(fieldName.toLowerCase()) ||
      (pattern?.field.test(label) ?? false)
    if (!looksLikeThisField) continue

    const value = rest.join(':').trim()
    if (!value) continue

    if (!pattern) return { value, how: 'labelled' }

    const match = pattern.capture.exec(value)
    return match?.[1]
      ? { value: match[1].replace(/,/g, ''), how: 'verified' }
      : { value, how: 'contradicted' }
  }

  return null
}

/**
 * Turn the found string into whatever this field's schema actually accepts — asking the
 * schema rather than guessing.
 *
 * The guessing version coerced any run of digits to a number, which is right for a quantity
 * and wrong for every money field in this system: amounts are decimal STRINGS repo-wide
 * (CLAUDE.md rule 4), and `targetPrice: 4` would have been the one place a price entered as a
 * float. Rather than encode which field names are money — a list that goes stale the first
 * time somebody adds one — try the candidates against the field's own zod type and keep what
 * passes.
 *
 * Returns `undefined` when neither form is accepted. Emitting a value the target schema
 * refuses does not extract anything; it just moves the failure to approve time, where a
 * person is waiting.
 */
function coerceToSchema(raw: string, fieldSchema: ZodType | undefined): unknown {
  const candidates: unknown[] = /^\d+$/.test(raw) ? [Number.parseInt(raw, 10), raw] : [raw]

  // A labelled line can legitimately answer a LIST field: `PO Numbers: A-1, A-2` is two,
  // and `PO Number: A-1` is one. Both are appended rather than prepended, so `safeParse`
  // still prefers the scalar forms wherever the schema takes one — an array is only ever
  // chosen because the field genuinely wants a list.
  if (/[,;]/.test(raw)) {
    candidates.push(
      raw
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
  }
  candidates.push([raw])

  if (!fieldSchema) return candidates[0]

  for (const candidate of candidates) {
    if (fieldSchema.safeParse(candidate).success) return candidate
  }
  return undefined
}

/** FNV-1a. Small, fast, and stable across runs — which is the only property that matters. */
function fnv1a(token: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * One list entry, assembled from the labelled lines.
 *
 * A buyer's PO for a single style writes `Style: SHRT-4410` / `Quantity: 12,000` /
 * `Unit Price: 6.40` as headers, and the target schema wants those as one element of a
 * `styles` array. Reading them as a flat header block and then failing because the array
 * is empty is the difference between an order that drafts and one that never does.
 *
 * Deliberately ONE element, never a guess at several. Splitting a multi-style PO into rows
 * needs table structure this reads nothing of, and inventing a second style — or worse,
 * merging two into one — is the sort of confident error the approve inbox is least likely
 * to catch. If the document has more, the reviewer adds them.
 *
 * The element's confidence is the WEAKEST of its fields. A `styles` entry is only as
 * trustworthy as the least certain thing in it, and averaging would let a firmly-read style
 * code carry a shakily-read quantity past a reviewer's attention.
 */
function singleElementList(
  text: string,
  fieldSchema: ZodType | undefined,
): { value: unknown[]; confidence: number } | null {
  if (!fieldSchema) return null

  const element = (fieldSchema as unknown as { def?: { type?: string }; element?: ZodType })
  if (element.def?.type !== 'array' || !element.element) return null

  const elementShape = (element.element as unknown as { shape?: Record<string, ZodType> }).shape
  if (!elementShape) return null

  const entry: Record<string, unknown> = {}
  let weakest = 1

  for (const [field, subSchema] of Object.entries(elementShape)) {
    const found = findLabelled(text, field)
    if (!found) continue

    const coerced = coerceToSchema(found.value, subSchema)
    if (coerced === undefined) continue

    entry[field] = coerced
    weakest = Math.min(weakest, CONFIDENCE[found.how])
  }

  if (Object.keys(entry).length === 0) return null

  // Checked against the element's own schema, not assumed. A partial entry that the schema
  // refuses is not a list — emitting it would move the failure to approve time, where a
  // person is waiting on a draft that was never going to validate.
  const parsed = (element.element as ZodType).safeParse(entry)
  if (!parsed.success) return null

  return { value: [parsed.data], confidence: weakest }
}

export const mockProvider: MarbimProvider = {
  id: 'mock/deterministic-v1',

  async extract<T>(request: ExtractRequest<T>): Promise<ExtractResult<T>> {
    if (!request.input.trim()) {
      // Not retryable: an empty document will be empty next time too, and a queue that
      // keeps retrying one is a queue that never drains.
      throw new ProviderError('nothing to extract from', { retryable: false })
    }

    const shape = (request.schema as unknown as { shape?: Record<string, ZodType> }).shape
    if (!shape) {
      throw new ProviderError('the mock provider can only extract into an object schema', {
        retryable: false,
      })
    }

    const value: Record<string, unknown> = {}
    const fieldConfidence: Record<string, number> = {}

    for (const [field, fieldSchema] of Object.entries(shape)) {
      const found = findLabelled(request.input, field)
      const coerced = found
        ? coerceToSchema(found.value, fieldSchema as ZodType | undefined)
        : undefined

      if (found && coerced !== undefined) {
        value[field] = coerced
        fieldConfidence[field] = CONFIDENCE[found.how]
        continue
      }

      /**
       * A list of objects, built from the labelled lines using the ELEMENT's own field
       * names. Most documents that carry a list carry exactly one — a PO for one style, a
       * quote for one item — and the header lines are that entry's fields.
       *
       * Reached when the scalar read found nothing OR found something the field could not
       * accept, and the second case is not hypothetical: `styles` matches the STYLE label
       * pattern, so it "found" `SHRT-4410`, failed to coerce a string into an array of
       * objects, and skipped the field entirely. Every PO draft was rejected for a missing
       * `styles` while the answer sat two lines above.
       */
      const line = singleElementList(request.input, fieldSchema as ZodType | undefined)
      if (line) {
        value[field] = line.value
        fieldConfidence[field] = line.confidence
      }
    }

    if (Object.keys(value).length === 0) {
      throw new ProviderError('no fields could be read from this input', { retryable: false })
    }

    return {
      value: value as T,
      fieldConfidence,
      method: 'mock/labelled-line-match',
      model: mockProvider.id,
    }
  },

  /**
   * A deterministic LEXICAL embedding: tokens hashed into buckets, then normalised.
   *
   * It is not semantic and does not pretend to be — it does not know that "tee" and
   * "t-shirt" are the same garment. What it does give is a real, explainable similarity:
   * two styles that share `producttype=tshirt`, `gsm=180` and `construction=single jersey`
   * come out genuinely close, and two that share nothing come out at zero. That is enough
   * for `findSimilar` to behave correctly in tests and in a demo, and — unlike a random
   * vector — it never produces a confident match between unrelated styles.
   *
   * Deterministic across processes: no randomness, no clock, no map iteration order in the
   * arithmetic. The same text embeds to the same vector forever, which is what makes
   * `sourceHash` a valid "does this need re-embedding" test.
   */
  async embed(request: EmbedRequest): Promise<EmbedResult> {
    if (request.dimensions <= 0) {
      throw new ProviderError(`cannot embed into ${request.dimensions} dimensions`, {
        retryable: false,
      })
    }

    const vectors = request.inputs.map((input) => {
      const weights = new Array<number>(request.dimensions).fill(0)

      for (const token of input.toLowerCase().split(/[^a-z0-9.]+/)) {
        if (!token) continue
        const bucket = fnv1a(token) % request.dimensions
        weights[bucket] = (weights[bucket] ?? 0) + 1
      }

      // L2 normalise so cosine distance is comparable between a short attribute list and a
      // long tech pack. Without it, the longer document is "closer" to everything.
      const magnitude = Math.sqrt(weights.reduce((squares, w) => squares + w * w, 0))
      if (magnitude === 0) {
        // Nothing tokenised. A zero vector has no direction, so cosine distance against it
        // is undefined and pgvector would return NaN — refuse rather than store one.
        throw new ProviderError('nothing in this text could be embedded', { retryable: false })
      }
      return weights.map((w) => w / magnitude)
    })

    return { vectors, model: `${mockProvider.id}/embed` }
  },

  async generate(request: TextRequest): Promise<TextResult> {
    const question = request.messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''

    // Stays in character with the standing rules: it does not invent numbers, and it says
    // what it would need. A mock that answered confidently would teach a demo audience the
    // opposite of how the real thing behaves.
    const offered = request.tools?.map((tool) => tool.name) ?? []
    const text = offered.length
      ? `I would need to look that up before answering. Tools available here: ${offered
          .slice(0, 5)
          .join(', ')}. (Deterministic provider — no model is configured.)`
      : 'No tools are available in this scope, so I have nothing to read a figure from. (Deterministic provider — no model is configured.)'

    void question
    return { text, toolCalls: [], model: mockProvider.id }
  },
}
