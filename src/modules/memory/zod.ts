/**
 * Payloads for 1.6.
 *
 * The module registers NO pending targets of its own — its one drafting operation,
 * `seedCostSheet`, proposes into 1.5's `boms` using 1.5's schema. That is deliberate: the
 * module that owns a table owns what may be written to it, and a memory module that could
 * define its own shape for somebody else's bill of materials would be a second, drifting
 * definition of what a BOM is.
 */
import { z } from 'zod'

export const styleAttrs = z.record(
  z.string().min(1),
  z.union([z.string(), z.number(), z.null()]),
)

export const embedStyleInput = z.object({
  styleCode: z.string().min(1),
  attrs: styleAttrs.default({}),
  techPackText: z.string().optional(),
})

/**
 * What to find similar orders TO.
 *
 * Either an existing style code — the panel 1.2 shows beside an enquiry — or a set of
 * attributes typed straight in, for a style that does not exist yet. That second case is the
 * one that matters commercially: it is a merchandiser asking "have we made anything like
 * this?" about something nobody has costed.
 */
export const findSimilarInput = z
  .object({
    styleCode: z.string().min(1).optional(),
    attrs: styleAttrs.optional(),
    techPackText: z.string().optional(),
    k: z.number().int().positive().max(20).default(3),
  })
  .refine((input) => Boolean(input.styleCode) || Boolean(input.attrs), {
    message: 'give a styleCode or some attributes to match against',
  })

export const seedCostSheetInput = z.object({
  fromOrderId: z.uuid(),
  targetRfqId: z.uuid(),
})

export const compileOutcomeInput = z.object({
  orderId: z.uuid(),
})

/** What the `memory.order_outcome` tool takes. */
export const outcomeLookupInput = z.object({
  orderId: z.uuid(),
})

export const outcomeNoteInput = z.object({
  orderId: z.uuid(),
  /** Empty clears it; a merchandiser who wrote the wrong thing must be able to remove it. */
  merchandiserNote: z.string().max(4_000),
})

export type EmbedStyleInput = z.infer<typeof embedStyleInput>
export type FindSimilarInput = z.infer<typeof findSimilarInput>
export type SeedCostSheetInput = z.infer<typeof seedCostSheetInput>
