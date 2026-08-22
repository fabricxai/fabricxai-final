'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Badge, Button } from '@/components/fx/primitives'
import { Select, TextArea, TextInput } from '@/components/fx/forms'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { recordOrderShipDate } from '@/modules/orders/actions'
import type { ShipDateEntry } from '@/modules/orders/queries'

/**
 * 1.3 Order Desk — every ship date this order has had.
 *
 * The factory's own paper keeps Ship Date, Re-Ship Date-01 and Re-Ship Date-02 as
 * separate columns, because "when did we promise, who moved it, and on whose mail"
 * is the question a claim dispute asks. A single overwritten column cannot answer
 * it. Recording here deliberately does NOT reschedule the TNA — that is its own
 * decision with its own ripple preview, and the footer says so.
 */

const KIND_WORDS: Record<ShipDateEntry['kind'], string> = {
  contract: 'contract',
  reship: 're-ship',
  proposed: 'proposed',
}

const KIND_TONE: Record<ShipDateEntry['kind'], 'neutral' | 'warning' | 'info'> = {
  contract: 'neutral',
  reship: 'warning',
  proposed: 'info',
}

export function ShipDateTrail({
  orderId,
  trail,
  currentDate,
  canWrite,
}: {
  orderId: string
  trail: readonly ShipDateEntry[]
  currentDate: string | null
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)

  const [kind, setKind] = useState<'reship' | 'proposed'>('reship')
  const [shipDate, setShipDate] = useState('')
  const [agreedWith, setAgreedWith] = useState('')
  const [reason, setReason] = useState('')

  function save() {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(
          await recordOrderShipDate({
            orderId,
            shipDate,
            kind,
            agreedWith: agreedWith.trim() || undefined,
            reason: reason.trim() || undefined,
          }),
        )
        setOpen(false)
        setShipDate('')
        setAgreedWith('')
        setReason('')
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The date was not recorded.'))
      }
    })
  }

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {trail.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span data-numeric data-mono style={{ font: '500 15px/1.3 var(--fx-font-mono)' }}>
            {currentDate ?? '—'}
          </span>
          <span style={{ font: '400 13px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
            the date in force — no history recorded yet; the trail starts with the first change
          </span>
        </div>
      ) : (
        trail.map((entry, i) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'baseline',
              flexWrap: 'wrap',
              borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
              paddingTop: i === 0 ? undefined : 14,
            }}
          >
            <span data-numeric data-mono style={{ font: '500 15px/1.3 var(--fx-font-mono)' }}>
              {entry.shipDate}
            </span>
            <Badge tone={KIND_TONE[entry.kind]}>{KIND_WORDS[entry.kind]}</Badge>
            <span
              style={{
                font: '400 13px/1.5 var(--fx-font-sans)',
                color: 'var(--fx-text-secondary)',
                minWidth: 0,
              }}
            >
              {[entry.reason, entry.agreedWith].filter(Boolean).join(' — ') || '—'}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                font: '400 12px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {entry.byName ?? ''}
            </span>
          </div>
        ))
      )}

      {canWrite ? (
        open ? (
          <div
            style={{
              borderTop: '1px solid var(--fx-border-subtle)',
              paddingTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              alignItems: 'end',
            }}
          >
            <Select
              label="What is this"
              value={kind}
              onChange={(event) => setKind(event.target.value as 'reship' | 'proposed')}
            >
              <option value="reship">re-ship — the buyer agreed it</option>
              <option value="proposed">proposed — asked, not agreed</option>
            </Select>
            <TextInput
              label="Ship date"
              type="date"
              value={shipDate}
              onChange={(event) => setShipDate(event.target.value)}
            />
            <TextInput
              label="Agreed with"
              hint="the evidence — buyer mail of 8 Aug"
              value={agreedWith}
              onChange={(event) => setAgreedWith(event.target.value)}
            />
            <TextArea
              label="Why it moved"
              rows={1}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" disabled={pending || !shipDate} onClick={save}>
                Record
              </Button>
            </div>
            {failure ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <InlineAlert tone="danger">{failure}</InlineAlert>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              borderTop: '1px solid var(--fx-border-subtle)',
              paddingTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Record a date
            </Button>
            <span
              style={{ font: '400 12px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}
            >
              A re-ship moves the date in force; the TNA stays put — reschedule it from the
              timeline, where the ripple shows first.
            </span>
          </div>
        )
      ) : null}
    </div>
  )
}
