'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Button } from '@/components/fx/primitives'
import { Select, TextInput } from '@/components/fx/forms'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { saveOrderDrops, setOrderColourApproval } from '@/modules/orders/actions'
import type { DropRow } from '@/modules/orders/queries'

/**
 * The drop plan's editor. Whole-list on purpose — a drop plan is one decision about
 * how the quantity leaves — so the form edits all rows and saves them together, and
 * the server's tolerance gate sees the whole picture.
 */
export function DropsEditor({
  orderId,
  drops,
  canWrite,
}: {
  orderId: string
  drops: readonly DropRow[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [rows, setRows] = useState<
    { dropNo: number; qty: string; shipDate: string; note: string }[]
  >(
    drops.length > 0
      ? drops.map((d) => ({ dropNo: d.dropNo, qty: String(d.qty), shipDate: d.shipDate, note: d.note ?? '' }))
      : [{ dropNo: 1, qty: '', shipDate: '', note: '' }],
  )

  if (!canWrite) return null

  function save() {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(
          await saveOrderDrops({
            orderId,
            drops: rows.map((row) => ({
              dropNo: row.dropNo,
              // eslint-disable-next-line fabricxai/no-float-money -- pieces, not money
              qty: Number.parseInt(row.qty, 10),
              shipDate: row.shipDate,
              note: row.note.trim() || null,
            })),
          }),
        )
        setOpen(false)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The drops were not saved.'))
      }
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {drops.length > 0 ? 'Edit the drop plan' : 'Split into drops'}
      </Button>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 0 0',
      }}
    >
      {rows.map((row, i) => (
        <div
          key={row.dropNo}
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 1fr 1.4fr auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <span
            data-mono
            style={{ font: '500 13px/1 var(--fx-font-mono)', paddingBottom: 14 }}
          >
            Drop {row.dropNo}
          </span>
          <TextInput
            label="Pieces"
            inputMode="numeric"
            value={row.qty}
            onChange={(e) =>
              setRows((all) => all.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))
            }
          />
          <TextInput
            label="Latest ship"
            type="date"
            value={row.shipDate}
            onChange={(e) =>
              setRows((all) => all.map((r, j) => (j === i ? { ...r, shipDate: e.target.value } : r)))
            }
          />
          <TextInput
            label="Note"
            value={row.note}
            onChange={(e) =>
              setRows((all) => all.map((r, j) => (j === i ? { ...r, note: e.target.value } : r)))
            }
          />
          <Button
            variant="ghost"
            disabled={rows.length === 1}
            onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button
          variant="ghost"
          onClick={() =>
            setRows((all) => [
              ...all,
              { dropNo: Math.max(...all.map((r) => r.dropNo)) + 1, qty: '', shipDate: '', note: '' },
            ])
          }
        >
          + another drop
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={pending || rows.some((r) => !r.qty || !r.shipDate)}
          onClick={save}
        >
          Save the plan
        </Button>
      </div>
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}
      <span style={{ font: '400 12px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
        The order&rsquo;s ex-factory date follows the last drop — the order leaves when the last
        drop does. Totals are checked against what the buyer contracted, server-side.
      </span>
    </div>
  )
}

const STAGES = ['lab_dip', 'bulk_lot', 'shade_band'] as const
const STAGE_WORDS: Record<string, string> = {
  lab_dip: 'lab dip',
  bulk_lot: 'bulk lot',
  shade_band: 'shade band',
}

/** One colour's chain — three chips, click to move a stage. */
export function ColourChain({
  orderId,
  color,
  cells,
  canWrite,
}: {
  orderId: string
  color: string
  cells: readonly { stage: string; status: string; decidedOn: string | null }[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [status, setStatus] = useState('sent')
  const [decidedOn, setDecidedOn] = useState('')

  const byStage = new Map(cells.map((c) => [c.stage, c]))

  function save(stage: string) {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(
          await setOrderColourApproval({
            orderId,
            color,
            stage,
            status,
            decidedOn: decidedOn || null,
          }),
        )
        setEditing(null)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The approval was not recorded.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {STAGES.map((stage) => {
          const cell = byStage.get(stage)
          const word = cell?.status ?? 'pending'
          const color =
            word === 'approved'
              ? 'var(--fx-success)'
              : word === 'rejected'
                ? 'var(--fx-danger)'
                : word === 'sent'
                  ? 'var(--fx-warning)'
                  : 'var(--fx-text-tertiary)'
          return (
            <button
              key={stage}
              type="button"
              disabled={!canWrite}
              onClick={() => {
                setEditing(editing === stage ? null : stage)
                setStatus(cell?.status === 'pending' || !cell ? 'sent' : cell.status)
                setDecidedOn(cell?.decidedOn ?? '')
              }}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 14px',
                minHeight: 'var(--fx-tap-min)',
                border: `1px solid ${editing === stage ? 'var(--fx-border-strong)' : 'var(--fx-border-default)'}`,
                borderRadius: 'var(--fx-radius-md)',
                background: 'transparent',
                cursor: canWrite ? 'pointer' : 'default',
              }}
            >
              <span style={{ font: '500 12.5px/1 var(--fx-font-sans)' }}>{STAGE_WORDS[stage]}</span>
              <span
                style={{
                  font: '500 10.5px/1 var(--fx-font-mono)',
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  color,
                }}
              >
                {word}
                {cell?.decidedOn ? ` · ${cell.decidedOn}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {editing ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">pending — nothing sent yet</option>
            <option value="sent">sent — with the buyer</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </Select>
          <TextInput
            label="Buyer decided on"
            type="date"
            value={decidedOn}
            onChange={(e) => setDecidedOn(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => save(editing)}>
              Record
            </Button>
          </div>
          {failure ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <InlineAlert tone="danger">{failure}</InlineAlert>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
