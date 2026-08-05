'use client'

import { factoryToday } from '@/lib/dates'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import {
  addCostToSample,
  closeSample,
  markSampleDispatched,
  moveSampleStage,
  recordBuyerVerdict,
} from '@/modules/sampling/actions'

interface StageEvent {
  stage: string
  at: string
}

interface Round {
  round: number
  verdict: string
  comments: { area: string; comment: string; page?: number }[]
  recordedOn: string
}

interface Dispatch {
  courier: string
  awb: string
  at: string
}

const STAGES = ['pattern', 'cutting', 'sewing', 'finishing', 'qc', 'dispatched'] as const

const VERDICTS = [
  { key: 'approved', label: 'Approved', releases: true },
  { key: 'approved_with_comments', label: 'Approved with comments', releases: true },
  { key: 'rejected', label: 'Rejected', releases: false },
] as const

const VERDICT_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  approved: 'success',
  approved_with_comments: 'warning',
  rejected: 'danger',
}

const COST_KINDS = ['fabric', 'trims', 'labour', 'courier', 'other'] as const

/**
 * One sample request.
 *
 * The verdict panel says out loud whether the choice releases cutting, because the person
 * transcribing a comment sheet is not usually the person who knows that an approval here
 * unblocks a lay downstairs. A gate whose trigger is invisible from the screen that trips
 * it gets tripped carelessly.
 */
export function SampleDetailClient({
  sampleRequestId,
  type,
  status,
  dueDate,
  totalCost,
  stages,
  rounds,
  dispatches,
}: {
  sampleRequestId: string
  type: string
  status: string
  dueDate: string | null
  totalCost: string
  stages: readonly StageEvent[]
  rounds: readonly Round[]
  dispatches: readonly Dispatch[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [verdict, setVerdict] = useState<string>('approved')
  const [area, setArea] = useState('')
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<{ area: string; comment: string }[]>([])

  const [courier, setCourier] = useState('DHL')
  const [awb, setAwb] = useState('')

  const [costKind, setCostKind] = useState<string>('fabric')
  const [costAmount, setCostAmount] = useState('')

  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const reached = new Set(stages.map((s) => s.stage))
  // `sample_requests.status` is a state machine, and dispatch is only legal from `in_work` —
  // a sample goes to the buyer BEFORE they judge it. Offering the control on an approved
  // request would be offering a 409, which is how people learn to distrust buttons.
  const canDispatch = status === 'in_work'
  const chosen = VERDICTS.find((v) => v.key === verdict)!
  const latest = rounds[rounds.length - 1] ?? null

  function run(work: () => Promise<string>) {
    setFailure(null)
    startTransition(async () => {
      try {
        setNoted(await work())
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'That did not go through.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {type === 'pp' && latest && latest.verdict !== 'rejected' ? (
        <InlineAlert tone="success">
          This PP sample is approved — cutting is released for {type.toUpperCase()} on this
          style. The gate reads it directly; nobody has to tell the floor separately.
        </InlineAlert>
      ) : null}

      {/* ── Stage history ────────────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow="tap, then confirm">Stage</SectionHeading>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STAGES.map((stage) => {
            const done = reached.has(stage)
            return (
              <button
                key={stage}
                disabled={pending || done}
                onClick={() =>
                  run(async () => {
                    const r = await moveSampleStage({ sampleRequestId, stage })
                    return `Moved to ${r.stage}.`
                  })
                }
                style={{
                  minHeight: 44,
                  padding: '9px 16px',
                  borderRadius: 'var(--fx-radius-md)',
                  border: `1px solid ${done ? 'var(--fx-success)' : 'var(--fx-border-default)'}`,
                  background: done
                    ? 'color-mix(in srgb, var(--fx-success) 12%, transparent)'
                    : 'transparent',
                  color: 'var(--fx-text-primary)',
                  cursor: done ? 'default' : 'pointer',
                  font: "500 13px/1 var(--fx-font-sans)",
                }}
              >
                {done ? '✓ ' : ''}
                {stage}
              </button>
            )
          })}
        </div>

        {stages.length > 0 ? (
          <div
            style={{
              marginTop: 12,
              font: "400 12px/1.7 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            {stages.map((s) => `${s.stage} ${s.at.slice(0, 10)}`).join(' → ')}
          </div>
        ) : null}
      </section>

      {/* ── The verdict ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          eyebrow={rounds.length > 0 ? `round ${rounds.length} recorded` : 'no rounds yet'}
        >
          Record the buyer&rsquo;s verdict
        </SectionHeading>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {VERDICTS.map((v) => {
            const on = v.key === verdict
            return (
              <button
                key={v.key}
                onClick={() => setVerdict(v.key)}
                style={{
                  minHeight: 44,
                  padding: '9px 16px',
                  borderRadius: 'var(--fx-radius-md)',
                  border: `1px solid ${on ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                  background: on ? 'var(--fx-text-primary)' : 'transparent',
                  color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                  cursor: 'pointer',
                  font: "500 13px/1 var(--fx-font-sans)",
                }}
              >
                {v.label}
              </button>
            )
          })}
        </div>

        {/* Said before the click, not after. */}
        {type === 'pp' ? (
          <InlineAlert tone={chosen.releases ? 'warning' : 'info'}>
            {chosen.releases
              ? 'This releases cutting. The floor may spread a lay against this style as soon as it is recorded.'
              : 'This does NOT release cutting. The floor stays blocked until an approved round is recorded.'}
          </InlineAlert>
        ) : null}

        {/* ── Itemised comments ────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 180px' }}>
            <span style={fieldLabel}>Area</span>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Collar"
              style={control}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 300px' }}>
            <span style={fieldLabel}>What the buyer said</span>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Point length 2mm short of spec; correct before bulk."
              style={control}
            />
          </label>
          <Button
            variant="ghost"
            disabled={!area.trim() || !comment.trim()}
            onClick={() => {
              setComments((c) => [...c, { area: area.trim(), comment: comment.trim() }])
              setArea('')
              setComment('')
            }}
          >
            Add comment
          </Button>
        </div>

        {comments.length > 0 ? (
          <ul
            style={{
              margin: '12px 0 0',
              paddingLeft: 18,
              font: "400 13px/1.7 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
            }}
          >
            {comments.map((c, i) => (
              <li key={`${c.area}-${i}`}>
                <strong>{c.area}</strong> — {c.comment}
              </li>
            ))}
          </ul>
        ) : null}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <span style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {verdict === 'rejected' && comments.length === 0
              ? 'a rejection with no comment is a sample nobody can remake correctly'
              : `${comments.length} comment${comments.length === 1 ? '' : 's'} on this round`}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <Button
              variant="primary"
              size="lg"
              disabled={pending || (verdict === 'rejected' && comments.length === 0)}
              onClick={() =>
                run(async () => {
                  const r = await recordBuyerVerdict({
                    sampleRequestId,
                    verdict: verdict as 'approved' | 'approved_with_comments' | 'rejected',
                    comments,
                    recordedOn: factoryToday(),
                  })
                  setComments([])
                  return r.releasesCutting
                    ? `Round ${r.round} recorded — cutting is released.`
                    : `Round ${r.round} recorded — cutting stays blocked.`
                })
              }
            >
              Record the verdict
            </Button>
          </span>
        </div>

        {rounds.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 18 }}>
            {rounds.map((r) => (
              <div
                key={r.round}
                style={{
                  padding: '12px 16px',
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ font: "600 13.5px/1.2 var(--fx-font-sans)" }}>
                    Round {r.round}
                  </span>
                  <Badge tone={VERDICT_TONE[r.verdict] ?? 'neutral'}>
                    {r.verdict.replace(/_/g, ' ')}
                  </Badge>
                  <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                    {r.recordedOn}
                  </span>
                </div>
                {r.comments.map((c, i) => (
                  <div
                    key={`${c.area}-${i}`}
                    style={{
                      marginTop: 6,
                      font: "400 12.5px/1.5 var(--fx-font-sans)",
                      color: 'var(--fx-text-secondary)',
                    }}
                  >
                    <strong>{c.area}</strong> — {c.comment}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Dispatch and costs ───────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow={`${totalCost} spent on this sample`}>
          Dispatch and costs
        </SectionHeading>

        {!canDispatch ? (
          <div style={{ marginBottom: 12 }}>
            <InlineAlert tone="info">
              A sample is dispatched while it is in work — once the buyer has judged it, the
              journey it would be recording has already happened. This request is{' '}
              {status.replace(/_/g, ' ')}.
            </InlineAlert>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 140px' }}>
            <span style={fieldLabel}>Courier</span>
            <input value={courier} onChange={(e) => setCourier(e.target.value)} style={control} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 200px' }}>
            <span style={fieldLabel}>Airway bill</span>
            <input
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              placeholder="the buyer chases it by this"
              style={control}
            />
          </label>
          <Button
            variant="secondary"
            disabled={pending || !awb.trim() || !courier.trim() || !canDispatch}
            onClick={() =>
              run(async () => {
                await markSampleDispatched({ sampleRequestId, courier: courier.trim(), awb: awb.trim() })
                setAwb('')
                return `Dispatched by ${courier.trim()}.`
              })
            }
          >
            Mark dispatched
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 160px' }}>
            <span style={fieldLabel}>Cost of</span>
            <select value={costKind} onChange={(e) => setCostKind(e.target.value)} style={control}>
              {COST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 160px' }}>
            <span style={fieldLabel}>Amount (USD)</span>
            <input
              inputMode="decimal"
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              style={control}
            />
          </label>
          <Button
            variant="ghost"
            disabled={pending || !costAmount.trim()}
            onClick={() =>
              run(async () => {
                const r = await addCostToSample({
                  sampleRequestId,
                  kind: costKind,
                  amount: costAmount.trim(),
                  currency: 'USD',
                })
                setCostAmount('')
                return `Added — ${r.runningTotal} spent on this sample so far.`
              })
            }
          >
            Add the cost
          </Button>
        </div>

        {dispatches.length > 0 ? (
          <div
            style={{
              marginTop: 14,
              font: "400 12.5px/1.7 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            {dispatches.map((d) => `${d.at.slice(0, 10)} · ${d.courier} ${d.awb}`).join('  ·  ')}
          </div>
        ) : null}

        {status !== 'closed' ? (
          <div style={{ marginTop: 18 }}>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await closeSample({ sampleRequestId })
                  return 'Request closed.'
                })
              }
            >
              Close this request
            </Button>
            <span
              style={{
                marginLeft: 12,
                font: "400 12px/1.5 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {dueDate ? `due ${dueDate} · ` : ''}closing does not withdraw an approval already
              given
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <Badge tone="neutral">closed</Badge>
          </div>
        )}
      </section>
    </div>
  )
}

const fieldLabel: React.CSSProperties = { font: "500 13px/1.3 var(--fx-font-sans)" }

const control: React.CSSProperties = {
  minHeight: 44,
  minWidth: 0,
  padding: '10px 12px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 14px/1.4 var(--fx-font-sans)",
}
