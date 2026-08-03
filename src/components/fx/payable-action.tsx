'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert, Modal } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Button } from '@/components/fx/primitives'
import { requestPayablePayment } from '@/modules/finance/actions'

/**
 * "Record a payment" on a payable row (canvas P4).
 *
 * It raises a REQUEST. The canvas routes it to the approve inbox with the owner as
 * approver, and the wording here says so plainly, because a button labelled "pay" that
 * quietly asks somebody else to pay is worse than either behaviour on its own — the person
 * who clicked it walks away believing the supplier has been paid.
 */
export function PayableAction({
  payableId,
  reference,
  amount,
  currency,
  outstanding,
}: {
  payableId: string
  reference: string
  amount: string
  currency: string
  outstanding: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [paying, setPaying] = useState(outstanding)
  const [asked, setAsked] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  function request() {
    setFailure(null)
    startTransition(async () => {
      try {
        await requestPayablePayment({
          payableId,
          paidAmount: paying.trim(),
          paidAt: new Date().toISOString().slice(0, 10),
        })
        setAsked(true)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The request was not raised.'))
      }
    })
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Record a payment
      </Button>

      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Payment · ${reference}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              {asked ? null : (
                <Button variant="primary" disabled={!paying.trim() || pending} onClick={request}>
                  {pending ? 'Requesting…' : 'Send for approval'}
                </Button>
              )}
            </>
          }
        >
          {asked ? (
            <InlineAlert tone="success">
              The request is in the owner&rsquo;s approve inbox. Nothing has been paid yet —
              the payable stays open until they sign it.
            </InlineAlert>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>
                  Amount to pay ({currency})
                </span>
                <input
                  inputMode="decimal"
                  value={paying}
                  onChange={(e) => setPaying(e.target.value)}
                  style={{
                    minHeight: 44,
                    padding: '10px 12px',
                    border: '1px solid var(--fx-border-default)',
                    borderRadius: 'var(--fx-radius-sm)',
                    background: 'var(--fx-bg-surface)',
                    color: 'var(--fx-text-primary)',
                    font: "400 14px/1.4 var(--fx-font-sans)",
                  }}
                />
              </label>
              <span
                style={{
                  font: "400 12px/1.6 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                Invoiced {amount} {currency} · {outstanding} {currency} outstanding. Part
                payments are allowed — the payable stays open until the balance is settled.
              </span>
              <InlineAlert tone="info">
                approver · owner. Money leaving the factory is signed off by somebody other
                than the person who arranged the delivery.
              </InlineAlert>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  )
}
