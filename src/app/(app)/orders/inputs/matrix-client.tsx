'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Button } from '@/components/fx/primitives'
import { Select, TextArea, TextInput } from '@/components/fx/forms'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { setOrderInputCell } from '@/modules/orders/actions'
import { INPUT_CATEGORY_WORDS, type InputCell } from '@/modules/orders/inputs'

/**
 * The matrix's cells, and the editor one click opens.
 *
 * The sheet's habit is TYPE IN THE CELL — a date, or a word, or a margin note —
 * so the editor asks for exactly those three and nothing else, and never demands
 * one voice when the person has another. A cell with only "101 rolls short" is
 * a complete entry; forcing a date on it would make people invent dates, which
 * is worse than the sheet they came from.
 */

const STATE_WORDS: Record<InputCell['state'], string> = {
  pending: 'not booked',
  booked: 'booked',
  in_house: 'in-house',
  not_applicable: 'n/a',
}

const STATE_COLOR: Record<InputCell['state'], string> = {
  pending: 'var(--fx-danger)',
  booked: 'var(--fx-warning)',
  in_house: 'var(--fx-text-primary)',
  not_applicable: 'var(--fx-text-disabled)',
}

function cellFace(cell: InputCell): { word: string; color: string } {
  if (cell.state === 'in_house') {
    return { word: cell.actualDate ?? 'in-house', color: STATE_COLOR.in_house }
  }
  if (cell.state === 'pending') {
    return { word: '—', color: STATE_COLOR.pending }
  }
  return { word: STATE_WORDS[cell.state], color: STATE_COLOR[cell.state] }
}

export function InputCellButton({
  orderId,
  poNumber,
  cell,
  canWrite,
}: {
  orderId: string
  poNumber: string | null
  cell: InputCell
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)

  const [state, setState] = useState<InputCell['state']>(cell.state)
  const [planDate, setPlanDate] = useState(cell.planDate ?? '')
  const [actualDate, setActualDate] = useState(cell.actualDate ?? '')
  const [note, setNote] = useState(cell.note ?? '')

  const face = cellFace(cell)

  function save() {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(
          await setOrderInputCell({
            orderId,
            category: cell.category,
            state,
            planDate: planDate || null,
            actualDate: state === 'in_house' ? actualDate || null : null,
            note: note.trim() || null,
          }),
        )
        setOpen(false)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The cell was not saved.'))
      }
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => setOpen((v) => !v)}
        aria-label={`${INPUT_CATEGORY_WORDS[cell.category]} on ${poNumber ?? 'order'}`}
        style={{
          width: '100%',
          minHeight: 'var(--fx-tap-min)',
          padding: '6px 4px',
          border: 'none',
          borderRadius: 'var(--fx-radius-sm)',
          background:
            cell.state === 'pending'
              ? 'rgb(178 58 50 / 0.06)'
              : cell.state === 'booked'
                ? 'rgb(140 90 22 / 0.06)'
                : 'transparent',
          cursor: canWrite ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <span
          data-numeric
          style={{ font: '400 11.5px/1.2 var(--fx-font-mono)', color: face.color }}
        >
          {face.word}
        </span>
        {cell.note ? (
          <span
            aria-label="carries a note"
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: 'var(--fx-text-tertiary)',
            }}
          />
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 30,
            top: 'calc(100% + 6px)',
            right: 0,
            width: 280,
            background: 'var(--fx-bg-raised)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-md)',
            boxShadow: 'var(--fx-sh2)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            textAlign: 'left',
          }}
        >
          <span style={{ font: '600 13px/1.3 var(--fx-font-sans)' }}>
            {INPUT_CATEGORY_WORDS[cell.category]}
            {poNumber ? (
              <span style={{ color: 'var(--fx-text-tertiary)', fontWeight: 400 }}> · {poNumber}</span>
            ) : null}
          </span>

          <Select
            label="State"
            value={state}
            onChange={(event) => setState(event.target.value as InputCell['state'])}
          >
            <option value="pending">not booked</option>
            <option value="booked">booked</option>
            <option value="in_house">in-house</option>
            <option value="not_applicable">n/a — this style has none</option>
          </Select>

          <TextInput
            label="Planned in-house"
            type="date"
            value={planDate}
            onChange={(event) => setPlanDate(event.target.value)}
          />

          {state === 'in_house' ? (
            <TextInput
              label="Actually landed"
              type="date"
              value={actualDate}
              onChange={(event) => setActualDate(event.target.value)}
            />
          ) : null}

          <TextArea
            label="Note"
            hint="the margin voice — air freight, short rolls, who to call"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={pending} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
