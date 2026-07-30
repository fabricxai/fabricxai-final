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
  if (!fieldSchema) return candidates[0]

  for (const candidate of candidates) {
    if (fieldSchema.safeParse(candidate).success) return candidate
  }
  return undefined
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
      if (!found) continue

      const coerced = coerceToSchema(found.value, fieldSchema as ZodType | undefined)
      if (coerced === undefined) continue

      value[field] = coerced
      fieldConfidence[field] = CONFIDENCE[found.how]
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
