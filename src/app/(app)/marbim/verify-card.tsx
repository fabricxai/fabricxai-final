'use client'

import { useEffect, useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Button } from '@/components/fx/primitives'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { approveDraft, draftFields, rejectDraft } from '@/modules/approvals/actions'
import type { DraftDetail } from '@/modules/approvals/queries'
import { humanise, ValueEditor } from '@/components/shell/reading-fields'

/**
 * Verify a MARBIM draft where the conversation made it — the design canvas's
 * verify-to-write card, on the existing rails and no others.
 *
 * When a turn proposes something, the id was already coming back in `ChatResult`
 * and being dropped on the floor: the person who asked for the change had to walk
 * to the approve inbox to sign what they had just watched being drafted. This card
 * closes that walk. It calls the same `draftFields` the inbox calls, edits become
 * the same `corrections` telemetry, and Verify IS `approveDraft` — so rule 3 holds
 * untouched: the write happens in `pending_changes.approve`, per-field zod and
 * approval rules included, and the audit trail records the verifier the same way
 * it records an inbox click. A draft whose rule wants two signatures says so here
 * instead of pretending one click committed it.
 *
 * Fresh turns open the card at once — the draft is the point of the turn. Stored
 * turns get a one-line offer instead, because hydrating a history must not fire a
 * payload fetch per old turn, and most old drafts are long decided.
 */

type Phase =
  | { kind: 'offer' }
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'ready'; draft: DraftDetail }
  | { kind: 'signed'; committed: boolean; approvals: number; required: number }
  | { kind: 'rejected' }

export function DraftVerifyCards({
  pendingChangeIds,
  fresh,
}: {
  pendingChangeIds: readonly string[]
  /** True on the turn that just ran — the card opens itself. Stored turns offer first. */
  fresh: boolean
}) {
  if (pendingChangeIds.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pendingChangeIds.map((id) => (
        <DraftVerifyCard key={id} pendingChangeId={id} fresh={fresh} />
      ))}
    </div>
  )
}

function DraftVerifyCard({
  pendingChangeId,
  fresh,
}: {
  pendingChangeId: string
  fresh: boolean
}) {
  const [phase, setPhase] = useState<Phase>(fresh ? { kind: 'loading' } : { kind: 'offer' })
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fresh) return
    let cancelled = false
    void draftFields({ pendingChangeId })
      .then((result) => {
        if (cancelled) return
        const draft = unwrap(result)
        setPhase(draft ? { kind: 'ready', draft } : { kind: 'gone' })
      })
      .catch((e) => {
        if (cancelled) return
        setPhase({ kind: 'gone' })
        setError(actionErrorMessage(e, 'The draft could not be read here — the inbox has it.'))
      })
    return () => {
      cancelled = true
    }
  }, [fresh, pendingChangeId])

  function load() {
    setPhase({ kind: 'loading' })
    setError(null)
    void draftFields({ pendingChangeId })
      .then((result) => {
        const draft = unwrap(result)
        setPhase(draft ? { kind: 'ready', draft } : { kind: 'gone' })
      })
      .catch((e) => {
        setPhase({ kind: 'gone' })
        setError(actionErrorMessage(e, 'The draft could not be read here — the inbox has it.'))
      })
  }

  /** Only real edits, compared structurally — re-typing the same value is not a correction. */
  function corrections(draft: DraftDetail): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const field of draft.fields) {
      if (!(field.field in edits)) continue
      if (JSON.stringify(edits[field.field]) === JSON.stringify(field.after)) continue
      out[field.field] = edits[field.field]
    }
    return out
  }

  async function verify(draft: DraftDetail) {
    setBusy(true)
    setError(null)
    try {
      const result = unwrap(
        await approveDraft({ pendingChangeId, corrections: corrections(draft) }),
      )
      setPhase({
        kind: 'signed',
        committed: result.status === 'committed',
        approvals: result.approvals,
        required: result.approvalsRequired,
      })
    } catch (e) {
      setError(actionErrorMessage(e, 'That did not go through.'))
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (reason.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      unwrap(await rejectDraft({ pendingChangeId, reason: reason.trim() }))
      setPhase({ kind: 'rejected' })
    } catch (e) {
      setError(actionErrorMessage(e, 'That did not go through.'))
    } finally {
      setBusy(false)
    }
  }

  if (phase.kind === 'offer' || phase.kind === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={load}
          disabled={phase.kind === 'loading'}
          style={{
            border: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-surface)',
            borderRadius: 'var(--fx-radius-sm)',
            padding: '7px 11px',
            font: '500 12.5px/1 var(--fx-font-sans)',
            color: 'var(--fx-text-primary)',
            cursor: phase.kind === 'loading' ? 'default' : 'pointer',
          }}
        >
          {phase.kind === 'loading' ? 'Reading the draft…' : 'This turn drafted a change — check it'}
        </button>
        {error ? (
          <span style={{ font: '400 12px/1.4 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  if (phase.kind === 'gone') {
    return (
      <span style={{ font: '400 12.5px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
        {error ?? (
          <>
            This turn&rsquo;s draft has already been decided —{' '}
            <a href="/approve" style={{ color: 'inherit' }}>
              the inbox has the trail
            </a>
            .
          </>
        )}
      </span>
    )
  }

  if (phase.kind === 'signed') {
    return (
      <InlineAlert tone={phase.committed ? 'success' : 'info'}>
        {phase.committed
          ? 'Verified and written. The audit trail records you as the approver.'
          : `Signed — ${phase.approvals} of ${phase.required} approvals. It commits when the rest sign in the inbox.`}
      </InlineAlert>
    )
  }

  if (phase.kind === 'rejected') {
    return <InlineAlert tone="info">Rejected. Your reason travels back to the draft.</InlineAlert>
  }

  const draft = phase.draft

  return (
    <div
      style={{
        border: '1px solid var(--fx-border-default)',
        borderRadius: 'var(--fx-radius-md)',
        background: 'var(--fx-bg-surface)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: '600 13.5px/1.3 var(--fx-font-sans)', color: 'var(--fx-text-primary)' }}>
          MARBIM drafted: {draft.operation} on {draft.targetTable.replace(/_/g, ' ')}
        </span>
        <span style={{ font: '400 11.5px/1.4 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}>
          nothing is written until you verify ·{' '}
          <a href="/approve" style={{ color: 'inherit' }}>
            or decide it in the inbox
          </a>
        </span>
      </div>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      {draft.fields.map((field) => {
        const shown = field.field in edits ? edits[field.field] : field.after
        return (
          <div key={field.field} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: '500 13px/1 var(--fx-font-sans)', color: 'var(--fx-text-primary)' }}>
                {humanise(field.field)}
              </span>
              {/* ai_chat drafts carry NO confidence by rule — composed in conversation, nothing
                  was measured. Absence is the honest label, not a number. */}
              <span style={{ font: '400 11.5px/1 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
                {field.confidence !== null
                  ? `read at ${Math.round(field.confidence * 100)}%`
                  : 'composed in this conversation — check it yourself'}
              </span>
            </div>
            {field.before !== null && field.before !== undefined ? (
              <span style={{ font: '400 12px/1.4 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}>
                now: {typeof field.before === 'object' ? JSON.stringify(field.before) : String(field.before)}
              </span>
            ) : null}
            <ValueEditor
              value={shown}
              invalid={false}
              onChange={(next) => setEdits((prev) => ({ ...prev, [field.field]: next }))}
            />
          </div>
        )
      })}

      {rejecting ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why it is wrong — travels back to the draft"
            aria-label="Rejection reason"
            maxLength={200}
            style={{
              flex: 1,
              minWidth: 220,
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              padding: '8px 10px',
              font: '400 13px/1.4 var(--fx-font-sans)',
              background: 'var(--fx-bg-raised)',
              color: 'var(--fx-text-primary)',
            }}
          />
          <Button variant="ghost" disabled={busy || reason.trim().length === 0} onClick={() => void reject()}>
            {busy ? 'Sending…' : 'Reject'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="primary" disabled={busy} onClick={() => void verify(draft)}>
            {busy ? 'Verifying…' : 'Verify — write it'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>
            Not right
          </Button>
        </div>
      )}
    </div>
  )
}
