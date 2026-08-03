'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert, Modal } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Ident } from '@/components/fx/format'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { draftStockAdjustment } from '@/modules/store/actions'
import type { RollRow } from '@/modules/store/queries'

/**
 * Rolls for one item, and the correction path.
 *
 * The reason codes are a fixed list rather than free text because "why" is what the
 * approver is judging — `damaged` and `miscount` are different conversations, and a note
 * saying "adjustment" tells them nothing. The free-text note is required on top of it, and
 * the zod schema refuses anything under ten characters: an adjustment without a stated
 * reason is a number somebody will have to explain to a customs officer later.
 */
const REASONS = [
  { code: 'miscount', label: 'Miscount — recount disagrees with the system' },
  { code: 'damaged', label: 'Damaged — water, oil, or handling' },
  { code: 'shortage_on_receipt', label: 'Short on receipt — challan overstated' },
  { code: 'written_off', label: 'Written off — nothing recoverable' },
  { code: 'found', label: 'Found — stock present that was not recorded' },
] as const

export function RollsClient({
  items,
  selectedItemId,
  rolls,
}: {
  items: readonly {
    itemId: string
    code: string
    name: string
    onHand: string
    unit: string
    rollCount: number
  }[]
  selectedItemId: string
  rolls: readonly RollRow[]
}) {
  const router = useRouter()
  const [adjusting, setAdjusting] = useState<RollRow | null>(null)
  const [drafted, setDrafted] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {drafted ? (
        <InlineAlert tone="success">
          {drafted} — sent to the approve inbox. Nothing has changed in the store yet: an
          adjustment is applied when it is signed, not when it is drafted.
        </InlineAlert>
      ) : null}

      {/* ── Item picker ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((item) => {
          const on = item.itemId === selectedItemId
          return (
            <button
              key={item.itemId}
              onClick={() => router.push(`/store/rolls?item=${item.itemId}`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                padding: '10px 14px',
                borderRadius: 'var(--fx-radius-full)',
                border: `1px solid ${on ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                background: on ? 'var(--fx-text-primary)' : 'transparent',
                color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                cursor: 'pointer',
                font: "500 12.5px/1.3 var(--fx-font-sans)",
              }}
            >
              <span style={{ font: "500 12px/1 var(--fx-font-mono)" }}>{item.code}</span>
              {item.rollCount} roll{item.rollCount === 1 ? '' : 's'}
            </button>
          )
        })}
      </div>

      {/* ── The rolls ────────────────────────────────────────────────────── */}
      <SectionHeading eyebrow="Roll · lot">Every roll, and where it sits</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rolls.map((roll) => (
          <div
            key={roll.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 0.9fr 0.8fr 110px 100px 110px',
              gap: 12,
              alignItems: 'center',
              padding: '12px 16px',
              minHeight: 56,
              border: '1px solid var(--fx-border-subtle)',
              borderLeft: `3px solid ${roll.status === 'in_stock' ? 'transparent' : 'var(--fx-text-disabled)'}`,
              background: 'var(--fx-bg-surface)',
            }}
          >
            <Ident>{roll.rollNo}</Ident>
            <span style={{ font: "400 12.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              {roll.shadeGroup ? `shade ${roll.shadeGroup}` : 'no shade'}
              {roll.dyeLot ? ` · ${roll.dyeLot}` : ''}
            </span>
            <span style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              {roll.challanNo} · {roll.receivedAt}
            </span>
            <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
              {roll.qty} {roll.unit}
            </span>
            <span style={{ textAlign: 'center' }}>
              <Badge tone={roll.locationKind === 'bonded' ? 'warning' : 'neutral'}>
                {roll.locationCode}
              </Badge>
            </span>
            <span style={{ textAlign: 'right' }}>
              {roll.status === 'in_stock' ? (
                <Button variant="ghost" onClick={() => setAdjusting(roll)}>
                  Adjust
                </Button>
              ) : (
                <span style={{ font: "400 11.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                  {roll.status.replace('_', ' ')}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {adjusting ? (
        <AdjustDialog
          roll={adjusting}
          itemId={selectedItemId}
          onClose={() => setAdjusting(null)}
          onDrafted={(summary) => {
            setAdjusting(null)
            setDrafted(summary)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AdjustDialog({
  roll,
  itemId,
  onClose,
  onDrafted,
}: {
  roll: RollRow
  itemId: string
  onClose: () => void
  onDrafted: (summary: string) => void
}) {
  const [counted, setCounted] = useState('')
  const [reasonCode, setReasonCode] = useState<string>(REASONS[0].code)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The storekeeper enters what they COUNTED, not a delta. Asking somebody at a rack to
  // work out "−12.50" from 100 and 87.5 is asking them to make an arithmetic mistake that
  // then goes to an approver as a fact.
  const countedQty = Number(counted)
  const valid = counted !== '' && Number.isFinite(countedQty) && countedQty >= 0
  const delta = valid ? countedQty - Number(roll.qty) : 0
  const noteTooShort = note.trim().length < 10

  function submit() {
    setError(null)
    if (!valid || delta === 0 || noteTooShort) return

    startTransition(async () => {
      try {
        await draftStockAdjustment({
          itemId,
          rollId: roll.id,
          qtyDelta: delta.toFixed(2),
          unit: roll.unit,
          reasonCode,
          note: note.trim(),
        })
        onDrafted(`${roll.rollNo} · ${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${roll.unit}`)
      } catch (e) {
        setError(actionErrorMessage(e, 'the draft was refused'))
      }
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${roll.rollNo}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid || delta === 0 || noteTooShort || pending}
            onClick={submit}
          >
            Send for approval
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { label: 'System says', value: `${roll.qty} ${roll.unit}` },
            { label: 'You counted', value: valid ? `${countedQty.toFixed(2)} ${roll.unit}` : '—' },
            {
              label: 'Difference',
              value: valid ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${roll.unit}` : '—',
              tone: delta < 0 ? 'danger' : delta > 0 ? 'success' : 'plain',
            },
          ].map((cell) => (
            <div key={cell.label}>
              <div
                style={{
                  font: "400 11px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {cell.label}
              </div>
              <div
                style={{
                  marginTop: 6,
                  font: "600 19px/1.1 var(--fx-font-sans)",
                  color:
                    cell.tone === 'danger'
                      ? 'var(--fx-danger)'
                      : cell.tone === 'success'
                        ? 'var(--fx-success)'
                        : 'var(--fx-text-primary)',
                }}
              >
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Counted quantity</span>
          <input
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder={roll.qty}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'var(--fx-bg-surface)',
              color: 'var(--fx-text-primary)',
              font: "400 15px/1.4 var(--fx-font-mono)",
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Reason</span>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'var(--fx-bg-surface)',
              color: 'var(--fx-text-primary)',
              font: "400 14px/1.4 var(--fx-font-sans)",
            }}
          >
            {REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>
            What happened{noteTooShort && note.length > 0 ? ' — at least 10 characters' : ''}
          </span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Water damage on the outer wraps, cut back to sound cloth."
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

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <InlineAlert tone="info">
          Nothing is written now. This goes to the approve inbox, and the count changes only
          when somebody signs it — writing off stock is writing off money.
        </InlineAlert>
      </div>
    </Modal>
  )
}
