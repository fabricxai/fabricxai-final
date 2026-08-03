'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Button } from '@/components/fx/primitives'
import { saveCloseOutNote } from '@/modules/memory/actions'

/**
 * The close-out note (canvas P3).
 *
 * Two questions, because the canvas asks two and they are not the same question. "What went
 * better than expected" is where a factory's real capability hides — nobody writes it down
 * unless asked — and "what would you do differently" is the one that changes the next quote.
 * A single free-text box gets one of them, usually the complaint.
 *
 * **Skip is a text link, not a button.** Discouraged by weight, never disabled: a
 * merchandiser closing an order at seven in the evening who is forced to write something
 * writes "n/a", and an "n/a" in the record is worse than a gap, because a gap is honest.
 *
 * **The window closes after seven days.** A note written six months later is a
 * reconstruction, and the next quote would read it as an observation.
 */
export function CloseOutNote({
  orderId,
  poNumber,
  existingNote,
  windowOpen,
  daysLeft,
  onDone,
}: {
  orderId: string
  poNumber: string | null
  existingNote: string | null
  windowOpen: boolean
  daysLeft: number
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [better, setBetter] = useState('')
  const [differently, setDifferently] = useState('')
  const [saved, setSaved] = useState(existingNote !== null && existingNote !== '')
  const [failure, setFailure] = useState<string | null>(null)

  function save() {
    setFailure(null)
    startTransition(async () => {
      try {
        // Kept as one field with both answers labelled, rather than two columns. The next
        // reader is a person — and often MARBIM quoting it back — so it has to read as
        // prose, not as a form somebody filled in.
        const note = [
          better.trim() ? `Went better than expected: ${better.trim()}` : '',
          differently.trim() ? `Would do differently: ${differently.trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n')

        await saveCloseOutNote({ orderId, merchandiserNote: note })
        setSaved(true)
        onDone?.()
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The note was not saved.'))
      }
    })
  }

  if (!windowOpen) {
    return (
      <InlineAlert tone="info">
        The note window closed on this order. What was written stands; a note added now would
        be a reconstruction, and the next quote would read it as an observation.
      </InlineAlert>
    )
  }

  if (saved) {
    return (
      <InlineAlert tone="success">
        Note saved on {poNumber ?? 'this order'}. It travels with the outcome into every
        future match on this style.
      </InlineAlert>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      <span style={{ font: "400 13px/1.6 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
        The two lines that pay for themselves. {daysLeft}{' '}
        {daysLeft === 1 ? 'day' : 'days'} left to add them.
      </span>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>What went better than expected?</span>
        <textarea
          rows={2}
          value={better}
          onChange={(e) => setBetter(e.target.value)}
          placeholder="The collar construction ran faster than the SMV said once the operators settled."
          style={control}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>What would you do differently?</span>
        <textarea
          rows={2}
          value={differently}
          onChange={(e) => setDifferently(e.target.value)}
          placeholder="Book the interlining a fortnight earlier — it held the lay up twice."
          style={control}
        />
      </label>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          disabled={pending || (!better.trim() && !differently.trim())}
          onClick={save}
        >
          {pending ? 'Saving…' : 'Save the note and close'}
        </Button>

        {/* A link, not a button. Discouraged by weight — never disabled, because a forced
            note is an "n/a", and an "n/a" in the record is worse than a gap. */}
        <button
          onClick={() => {
            setSaved(true)
            onDone?.()
          }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            font: "400 13px/1.4 var(--fx-font-sans)",
            color: 'var(--fx-text-tertiary)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Close without a note
        </button>
      </div>
    </div>
  )
}

const label: React.CSSProperties = { font: "500 13px/1.3 var(--fx-font-sans)" }

const control: React.CSSProperties = {
  minWidth: 0,
  padding: '10px 12px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 14px/1.5 var(--fx-font-sans)",
  resize: 'vertical',
}
