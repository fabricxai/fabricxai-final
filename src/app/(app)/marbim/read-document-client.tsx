'use client'

import { useEffect, useRef, useState } from 'react'

import { actionErrorMessage } from '@/lib/action-error'
import {
  extractionJobStatus,
  intakeContext,
  listIntakeKinds,
  readDocument,
  type ContextOption,
} from '@/modules/marbim/actions'

import type { Attachment } from './attach-client'

/**
 * The composer's "read this document" flow — the bridge the attach button always implied.
 *
 * An attached PDF or photo can now be read by the extract model directly, but the one
 * decision no model is allowed to make remains: **what the document IS**. A classifier
 * that guessed would file a tech pack as a buyer PO and park a wrong draft in somebody's
 * approve inbox (the exact failure `attach-client.tsx` refuses). So the person answers
 * with one tap — the same kinds the intake page offers, as chips — and everything after
 * that is the machine's: queue, extract, follow the job, and say where the draft went.
 *
 * The follow is the part the intake page never had. "Queued" with no sequel taught a
 * tester the pipeline was hung when it had finished in three seconds — the draft just
 * lands in an inbox the submitter may not even be allowed to see. This box polls the job
 * to its end and says, in words, "waiting in the approve inbox for owner/admin".
 */

/** Server truth mirrored for chip-enabling; the server re-checks on submit. */
export const MODEL_READABLE = /^(application\/pdf|image\/(jpeg|png|webp))$/

interface Kind {
  id: string
  label: string
  hint: string
  targetTable: string
  needsContext: boolean
}

interface ContextField {
  field: string
  label: string
  options: ContextOption[]
}

type Phase =
  | { step: 'offer' }
  | { step: 'context'; kind: Kind; fields: ContextField[] }
  | { step: 'queueing'; kind: Kind }
  | { step: 'watching'; kind: Kind; jobId: string }
  | { step: 'done'; kind: Kind; targetTable: string }
  | { step: 'failed'; message: string }

const POLL_MS = 2000
const POLL_CAP = 60 // 2 minutes, then hand over to the intake page's job list.

export function ReadDocumentFlow({ attachment }: { attachment: Attachment }) {
  const [kinds, setKinds] = useState<Kind[] | null>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'offer' })
  const [contextValues, setContextValues] = useState<Record<string, string>>({})
  const polls = useRef(0)

  useEffect(() => {
    let cancelled = false
    void listIntakeKinds()
      .then((list) => {
        if (!cancelled) setKinds(list)
      })
      .catch(() => {
        // A viewer/member gets no chips rather than chips that 403 on submit.
        if (!cancelled) setKinds([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Follow the job to its end. The interval lives and dies with the watching phase.
  useEffect(() => {
    if (phase.step !== 'watching') return
    polls.current = 0
    const timer = setInterval(() => {
      polls.current += 1
      if (polls.current > POLL_CAP) {
        clearInterval(timer)
        setPhase({
          step: 'failed',
          message:
            'Still running after two minutes — the job has not been lost. Its status is on the intake page.',
        })
        return
      }
      void extractionJobStatus({ jobId: phase.jobId })
        .then((job) => {
          if (job.status === 'succeeded') {
            setPhase({ step: 'done', kind: phase.kind, targetTable: job.targetTable })
          } else if (job.status === 'failed' || job.status === 'rejected') {
            setPhase({
              step: 'failed',
              message: job.error ?? 'The read did not produce a draft.',
            })
          }
          // queued / running: keep watching.
        })
        .catch(() => {
          // One missed poll is a blip; the cap above bounds a persistent one.
        })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [phase])

  async function choose(kind: Kind) {
    setContextValues({})
    if (!kind.needsContext) {
      await submit(kind, {})
      return
    }
    try {
      const fields = await intakeContext(kind.id)
      setPhase({ step: 'context', kind, fields })
    } catch (error) {
      setPhase({ step: 'failed', message: actionErrorMessage(error, 'The choices could not be loaded.') })
    }
  }

  async function submit(kind: Kind, values: Record<string, string>) {
    setPhase({ step: 'queueing', kind })
    try {
      const result = await readDocument({
        kindId: kind.id,
        documentId: attachment.documentId,
        contextValues: values,
      })
      setPhase({ step: 'watching', kind, jobId: result.jobId })
    } catch (error) {
      setPhase({ step: 'failed', message: actionErrorMessage(error, 'MARBIM was not asked to read it.') })
    }
  }

  if (kinds === null || kinds.length === 0) return null

  const box: React.CSSProperties = {
    border: '1px solid var(--fx-border-subtle)',
    borderRadius: 'var(--fx-radius-md)',
    background: 'var(--fx-bg-sunken)',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }
  const mono: React.CSSProperties = {
    font: '400 11.5px/1.5 var(--fx-font-mono)',
    color: 'var(--fx-text-tertiary)',
  }

  if (phase.step === 'offer') {
    return (
      <div style={box}>
        <span style={{ font: '500 12.5px/1.4 var(--fx-font-sans)' }}>
          Read {attachment.filename} into a draft? Say what it is — that part is yours:
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {kinds.map((kind) => (
            <button
              key={kind.id}
              onClick={() => void choose(kind)}
              title={kind.hint}
              style={{
                border: '1px solid var(--fx-border-default)',
                borderRadius: 'var(--fx-radius-sm)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                padding: '7px 10px',
                font: '500 12px/1.2 var(--fx-font-sans)',
                cursor: 'pointer',
              }}
            >
              {kind.label}
            </button>
          ))}
        </div>
        <span style={mono}>
          The model reads the file itself — pages, scans and all. The draft waits in the
          approve inbox; nothing is written until a person signs it.
        </span>
      </div>
    )
  }

  if (phase.step === 'context') {
    const complete = phase.fields.every((field) => contextValues[field.field])
    return (
      <div style={box}>
        <span style={{ font: '500 12.5px/1.4 var(--fx-font-sans)' }}>
          {phase.kind.label} — the paper cannot say:
        </span>
        {phase.fields.map((field) => (
          <label key={field.field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ font: '500 12px/1.3 var(--fx-font-sans)' }}>{field.label}</span>
            <select
              value={contextValues[field.field] ?? ''}
              onChange={(e) =>
                setContextValues((prev) => ({ ...prev, [field.field]: e.target.value }))
              }
              style={{
                padding: '8px 10px',
                border: '1px solid var(--fx-border-default)',
                borderRadius: 'var(--fx-radius-sm)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                font: '400 13px/1.4 var(--fx-font-sans)',
              }}
            >
              <option value="">Choose…</option>
              {field.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.detail ? `${option.label} — ${option.detail}` : option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={!complete}
            onClick={() => void submit(phase.kind, contextValues)}
            style={{
              border: 'none',
              borderRadius: 'var(--fx-radius-sm)',
              background: complete ? 'var(--fx-accent)' : 'var(--fx-bg-surface)',
              color: complete ? 'var(--fx-accent-on)' : 'var(--fx-text-disabled)',
              padding: '8px 12px',
              font: '600 12px/1.2 var(--fx-font-sans)',
              cursor: complete ? 'pointer' : 'not-allowed',
            }}
          >
            Read it
          </button>
          <button
            onClick={() => setPhase({ step: 'offer' })}
            style={{
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'transparent',
              color: 'var(--fx-text-secondary)',
              padding: '8px 12px',
              font: '500 12px/1.2 var(--fx-font-sans)',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  if (phase.step === 'queueing' || phase.step === 'watching') {
    return (
      <div style={box}>
        <span style={mono} aria-live="polite">
          {phase.step === 'queueing'
            ? `Queueing ${attachment.filename}…`
            : `MARBIM is reading ${attachment.filename} — a draft appears in the approve inbox when it is done.`}
        </span>
      </div>
    )
  }

  if (phase.step === 'done') {
    return (
      <div style={box}>
        <span style={{ font: '500 12.5px/1.4 var(--fx-font-sans)' }} aria-live="polite">
          Read. The draft ({phase.targetTable}) is{' '}
          <a href="/approve" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
            waiting in the approve inbox
          </a>{' '}
          with a confidence on every field — owner or admin signs it in.
        </span>
      </div>
    )
  }

  return (
    <div style={box}>
      <span style={{ ...mono, color: 'var(--fx-danger, var(--fx-text-secondary))' }} aria-live="polite">
        {phase.message}
      </span>
      <button
        onClick={() => setPhase({ step: 'offer' })}
        style={{
          alignSelf: 'flex-start',
          border: '1px solid var(--fx-border-default)',
          borderRadius: 'var(--fx-radius-sm)',
          background: 'transparent',
          color: 'var(--fx-text-secondary)',
          padding: '7px 10px',
          font: '500 12px/1.2 var(--fx-font-sans)',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
