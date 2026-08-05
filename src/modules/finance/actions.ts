'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

import { propose } from '@/modules/core/pending-changes'
import { requireRole } from '@/modules/core/session'

/**
 * Ask for a payment to be released (canvas P4: "finance.recordPayment → Approve inbox ·
 * approver: OWNER").
 *
 * A request, not a payment. Money leaving the factory is approved by somebody other than
 * the person who arranged the delivery — that separation is the whole control, and a screen
 * that paid on click would remove it while looking identical.
 *
 * The amount and date travel on the draft, so the owner signs a number rather than a
 * supplier's name.
 */
export async function requestPayablePayment(input: {
  payableId: string
  paidAmount: string
  paidAt: string
}): Promise<{ pendingChangeId: string }> {
  const ctx = await requireRole(await headers(), 'finance', 'commercial')

  const { id } = await propose(ctx, {
    moduleId: 'finance',
    targetTable: 'payables',
    // An update, so the row it changes must be named — and `propose` enforces that an
    // update carries a target while an insert does not.
    targetId: input.payableId,
    operation: 'update',
    zodSchemaKey: 'pay_payable',
    // A person read an invoice and typed this. No extractor, so no field confidence.
    source: 'user_draft',
    payload: { ...input },
  })

  revalidatePath('/approve')
  revalidatePath('/finance')

  return { pendingChangeId: id }
}
