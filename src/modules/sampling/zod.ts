/**
 * Payloads for 1.4, including every `pending_changes` payload.
 *
 * `feedbackRoundPayload` is the one that matters. It is what MARBIM drafts when it reads
 * a buyer's comment sheet, and it is what decides whether a cutting floor may start — so
 * the verdict is a closed enum with no default. A payload that could arrive without a
 * verdict is a payload that could clear a gate by omission.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const money = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/, 'expected a money amount')

export const sampleTypes = ['proto', 'fit', 'sms', 'pp', 'top', 'shipment'] as const
export const sampleStages = [
  'pattern',
  'cutting',
  'sewing',
  'finishing',
  'qc',
  'dispatched',
] as const

export const sampleRequestPayload = z
  .object({
    rfqId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    type: z.enum(sampleTypes),
    styleCode: z.string().min(1),
    requestNo: z.string().min(1).max(60),
    dueDate: isoDate.optional(),
  })
  .refine((r) => (r.rfqId === undefined) !== (r.orderId === undefined), {
    // A proto sample is made to win an order; a PP sample is made against one that
    // exists. A row in both flows is read by neither screen.
    message: 'a sample request belongs to an RFQ or to an order, never both',
    path: ['orderId'],
  })
  .refine((r) => r.type !== 'pp' || r.orderId !== undefined, {
    // There is no such thing as a pre-production sample for an order that does not exist,
    // and the PP gate looks the sample up BY order.
    message: 'a PP sample must belong to an order',
    path: ['orderId'],
  })

export const stageAdvancePayload = z.object({
  sampleRequestId: z.string().uuid(),
  stage: z.enum(sampleStages),
  occurredAt: z.string().optional(),
  offlineKey: z.string().min(1).max(120).optional(),
})

export const dispatchPayload = z.object({
  sampleRequestId: z.string().uuid(),
  courier: z.string().min(1).max(120),
  awb: z.string().min(1).max(120),
  dispatchedAt: z.string().optional(),
})

export const feedbackRoundPayload = z.object({
  sampleRequestId: z.string().uuid(),
  /** No default. A verdict that could arrive by omission could clear a gate by omission. */
  verdict: z.enum(['approved', 'approved_with_comments', 'rejected']),
  comments: z
    .array(
      z.object({
        area: z.string().min(1),
        comment: z.string().min(1),
        /** Page of the buyer's comment sheet, so a reviewer can check the extraction. */
        page: z.number().int().min(1).optional(),
      }),
    )
    .default([]),
  recordedOn: isoDate,
  documentId: z.string().uuid().optional(),
})

export const sampleCostPayload = z.object({
  sampleRequestId: z.string().uuid(),
  amount: money,
  currency: z.string().length(3).default('BDT'),
  note: z.string().max(500).optional(),
})

export const SAMPLING_ZOD_MAP = {
  sample_request: sampleRequestPayload,
  feedback_round: feedbackRoundPayload,
} as const

export type SampleRequestPayload = z.infer<typeof sampleRequestPayload>
export type FeedbackRoundPayload = z.infer<typeof feedbackRoundPayload>
export type StageAdvancePayload = z.infer<typeof stageAdvancePayload>
