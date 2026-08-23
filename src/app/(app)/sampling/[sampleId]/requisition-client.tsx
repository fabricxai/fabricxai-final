'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { InlineAlert } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { Button } from '@/components/fx/primitives'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { markRequisitionUsage, saveSampleRequisition } from '@/modules/sampling/actions'

/**
 * The requisition — the sample's bill of materials as an ask, and the answer.
 *
 * Two hands touch it (HANDOFF-sampling-requisition): the merchandiser writes what
 * the room needs before the piece can be made; the room's answer — as specified,
 * or substituted with WHAT — is recorded per line. The substitute note is the
 * point of the whole column: a sample sewn with a stand-in zipper is the most
 * common reason a buyer's fit comment is really a trim comment, and until now
 * that fact lived in somebody's memory.
 */

export interface RequisitionLineView {
  material: string
  spec: string
  qty: string
  unit: string
  used: 'pending' | 'as_specified' | 'substituted'
  substituteNote: string
}

export function RequisitionSection({
  sampleRequestId,
  lines,
  unreadable,
  canWrite,
  closed,
}: {
  sampleRequestId: string
  lines: RequisitionLineView[]
  /** Stored rows the parser refused — counted, never silently dropped. */
  unreadable: number
  canWrite: boolean
  closed: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [material, setMaterial] = useState('')
  const [spec, setSpec] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  /** Which line is being marked substituted, and the note being typed for it. */
  const [noting, setNoting] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const addable = material.trim().length > 0 && /^\d{1,7}(\.\d{1,3})?$/.test(qty) && unit.trim().length > 0

  function addLine() {
    if (!addable) return
    setFailure(null)
    const next = [
      ...lines,
      {
        material: material.trim(),
        spec: spec.trim(),
        qty,
        unit: unit.trim(),
        used: 'pending',
        substituteNote: '',
      },
    ]
    startTransition(async () => {
      try {
        unwrap(await saveSampleRequisition({ sampleRequestId, lines: next }))
        setMaterial('')
        setSpec('')
        setQty('')
        setUnit('')
        setAdding(false)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The requisition did not save.'))
      }
    })
  }

  function removeLine(index: number) {
    setFailure(null)
    const next = lines.filter((_, i) => i !== index)
    startTransition(async () => {
      try {
        unwrap(await saveSampleRequisition({ sampleRequestId, lines: next }))
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The requisition did not save.'))
      }
    })
  }

  function mark(index: number, used: 'as_specified' | 'substituted', substituteNote?: string) {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(await markRequisitionUsage({ sampleRequestId, lineIndex: index, used, substituteNote }))
        setNoting(null)
        setNote('')
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'That did not go through.'))
      }
    })
  }

  const substituted = lines.filter((l) => l.used === 'substituted').length

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}
      {unreadable > 0 ? (
        <InlineAlert tone="warning">
          {unreadable} stored line{unreadable === 1 ? '' : 's'} could not be read and{' '}
          {unreadable === 1 ? 'is' : 'are'} not shown. Saving rewrites only what is here.
        </InlineAlert>
      ) : null}

      {substituted > 0 ? (
        <InlineAlert tone="warning">
          {substituted} line{substituted === 1 ? '' : 's'} substituted — read the buyer&rsquo;s
          comments against what was actually in the garment, not the spec.
        </InlineAlert>
      ) : null}

      {lines.length === 0 ? (
        <span style={{ font: '400 13.5px/1.6 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
          No requisition yet. Write what the room needs — fabric, trims, thread — and the room
          answers per line with what actually went into the garment.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lines.map((line, index) => (
            <div
              key={`${line.material}-${index}`}
              className="fx-stack-tablet"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 110px minmax(0, 1.2fr)',
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
                borderTop: index === 0 ? undefined : '1px solid var(--fx-border-subtle)',
              }}
            >
              <span style={{ font: '500 13.5px/1.4 var(--fx-font-sans)' }}>
                {line.material}
                {line.spec ? (
                  <span style={{ color: 'var(--fx-text-tertiary)', fontWeight: 400 }}> · {line.spec}</span>
                ) : null}
              </span>
              <span data-numeric data-mono style={{ font: '400 13px/1.4 var(--fx-font-mono)' }}>
                {line.qty} {line.unit}
              </span>
              <span
                style={{
                  font: '500 12px/1.4 var(--fx-font-sans)',
                  color:
                    line.used === 'substituted'
                      ? 'var(--fx-warning)'
                      : line.used === 'as_specified'
                        ? 'var(--fx-text-secondary)'
                        : 'var(--fx-text-tertiary)',
                }}
              >
                {line.used === 'substituted'
                  ? 'substituted'
                  : line.used === 'as_specified'
                    ? 'as specified'
                    : 'not answered'}
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {line.used === 'substituted' && line.substituteNote ? (
                  <span style={{ font: '400 12.5px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
                    → {line.substituteNote}
                  </span>
                ) : null}
                {canWrite && !closed ? (
                  noting === index ? (
                    <>
                      <TextInput
                        label=""
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="what went in instead"
                      />
                      <Button
                        variant="secondary"
                        disabled={pending || note.trim().length === 0}
                        onClick={() => mark(index, 'substituted', note.trim())}
                      >
                        Record
                      </Button>
                      <Button variant="ghost" disabled={pending} onClick={() => setNoting(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {line.used !== 'as_specified' ? (
                        <Button variant="ghost" disabled={pending} onClick={() => mark(index, 'as_specified')}>
                          As specified
                        </Button>
                      ) : null}
                      <Button variant="ghost" disabled={pending} onClick={() => { setNoting(index); setNote(line.substituteNote) }}>
                        Substituted…
                      </Button>
                      <Button variant="ghost" disabled={pending} onClick={() => removeLine(index)}>
                        Remove
                      </Button>
                    </>
                  )
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {canWrite && !closed ? (
        adding ? (
          <div
            className="fx-stack-tablet"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) 100px 90px auto auto',
              gap: 10,
              alignItems: 'end',
            }}
          >
            <TextInput label="Material" value={material} onChange={(e) => setMaterial(e.target.value)} />
            <TextInput label="Spec / reference" value={spec} onChange={(e) => setSpec(e.target.value)} />
            <TextInput label="Qty" mono inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <TextInput
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addable) addLine()
              }}
            />
            <Button variant="secondary" disabled={pending || !addable} onClick={addLine}>
              Add
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              {lines.length === 0 ? 'Write the requisition' : 'Add a line'}
            </Button>
          </div>
        )
      ) : null}
    </div>
  )
}
