'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'

import { Badge, Button } from '@/components/fx/primitives'
import { Card } from '@/components/fx/data'
import { EmptyState, InlineAlert, Modal, Toast } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Eyebrow } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { MarbimMark, type MarkState } from '@/components/fx/mark'
import { approveDraft, draftFields, rejectDraft } from '@/modules/approvals/actions'
import type { DraftDetail } from '@/modules/approvals/queries'

/** The row shape the server page hands over — dates already serialised. */
export interface InboxRowView {
  id: string
  moduleId: string
  targetTable: string
  operation: string
  source: string
  createdAt: string
  ageHours: number
  weakestConfidence: number | null
  requiredRoles: string[]
  approvalsRequired: number
  approvals: number
  approvedByMe: boolean
  title: string
  reference: string | null
  fromModel: boolean
  aging: boolean
}

/**
 * Rejecting always asks for a reason, because the item goes back to whoever
 * drafted it and "rejected" with no reason is a dead end they cannot act on.
 */
const REASONS = [
  'Wrong figure read from the source',
  'Not what the buyer confirmed',
  'No capacity for this change',
  'Needs commercial or LC action first',
  'Duplicate of another pending item',
] as const

export function ApproveInbox({
  rows,
  escalateAfterHours,
}: {
  rows: InboxRowView[]
  escalateAfterHours: number
}) {
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [rejecting, setRejecting] = useState<InboxRowView | null>(null)
  const [toast, setToast] = useState<string>('')
  const [mark, setMark] = useState<MarkState>('rest')
  const [pending, startTransition] = useTransition()

  const flash = useCallback((message: string) => {
    setToast(message)
    setMark('resolved')
    setTimeout(() => {
      setToast('')
      setMark('rest')
    }, 4400)
  }, [])

  const onApprove = useCallback(
    (row: InboxRowView) => {
      setMark('thinking')
      startTransition(async () => {
        try {
          const result = await approveDraft({ pendingChangeId: row.id })
          flash(
            result.status === 'committed'
              ? `Approved and committed · ${row.title}`
              : `Approved · waiting on ${result.approvalsRequired - result.approvals} more signature(s)`,
          )
        } catch (error) {
          setMark('blocked')
          setToast(actionErrorMessage(error, 'That did not go through'))
        }
      })
    },
    [flash],
  )

  // j/k to move, a to approve, r to reject, x to select. Desk screens are
  // keyboard-first: a merchandiser clearing 40 drafts should never need the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (rejecting) return
      if (rows.length === 0) return

      const k = e.key.toLowerCase()
      const current = rows[Math.min(focus, rows.length - 1)]
      if (!current) return

      if (k === 'j') {
        e.preventDefault()
        setFocus((f) => Math.min(f + 1, rows.length - 1))
      } else if (k === 'k') {
        e.preventDefault()
        setFocus((f) => Math.max(f - 1, 0))
      } else if (k === 'a') {
        e.preventDefault()
        onApprove(current)
      } else if (k === 'r') {
        e.preventDefault()
        setRejecting(current)
      } else if (k === 'x') {
        e.preventDefault()
        setSelected((s) =>
          s.includes(current.id) ? s.filter((x) => x !== current.id) : [...s, current.id],
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, focus, rejecting, onApprove])

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing routed to you"
        body="Drafts appear here when a rule sends them to a role you hold. Your own work stays in its own module until then."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <KeyLegend />

      <Card padding={0}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '13px 18px',
            borderBottom: '1px solid var(--fx-border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.length > 0 && selected.length === rows.length}
              onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
              style={{ width: 18, height: 18, accentColor: 'var(--fx-text-primary)' }}
            />
            <span style={{ font: "500 12.5px/1 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
              Select all
            </span>
          </label>
          <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {selected.length > 0
              ? `${selected.length} selected`
              : 'select rows to approve in one pass'}
          </span>

          {selected.length > 0 ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              {/* With a selection live, the batch action owns the view's amber
                  moment and every per-row Approve falls back to outlined. */}
              <Button
                variant="primary"
                onClick={() => {
                  const batch = rows.filter((r) => selected.includes(r.id))
                  setSelected([])
                  setMark('thinking')
                  startTransition(async () => {
                    const results = await Promise.allSettled(
                      batch.map((r) => approveDraft({ pendingChangeId: r.id })),
                    )
                    const ok = results.filter((r) => r.status === 'fulfilled').length
                    const failed = results.length - ok
                    flash(
                      failed === 0
                        ? `${ok} approved`
                        : `${ok} approved · ${failed} could not be committed`,
                    )
                  })
                }}
              >
                Approve {selected.length} selected
              </Button>
            </div>
          ) : null}
        </div>

        {rows.map((row, idx) => (
          <InboxRowItem
            key={row.id}
            row={row}
            focused={idx === focus}
            checked={selected.includes(row.id)}
            /* Exactly one amber fill in the list: the focused row's Approve,
               and only while no batch selection is competing for it. */
            primary={idx === focus && selected.length === 0}
            escalateAfterHours={escalateAfterHours}
            busy={pending}
            onFocus={() => setFocus(idx)}
            onCheck={() =>
              setSelected((s) =>
                s.includes(row.id) ? s.filter((x) => x !== row.id) : [...s, row.id],
              )
            }
            onApprove={() => onApprove(row)}
            onReject={() => setRejecting(row)}
          />
        ))}

        <div
          style={{
            padding: '13px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 3, height: 13, background: 'var(--fx-danger)' }} />
            <span style={{ font: "400 11px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              selvage = age · over {escalateAfterHours}h escalates
            </span>
          </span>
          <span
            style={{
              font: "400 12px/1.4 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
              marginLeft: 'auto',
            }}
          >
            rejecting always asks for a reason — it goes back to the drafter
          </span>
        </div>
      </Card>

      <RejectDialog
        // Keyed on the row so the reason and note reset for each item rather
        // than carrying a previous rejection's text into the next one.
        key={rejecting?.id ?? 'none'}
        row={rejecting}
        onClose={() => setRejecting(null)}
        onDone={(title) => {
          setRejecting(null)
          flash(`Rejected · ${title} sent back to the drafter`)
        }}
      />

      {/* The mark sits bottom-right in whichever of its six states fits. */}
      <div style={{ position: 'fixed', right: 28, bottom: 28, zIndex: 40 }}>
        <MarbimMark state={mark} size={32} label={null} />
      </div>

      {toast ? (
        <div style={{ position: 'fixed', left: 28, bottom: 28, zIndex: 50, maxWidth: 460 }}>
          <Toast message={toast} />
        </div>
      ) : null}
    </div>
  )
}

function InboxRowItem({
  row,
  focused,
  checked,
  primary,
  escalateAfterHours,
  busy,
  onFocus,
  onCheck,
  onApprove,
  onReject,
}: {
  row: InboxRowView
  focused: boolean
  checked: boolean
  primary: boolean
  escalateAfterHours: number
  busy: boolean
  onFocus: () => void
  onCheck: () => void
  onApprove: () => void
  onReject: () => void
}) {
  /**
   * The fields, fetched when the row is opened.
   *
   * `undefined` is "not asked for yet", `null` is "asked, and the draft was gone" — a draft
   * somebody else decided while this list sat open. Collapsing the two would show an empty
   * field list for a draft that no longer exists, which reads as "this writes nothing".
   */
  const [fields, setFields] = useState<DraftDetail | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  function toggle() {
    const next = !open
    setOpen(next)
    if (!next || fields !== undefined || loading) return

    setLoading(true)
    void draftFields({ pendingChangeId: row.id })
      .then(setFields)
      .catch(() => setFields(null))
      .finally(() => setLoading(false))
  }

  const atRisk = row.ageHours >= escalateAfterHours
  const ageing = !atRisk && row.ageHours >= escalateAfterHours / 2

  const ageColour = atRisk
    ? 'var(--fx-danger)'
    : ageing
      ? 'var(--fx-warning)'
      : 'var(--fx-text-tertiary)'

  return (
    <div style={{ borderBottom: '1px solid var(--fx-border-subtle)' }}>
    <div
      onFocus={onFocus}
      onMouseEnter={onFocus}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: focused ? 'var(--fx-bg-hover)' : 'transparent',
        boxShadow: focused ? 'inset 0 0 0 2px var(--fx-focus)' : 'none',
      }}
    >
      {/* Selvage carries age. Never amber — this is a verdict, not an action. */}
      <div
        style={{
          flexShrink: 0,
          width: atRisk ? 5 : 3,
          background: ageColour === 'var(--fx-text-tertiary)' ? 'var(--fx-border-subtle)' : ageColour,
        }}
      />

      <div style={{ padding: '18px 0 0 16px', alignSelf: 'flex-start' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={`Select ${row.title}`}
          style={{ width: 18, height: 18, accentColor: 'var(--fx-text-primary)' }}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: '1.7fr 150px 118px 120px 168px',
          gap: 16,
          padding: '14px 18px',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            {row.reference ? <Ident size={12}>{row.reference}</Ident> : null}
            <Badge>{row.moduleId}</Badge>
            {row.approvedByMe ? <Badge tone="info">waiting on a colleague</Badge> : null}
          </div>
          {/* The title opens the draft. Approving without reading what a draft writes is
              the one thing this inbox exists to prevent, so the way to read it is the most
              obvious thing in the row. */}
          <button
            onClick={toggle}
            aria-expanded={open}
            style={{
              font: "600 15.5px/1.3 var(--fx-font-sans)",
              color: 'var(--fx-text-primary)',
              textWrap: 'pretty',
              background: 'transparent',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {open ? '▾ ' : '▸ '}
            {row.title}
          </button>
          <div
            style={{
              font: "400 13px/1.4 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
            }}
          >
            {row.operation} on {row.targetTable.replace(/_/g, ' ')}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <Eyebrow>Source</Eyebrow>
          <div style={{ font: "400 13px/1.35 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
            {row.fromModel ? 'MARBIM draft' : 'user edit'}
          </div>
          <div style={{ font: "400 12px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}>
            {row.source}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Eyebrow>Confidence</Eyebrow>
          <ConfidenceTicks confidence={row.weakestConfidence} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>Age</Eyebrow>
          <div data-numeric style={{ font: "500 13px/1.2 var(--fx-font-mono)", color: ageColour }}>
            {row.ageHours}h
          </div>
          <div style={{ font: "400 12px/1.3 var(--fx-font-sans)", color: ageColour }}>
            {atRisk ? 'at risk' : ageing ? 'ageing' : 'fresh'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onReject} disabled={busy}>
            Reject
          </Button>
          <Button
            variant={primary ? 'primary' : 'secondary'}
            size="sm"
            onClick={onApprove}
            disabled={busy}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>

      {open ? <DraftFields detail={fields} loading={loading} /> : null}
    </div>
  )
}

/**
 * What the draft would actually write.
 *
 * Every field is shown, not just the uncertain ones. A reviewer deciding whether to sign
 * needs the whole row that is about to exist — a panel that showed only what the extractor
 * doubted would hide a confidently-wrong value, which is the kind this inbox catches worst.
 *
 * Confidence sits on the field it belongs to. The row's single number is the WEAKEST of
 * these, which tells somebody there is a soft field and not which one; that is only useful
 * next to the value itself.
 */
function DraftFields({
  detail,
  loading,
}: {
  detail: DraftDetail | null | undefined
  loading: boolean
}) {
  if (loading || detail === undefined) {
    return <div style={panelStyle}>Reading the draft…</div>
  }

  if (detail === null) {
    return (
      <div style={panelStyle}>
        This draft is no longer pending — somebody else has already decided it.
      </div>
    )
  }

  if (detail.fields.length === 0) {
    // Refused rather than rendered as an empty list: `assertExtractionConfidence` will not
    // let a fieldless draft exist, so one here means something is wrong upstream.
    return <div style={panelStyle}>This draft writes no fields, which should not happen.</div>
  }

  return (
    <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {detail.fields.map((field) => (
        <div
          key={field.field}
          style={{
            display: 'grid',
            gridTemplateColumns: '200px 1fr 132px',
            gap: 14,
            alignItems: 'baseline',
            padding: '7px 0',
          }}
        >
          <span style={{ font: "500 12.5px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}>
            {field.field}
          </span>

          {/* Every part is rendered. Laying a list out is not the same as summarising it —
              "2 items" would be a value the reviewer never saw, and these are the buyer's
              own words about restricted chemicals. */}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {/*
              What it is now, when this replaces something. An update showed only the
              incoming value, so a breakdown revision read as a fresh grid rather than a
              change to the one the floor is cutting to.
            */}
            {field.changed && field.before !== undefined ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                  style={{
                    font: "400 11px/1.3 var(--fx-font-mono)",
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--fx-text-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  now
                </span>
                <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>
                  <FieldValue value={field.before} />
                </span>
              </span>
            ) : null}

            <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              {field.changed && field.before !== undefined ? (
                <span
                  style={{
                    font: "400 11px/1.3 var(--fx-font-mono)",
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    color: 'var(--fx-text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  becomes
                </span>
              ) : null}
              <FieldValue value={field.after} />
            </span>

            {/* A field the draft leaves exactly as it is. Shown greyed rather than hidden:
                a reviewer needs to know what a change does NOT touch. */}
            {!field.changed ? (
              <span
                style={{
                  font: "400 11.5px/1.3 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                unchanged
              </span>
            ) : null}
          </span>

          <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {field.confidence === null ? (
              <span style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                {/* Absence, not a fake 1.0 — a person typed this one. */}
                typed by a person
              </span>
            ) : (
              <ConfidenceTicks confidence={field.confidence} />
            )}
          </span>
        </div>
      ))}

      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--fx-border-subtle)',
          font: "400 12px/1.5 var(--fx-font-mono)",
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {detail.operation} on {detail.targetTable.replace(/_/g, ' ')}
        {detail.model ? ` · read by ${detail.model}` : ''}
        {detail.extractorVersion ? ` · extractor v${detail.extractorVersion}` : ''}
        {detail.sourceDocumentId ? ' · from an attached document' : ''}
      </div>
    </div>
  )
}

/**
 * A field's value, in full.
 *
 * A list of objects — buyer requirements, BOM lines, breakdown cells — is the common shape
 * here, and as one line of JSON it is technically complete and practically unreadable. It
 * gets one block per entry with its keys spelled out. Nothing is dropped or counted: the
 * reviewer of a compliance clause has to be able to read the clause.
 */
function FieldValue({ value }: { value: unknown }) {
  const scalar = (v: unknown): string =>
    v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

  if (Array.isArray(value) && value.some((v) => v !== null && typeof v === 'object')) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((entry, i) => (
          <span
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              paddingLeft: 10,
              borderLeft: '2px solid var(--fx-border-default)',
            }}
          >
            {entry !== null && typeof entry === 'object' ? (
              Object.entries(entry as Record<string, unknown>).map(([k, v]) => (
                <span key={k} style={{ font: "400 12.5px/1.5 var(--fx-font-sans)" }}>
                  <span style={{ color: 'var(--fx-text-tertiary)' }}>{k}: </span>
                  <span style={{ color: 'var(--fx-text-primary)' }}>{scalar(v)}</span>
                </span>
              ))
            ) : (
              <span style={{ font: "400 12.5px/1.5 var(--fx-font-sans)" }}>{scalar(entry)}</span>
            )}
          </span>
        ))}
      </span>
    )
  }

  return (
    <span
      data-numeric
      style={{
        font: "400 13px/1.5 var(--fx-font-mono)",
        color: 'var(--fx-text-primary)',
        wordBreak: 'break-word',
      }}
    >
      {scalar(value)}
    </span>
  )
}

const panelStyle: React.CSSProperties = {
  padding: '14px 18px 16px 62px',
  background: 'var(--fx-bg-canvas)',
  font: "400 13px/1.5 var(--fx-font-sans)",
  color: 'var(--fx-text-secondary)',
}

/**
 * Ten slashes at the mark's 34°. Below 0.90 the fill turns warning — the one
 * field the extractor was least sure about is the field to read first.
 * A human draft has NO confidence, which is absence, not a fake 1.0.
 */
function ConfidenceTicks({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return (
      <span style={{ font: "400 12.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        human edit
      </span>
    )
  }

  const filled = Math.round(confidence * 10)
  const low = confidence < 0.9
  const colour = low ? 'var(--fx-warning)' : 'var(--fx-accent)'

  return (
    <>
      <span
        data-numeric
        style={{
          font: '500 13px/1.2 var(--fx-font-mono)',
          color: low ? 'var(--fx-warning)' : 'var(--fx-text-primary)',
        }}
      >
        {confidence.toFixed(2)}
      </span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            style={{
              width: 2,
              height: 12,
              flexShrink: 0,
              transform: 'skewX(var(--fx-slash-angle))',
              background: i < filled ? colour : 'var(--fx-border-default)',
            }}
          />
        ))}
      </span>
    </>
  )
}

function RejectDialog({
  row,
  onClose,
  onDone,
}: {
  row: InboxRowView | null
  onClose: () => void
  onDone: (title: string) => void
}) {
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!row) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Send this back"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reason || busy}
            onClick={() =>
              startTransition(async () => {
                try {
                  await rejectDraft({ pendingChangeId: row.id, reason, note: note || undefined })
                  onDone(row.title)
                } catch (e) {
                  setError(actionErrorMessage(e, 'That did not go through'))
                }
              })
            }
          >
            Reject
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          {row.title} goes back to whoever drafted it, with your reason attached. No row is
          written.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REASONS.map((r) => (
            <label
              key={r}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                font: "400 14px/1.4 var(--fx-font-sans)",
                color: 'var(--fx-text-primary)',
              }}
            >
              <input
                type="radio"
                name="reject-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                style={{ accentColor: 'var(--fx-accent)' }}
              />
              {r}
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Anything the drafter needs to know (optional)"
          style={{
            background: 'var(--fx-bg-surface)',
            color: 'var(--fx-text-primary)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-sm)',
            padding: '11px 13px',
            font: "400 14px/1.55 var(--fx-font-sans)",
            resize: 'vertical',
          }}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      </div>
    </Modal>
  )
}

function KeyLegend() {
  const keys: [string, string][] = [
    ['j / k', 'move'],
    ['a', 'approve'],
    ['r', 'reject'],
    ['x', 'select'],
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {keys.map(([k, what]) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <kbd
            style={{
              font: "500 11px/1 var(--fx-font-mono)",
              background: 'var(--fx-bg-sunken)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-sm)',
              padding: '5px 7px',
              color: 'var(--fx-text-secondary)',
            }}
          >
            {k}
          </kbd>
          <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {what}
          </span>
        </span>
      ))}
    </div>
  )
}
