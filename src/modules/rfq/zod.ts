/**
 * Payloads for 1.2, including every `pending_changes` payload.
 *
 * `rfqPayload` is what MARBIM drafts from a buyer's enquiry email or PDF — the brief's
 * "text/PDF/photo → pending_change" path. Every field a win later requires is optional
 * HERE, because an enquiry genuinely arrives incomplete; the refusal happens at `markWon`,
 * where the missing size ratio actually stops an order being created.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const money = (scale = 4) =>
  z.string().regex(new RegExp(`^\\d{1,14}(\\.\\d{1,${scale}})?$`), 'expected a money amount')

export const rfqPayload = z.object({
  buyerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  productType: z.string().min(1).max(80),
  description: z.string().max(4000).optional(),
  styleCode: z.string().max(60).optional(),
  quantity: z.number().int().min(1),
  unit: z.string().min(1).max(10).default('pcs'),
  /** size → parts. Optional on an enquiry; required by the time it is won. */
  sizeRatio: z.record(z.string().min(1), z.number().int().min(0)).default({}),
  targetPrice: money().optional(),
  targetCurrency: z.string().length(3).optional(),
  currency: z.string().length(3).default('USD'),
  deadline: isoDate.optional(),
  requestedShipDate: isoDate.optional(),
  source: z.enum(['manual', 'ai_extracted']).default('manual'),
  ownerUserId: z.string().optional(),
})

/**
 * What `markWon` may be handed: the id, plus whichever winning terms the buyer's acceptance
 * fixed. An enquiry genuinely arrives without a firm ship date ("mid-November window") or a
 * size ratio — those get agreed in the acceptance, and the moment of winning is the last
 * honest place to record them. Absent here means "the RFQ already has it"; `wonPayload`
 * still refuses a win that ends up with neither.
 */
export const wonInput = z.object({
  rfqId: z.string().uuid(),
  requestedShipDate: isoDate.optional(),
  sizeRatio: z.record(z.string().min(1), z.number().int().min(1)).optional(),
})

export const clarificationPayload = z.object({
  rfqId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  askedAt: isoDate,
})

export const RFQ_ZOD_MAP = {
  rfq: rfqPayload,
} as const

export type RfqPayload = z.infer<typeof rfqPayload>
