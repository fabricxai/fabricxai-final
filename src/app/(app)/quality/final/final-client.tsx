'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { NumpadInput } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { previewAqlPlan, submitFinalInspection } from '@/modules/quality/actions'
import type { AqlPlan } from '@/modules/quality/quality'

interface DefectCode {
  category: string
  code: string
  label: string
  severity: string
}

interface History {
  id: string
  inspectionNo: string
  lotQty: number
  sampleSize: number
  verdict: string
  criticalFound: number
  majorFound: number
  minorFound: number
  inspectedAt: string
}

interface Lot {
  orderId: string
  orderStyleId: string | null
  poNumber: string | null
  buyerName: string | null
  styleCode: string | null
  contractedQty: number | null
  majorAql: string | null
  minorAql: string | null
  history: History[]
}

const LEVELS = ['I', 'II', 'III'] as const

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  critical: 'danger',
  major: 'warning',
  minor: 'neutral',
}

/**
 * Running a final inspection.
 *
 * The plan is fetched from the server the moment the lot size and levels are known, and it
 * is the SAME `resolveAqlPlan` over the same versioned table that the verdict will use — so
 * "pull 200 pieces, accept 10 major" cannot disagree with what the submission decides. No
 * AQL arithmetic happens in this file at all; the counts below are just tallies of what the
 * inspector tapped.
 */
export function FinalClient({
  lots,
  defects,
}: {
  lots: readonly Lot[]
  defects: readonly DefectCode[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [lot, setLot] = useState<Lot | null>(null)
  const [lotQty, setLotQty] = useState('')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('II')
  const [inspectionNo, setInspectionNo] = useState('')
  const [found, setFound] = useState<Record<string, number>>({})
  const [plan, setPlan] = useState<AqlPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const qty = Number.parseInt(lotQty, 10) || 0

  // Tallies, not judgements. Severity comes from the code, and the verdict from the server.
  const counts = { critical: 0, major: 0, minor: 0 }
  for (const [code, n] of Object.entries(found)) {
    const severity = defects.find((d) => d.code === code)?.severity
    if (severity === 'critical' || severity === 'major' || severity === 'minor') {
      counts[severity] += n
    }
  }

  function open(next: Lot) {
    setLot(next)
    const prefilled = next.contractedQty ?? 0
    setLotQty(prefilled > 0 ? String(prefilled) : '')
    setInspectionNo(`FI-${next.poNumber ?? next.orderId.slice(0, 6)}-${next.history.length + 1}`)
    setFound({})
    setPlan(null)
    setPlanError(null)
    setFailure(null)
    // Fetch against the lot being opened, not the one in state — `setLot` has not landed
    // yet. Without this the screen prefills a lot size and then says "enter the lot size",
    // which reads as the field having failed to register.
    if (prefilled > 0) loadPlan(prefilled, level, next)
  }

  function loadPlan(nextQty: number, nextLevel: string, forLot: Lot | null = lot) {
    if (!forLot?.majorAql || !forLot.minorAql || nextQty <= 0) {
      setPlan(null)
      return
    }
    // Read out before the closure: narrowing does not survive into an async callback.
    const majorAql = forLot.majorAql
    const minorAql = forLot.minorAql

    setPlanError(null)
    startTransition(async () => {
      try {
        setPlan(
          await previewAqlPlan({
            lotQty: nextQty,
            inspectionLevel: nextLevel,
            majorAql,
            minorAql,
          }),
        )
      } catch (error) {
        setPlan(null)
        setPlanError(
          actionErrorMessage(error, 'No sampling plan exists for that lot size and level.'),
        )
      }
    })
  }

  function submit() {
    if (!lot || !plan || qty <= 0) return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await submitFinalInspection({
          orderId: lot.orderId,
          ...(lot.orderStyleId ? { orderStyleId: lot.orderStyleId } : {}),
          inspectionNo,
          lotQty: qty,
          inspectionLevel: level,
          majorAql: lot.majorAql,
          minorAql: lot.minorAql,
          defects: Object.entries(found)
            .filter(([, n]) => n > 0)
            .map(([code, count]) => ({ code, count })),
        })

        setOutcome(
          result.verdict === 'pass'
            ? `${inspectionNo} passed. The final-inspection milestone moves.`
            : `${inspectionNo} FAILED. The lot does not ship until it is re-inspected.`,
        )
        setLot(null)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The inspection was not filed.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {outcome ? (
        <InlineAlert tone={outcome.includes('FAILED') ? 'danger' : 'success'}>{outcome}</InlineAlert>
      ) : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {/* ── The lot in front of you ──────────────────────────────────────── */}
      {lot ? (
        <section
          style={{
            border: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-surface)',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <SectionHeading eyebrow={lot.buyerName ?? 'lot'}>
            The lot in front of you · {lot.poNumber ?? lot.orderId.slice(0, 8)}
          </SectionHeading>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            <NumpadInput
              label="Lot size (pcs)"
              value={lotQty}
              onChange={(v) => {
                setLotQty(v)
                loadPlan(Number.parseInt(v, 10) || 0, level)
              }}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Inspection level</span>
              <select
                value={level}
                onChange={(e) => {
                  const next = e.target.value as (typeof LEVELS)[number]
                  setLevel(next)
                  loadPlan(qty, next)
                }}
                style={{
                  minHeight: 44,
                  minWidth: 0,
                  padding: '10px 12px',
                  border: '1px solid var(--fx-border-default)',
                  borderRadius: 'var(--fx-radius-sm)',
                  background: 'var(--fx-bg-surface)',
                  color: 'var(--fx-text-primary)',
                  font: "400 14px/1.4 var(--fx-font-sans)",
                }}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Inspection no.</span>
              <input
                value={inspectionNo}
                onChange={(e) => setInspectionNo(e.target.value)}
                style={{
                  minHeight: 44,
                  minWidth: 0,
                  padding: '10px 12px',
                  border: '1px solid var(--fx-border-default)',
                  borderRadius: 'var(--fx-radius-sm)',
                  background: 'var(--fx-bg-surface)',
                  color: 'var(--fx-text-primary)',
                  font: "400 14px/1.4 var(--fx-font-sans)",
                }}
              />
            </label>
          </div>

          {/* ── The rule, not just the numbers ───────────────────────────── */}
          <SectionHeading eyebrow="from the buyer's terms, not a default">
            The rule, not just the numbers
          </SectionHeading>

          {!lot.majorAql ? (
            <InlineAlert tone="warning">
              {lot.buyerName ?? 'This buyer'} has no terms on file, so there is no agreed AQL to
              inspect against. A level the system picked would be an acceptance number nobody
              signed for — set the buyer&rsquo;s terms first.
            </InlineAlert>
          ) : planError ? (
            <InlineAlert tone="danger">{planError}</InlineAlert>
          ) : plan ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 1,
                  background: 'var(--fx-border-subtle)',
                  border: '1px solid var(--fx-border-subtle)',
                }}
              >
                {[
                  {
                    label: 'Pull',
                    value: plan.hundredPercent ? `all ${plan.lotQty}` : String(plan.sampleSize),
                    note: plan.hundredPercent ? '100% inspection' : 'pieces from the lot',
                  },
                  {
                    label: `Major · AQL ${plan.majorAql}`,
                    value: `${plan.majorAccept} / ${plan.majorReject}`,
                    note: 'accept / reject',
                  },
                  {
                    label: `Minor · AQL ${plan.minorAql}`,
                    value: `${plan.minorAccept} / ${plan.minorReject}`,
                    note: 'accept / reject',
                  },
                  { label: 'Critical', value: '0', note: 'no acceptance number exists' },
                ].map((cell) => (
                  <div
                    key={cell.label}
                    style={{ background: 'var(--fx-bg-surface)', padding: '14px 16px' }}
                  >
                    <div
                      style={{
                        font: "400 10.5px/1.3 var(--fx-font-mono)",
                        letterSpacing: '.05em',
                        textTransform: 'uppercase',
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {cell.label}
                    </div>
                    <div style={{ marginTop: 6, font: "600 24px/1.1 var(--fx-font-sans)" }}>
                      {cell.value}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        font: "400 11.5px/1.3 var(--fx-font-sans)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {cell.note}
                    </div>
                  </div>
                ))}
              </div>
              <p
                style={{
                  margin: 0,
                  font: "400 12px/1.6 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                Major and minor are judged separately and never netted — a lot can pass on
                minors and fail on majors in the same count. One critical defect fails the lot
                on its own, whatever the rest of the numbers say.
              </p>
            </>
          ) : (
            <span
              style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
            >
              {pending ? 'reading the sampling table…' : 'enter the lot size to see the plan'}
            </span>
          )}

          {/* ── Counting ─────────────────────────────────────────────────── */}
          {plan ? (
            <>
              <SectionHeading eyebrow="tap what you find">Defects</SectionHeading>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                  gap: 10,
                }}
              >
                {defects.map((d) => {
                  const n = found[d.code] ?? 0
                  return (
                    <div
                      key={d.code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        border: `1px solid ${n > 0 ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                        borderRadius: 'var(--fx-radius-md)',
                        background: 'var(--fx-bg-surface)',
                        minHeight: 56,
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 4,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>{d.label}</span>
                        <Badge tone={SEVERITY_TONE[d.severity] ?? 'neutral'}>{d.severity}</Badge>
                      </span>
                      <button
                        aria-label={`Remove one ${d.label}`}
                        disabled={n === 0}
                        onClick={() => setFound((f) => ({ ...f, [d.code]: Math.max(0, n - 1) }))}
                        style={tallyButton}
                      >
                        −
                      </button>
                      <span
                        style={{
                          minWidth: 22,
                          textAlign: 'center',
                          font: "600 16px/1 var(--fx-font-mono)",
                        }}
                      >
                        {n}
                      </span>
                      <button
                        aria-label={`Add one ${d.label}`}
                        onClick={() => setFound((f) => ({ ...f, [d.code]: n + 1 }))}
                        style={tallyButton}
                      >
                        +
                      </button>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}>
                {(['critical', 'major', 'minor'] as const).map((severity) => {
                  const accept =
                    severity === 'critical'
                      ? 0
                      : severity === 'major'
                        ? plan.majorAccept
                        : plan.minorAccept
                  const over = counts[severity] > accept
                  return (
                    <span key={severity} style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          font: "400 10.5px/1.3 var(--fx-font-mono)",
                          letterSpacing: '.05em',
                          textTransform: 'uppercase',
                          color: 'var(--fx-text-tertiary)',
                        }}
                      >
                        {severity} found
                      </span>
                      <span
                        style={{
                          font: "600 22px/1.1 var(--fx-font-sans)",
                          color: over ? 'var(--fx-danger)' : 'var(--fx-text-primary)',
                        }}
                      >
                        {counts[severity]}
                        <span
                          style={{
                            font: "400 12px/1 var(--fx-font-mono)",
                            color: 'var(--fx-text-tertiary)',
                          }}
                        >
                          {' '}
                          / {accept} allowed
                        </span>
                      </span>
                    </span>
                  )
                })}

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <Button variant="ghost" onClick={() => setLot(null)}>
                    Back
                  </Button>
                  <Button variant="primary" size="lg" disabled={pending} onClick={submit}>
                    {pending ? 'Filing…' : 'Submit the verdict'}
                  </Button>
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  font: "400 12px/1.6 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                The verdict is decided by the server from the sampling table, not by this
                screen and not by the inspector. What is shown above is the count.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {/* ── The lots ─────────────────────────────────────────────────────── */}
      {lots.map((l) => {
        const last = l.history[0]
        return (
          <div
            key={l.orderId}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 200px 190px 170px',
              gap: 14,
              alignItems: 'center',
              padding: '14px 18px',
              border: '1px solid var(--fx-border-subtle)',
              borderLeft: `3px solid ${
                last?.verdict === 'fail' ? 'var(--fx-danger)' : 'transparent'
              }`,
              background: 'var(--fx-bg-surface)',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ font: "600 15px/1.2 var(--fx-font-sans)" }}>
                {l.poNumber ?? l.orderId.slice(0, 8)}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 3,
                  font: "400 12px/1.3 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {l.buyerName ?? 'no buyer'}
                {l.styleCode ? ` · ${l.styleCode}` : ''}
                {l.contractedQty ? ` · ${l.contractedQty.toLocaleString()} pcs` : ''}
              </span>
            </span>

            <span
              style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
            >
              {l.majorAql ? `AQL ${l.majorAql} / ${l.minorAql}` : 'no buyer terms'}
            </span>

            <span>
              {last ? (
                <Badge tone={last.verdict === 'pass' ? 'success' : 'danger'}>
                  {last.inspectionNo} · {last.verdict}
                </Badge>
              ) : (
                <span
                  style={{
                    font: "400 12px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  never inspected
                </span>
              )}
            </span>

            <span style={{ textAlign: 'right' }}>
              <Button variant="ghost" disabled={!l.majorAql} onClick={() => open(l)}>
                {last ? 'Re-inspect' : 'Inspect'}
              </Button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

const tallyButton: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'transparent',
  color: 'var(--fx-text-primary)',
  cursor: 'pointer',
  font: "500 18px/1 var(--fx-font-sans)",
}
