'use client'

import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { requestUdOverride } from '@/modules/commercial/actions'

export interface UdBlock {
  udId: string
  udNumber: string
  itemRef: string
  unit: string
  /** What was asked for. */
  qty: string
  authorized: string | null
  consumed: string | null
  free: string | null
  shortfall: string | null
  reasonKey: string | null
  storeIssueId?: string
}

/**
 * The blocked-issue card (UD workbench canvas P3).
 *
 * **One pattern, two hosts.** The canvas is explicit that this same card renders inside
 * `store.issueToProduction` and on the UD workbench, and that is worth honouring literally:
 * a storekeeper who has seen this card in the store recognises it instantly on the
 * workbench, and the wording of a legal refusal should not vary by which screen you reached
 * it from.
 *
 * Three things it must say, in this order:
 *
 *  1. **What is blocked, with the numbers.** "Insufficient balance" is not actionable;
 *     "3,200 yd authorised, 3,050 already drawn, you asked for 400 — short by 250" is.
 *  2. **That nothing was written.** A storekeeper who thinks a partial issue went through
 *     will go and look for fabric that is still on the shelf, or re-enter it and double-draw.
 *  3. **The ways out, honestly.** Split the issue, use general stock, or ask an owner. There
 *     is no "proceed anyway", because drawing past a customs undertaking is duty plus
 *     penalty and no screen should offer it as a button.
 */
export function UdBlockCard({
  block,
  onRequested,
}: {
  block: UdBlock
  onRequested?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [asked, setAsked] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // The service refuses a reason under ten characters, and finding that out after a round
  // trip on a screen that has already refused you once is its own small insult.
  const canAsk = reason.trim().length >= 10

  function ask() {
    setFailure(null)
    startTransition(async () => {
      try {
        await requestUdOverride({
          udId: block.udId,
          itemRef: block.itemRef,
          qty: block.qty,
          unit: block.unit,
          ...(block.storeIssueId ? { storeIssueId: block.storeIssueId } : {}),
          reason: reason.trim(),
        })
        setAsked(true)
        onRequested?.()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The request was not raised.'))
      }
    })
  }

  return (
    <section
      style={{
        border: '1px solid var(--fx-danger)',
        borderLeft: '5px solid var(--fx-danger)',
        background: 'var(--fx-bg-surface)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ font: "600 17px/1.2 var(--fx-font-sans)" }}>This issue is blocked</span>
        <Badge tone="danger">UD {block.udNumber}</Badge>
        {/* Said out loud, because the alternative is somebody hunting for fabric that never
            left the shelf — or entering the issue again and drawing twice. */}
        <span
          style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
        >
          nothing written
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1,
          background: 'var(--fx-border-subtle)',
          border: '1px solid var(--fx-border-subtle)',
        }}
      >
        {[
          { label: 'Item', value: block.itemRef, mono: false },
          { label: 'Authorised', value: fmt(block.authorized, block.unit) },
          { label: 'Already drawn', value: fmt(block.consumed, block.unit) },
          { label: 'Balance', value: fmt(block.free, block.unit) },
          { label: 'You asked for', value: fmt(block.qty, block.unit) },
          {
            label: 'Short by',
            value: fmt(block.shortfall, block.unit),
            tone: 'var(--fx-danger)',
          },
        ].map((cell) => (
          <div key={cell.label} style={{ background: 'var(--fx-bg-surface)', padding: '12px 14px' }}>
            <div
              style={{
                font: "400 10px/1 var(--fx-font-mono)",
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {cell.label}
            </div>
            <div
              style={{
                marginTop: 5,
                font: "600 16px/1.2 var(--fx-font-sans)",
                color: cell.tone ?? 'var(--fx-text-primary)',
                wordBreak: 'break-word',
              }}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            font: "400 10.5px/1 var(--fx-font-mono)",
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--fx-text-tertiary)',
            marginBottom: 8,
          }}
        >
          Ways out
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            font: "400 13px/1.7 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
          }}
        >
          <li>Issue what the balance covers now, and the rest against another UD.</li>
          <li>Use non-bonded stock for the shortfall — duty is already paid on it.</li>
          <li>Ask an owner to authorise the overdraw, below.</li>
        </ul>
      </div>

      {asked ? (
        <InlineAlert tone="success">
          The request is in the owner&rsquo;s approve inbox. Nothing is drawn until they sign
          it — this screen will not change when they do, the issue has to be run again.
        </InlineAlert>
      ) : (
        <>
          {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>
              Why the overdraw is necessary
            </span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lay already spread against this UD; the balance was drawn by yesterday's issue on the same lot."
              style={{
                padding: '10px 12px',
                border: '1px solid var(--fx-border-default)',
                borderRadius: 'var(--fx-radius-sm)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                font: "400 14px/1.5 var(--fx-font-sans)",
                resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                font: "400 12px/1.5 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              approver · owner — the request arrives in their inbox, not on this screen
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Button variant="primary" disabled={!canAsk || pending} onClick={ask}>
                {pending ? 'Requesting…' : 'Request an owner override'}
              </Button>
            </span>
          </div>
        </>
      )}
    </section>
  )
}

function fmt(value: string | null, unit: string): string {
  return value === null ? '—' : `${value} ${unit}`
}
