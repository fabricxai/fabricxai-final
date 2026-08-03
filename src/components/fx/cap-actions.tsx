'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import {
  attachCapEvidence,
  closeCorrectiveAction,
  progressCap,
} from '@/modules/compliance/actions'

export interface CapState {
  capId: string
  status: string
  severity: string
  deadline: string | null
  daysToDeadline: number | null
  evidenceCount: number
  /** True when at least one piece of evidence carries a document rather than a note. */
  hasDocument: boolean
}

const NEXT: Record<string, readonly ('in_progress' | 'evidence_submitted')[]> = {
  open: ['in_progress'],
  in_progress: ['evidence_submitted'],
  evidence_submitted: [],
  closed: [],
}

/**
 * Working a corrective action plan.
 *
 * **A critical finding cannot be closed on a note.** The service refuses it, and the screen
 * says so before anybody types — an auditor returning in six months does not accept "we
 * told them to stop", they accept the photograph of the guard that was fitted. So the close
 * button stays disabled on a critical CAP until a document is attached, and explains why.
 *
 * **Closing is a role, not a permission.** The policy names which roles may certify a
 * finding fixed, because the person who caused it is rarely the person who should sign it
 * off. That check lives in the service; this screen only reflects it.
 */
export function CapActions({ cap, canClose }: { cap: CapState; canClose: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [note, setNote] = useState('')
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // `critical` is the zero-tolerance band — the enum has nothing above it, and treating
  // it as merely "the worst of four" is how a locked fire exit gets closed on a note.
  const critical = cap.severity === 'critical'
  const needsDocument = critical && !cap.hasDocument
  const overdue = cap.daysToDeadline !== null && cap.daysToDeadline < 0

  function run(work: () => Promise<string>) {
    setFailure(null)
    startTransition(async () => {
      try {
        setNoted(await work())
        setNote('')
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'That did not go through.'))
      }
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 16px',
        borderTop: '1px solid var(--fx-border-subtle)',
      }}
    >
      {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={overdue ? 'danger' : cap.status === 'closed' ? 'success' : 'neutral'}>
          {cap.status.replace(/_/g, ' ')}
        </Badge>
        {cap.deadline ? (
          <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: overdue ? 'var(--fx-danger)' : 'var(--fx-text-tertiary)' }}>
            {overdue
              ? `${Math.abs(cap.daysToDeadline!)} days past the deadline`
              : `due ${cap.deadline}`}
          </span>
        ) : null}
        <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          {cap.evidenceCount} evidence · {cap.hasDocument ? 'document on file' : 'notes only'}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(NEXT[cap.status] ?? []).map((next) => (
            <Button
              key={next}
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await progressCap({ capId: cap.capId, status: next })
                  return `Moved to ${r.status.replace(/_/g, ' ')}.`
                })
              }
            >
              {next.replace(/_/g, ' ')}
            </Button>
          ))}

          {cap.status !== 'closed' ? (
            <Button
              variant="primary"
              disabled={pending || needsDocument || !canClose}
              onClick={() =>
                run(async () => {
                  const r = await closeCorrectiveAction({
                    capId: cap.capId,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  })
                  return `CAP ${r.status}.`
                })
              }
            >
              Close this CAP
            </Button>
          ) : null}
        </span>
      </div>

      {cap.status !== 'closed' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done, or what the evidence shows"
            style={{
              flex: '1 1 300px',
              minWidth: 0,
              minHeight: 40,
              padding: '8px 11px',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'var(--fx-bg-surface)',
              color: 'var(--fx-text-primary)',
              font: "400 13.5px/1.4 var(--fx-font-sans)",
            }}
          />
          <Button
            variant="ghost"
            disabled={pending || !note.trim()}
            onClick={() =>
              run(async () => {
                const r = await attachCapEvidence({ capId: cap.capId, note: note.trim() })
                return `Evidence added — ${r.evidenceCount} on file.`
              })
            }
          >
            Add evidence
          </Button>
        </div>
      ) : null}

      {needsDocument ? (
        <span style={{ font: "400 12px/1.6 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          a {cap.severity.replace(/_/g, ' ')} finding cannot be closed on a note — an auditor
          returning in six months accepts the photograph of the fix, not the instruction to
          make it
        </span>
      ) : !canClose ? (
        <span style={{ font: "400 12px/1.6 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          your role cannot certify a finding fixed — the person who caused one is rarely the
          person who should sign it off
        </span>
      ) : null}
    </div>
  )
}
