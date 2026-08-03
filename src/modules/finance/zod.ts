/**
 * Payloads for 11.1.
 *
 * There is deliberately no payload for `order_costs_actual` or `order_profitability`: both
 * are accrued from source by this module and nothing may hand them a figure. A cost somebody
 * can type is a cost somebody will type, and the whole value of a variance report is that
 * neither side of it was chosen by the person the report is about.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const money = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/, 'expected a money amount')
export const currency = z.string().length(3)

export const invoicePayload = z.object({
  orderId: z.string().uuid(),
  shipmentId: z.string().uuid().optional(),
  number: z.string().min(1).max(60),
  invoiceDate: isoDate,
  value: money,
  currency,
  documentId: z.string().uuid().optional(),
})

export const payablePayload = z
  .object({
    supplierPoId: z.string().uuid().optional(),
    grnId: z.string().uuid().optional(),
    reference: z.string().min(1).max(120),
    amount: money,
    currency,
    dueAt: isoDate,
  })
  .refine((p) => p.supplierPoId !== undefined || p.grnId !== undefined, {
    // A payable attributable to nothing cannot reach an order, which is why it is recorded.
    message: 'a payable must reference a supplier PO or a GRN',
    path: ['supplierPoId'],
  })

export const payPayablePayload = z.object({
  payableId: z.string().uuid(),
  paidAmount: money,
  paidAt: isoDate,
})

export const FINANCE_ZOD_MAP = {
  invoice: invoicePayload,
  payable: payablePayload,
  /** Recording a payment against an existing payable — an update, not an insert. */
  pay_payable: payPayablePayload,
} as const

export type InvoicePayload = z.infer<typeof invoicePayload>
export type PayablePayload = z.infer<typeof payablePayload>
