'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { SyncPill } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'

interface TapDefect {
  category: string
  code: string
  label: string
  severity: string
}

interface Operator {
  id: string
  name: string
  designation: string | null
}

interface Recent {
  id: string
  operation: string
  checkedQty: number
  defectQty: number
  occurredAt: string
}

/** Tap 1 picks the operation, tap 2 the defect, tap 3 (optional) the operator. */
type Step = 'operation' | 'defect' | 'operator'

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  critical: 'danger',
  major: 'warning',
  minor: 'neutral',
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * The three-tap inline check.
 *
 * Each tap advances on touch — no confirm button between steps, because a confirm doubles
 * the taps and the canvas budget is three. The write only happens at the end of the third
 * step (or when it is skipped), so nothing is filed half-finished.
 *
 * **"1 checked, no defect" is a first-class action, not an empty form.** A DHU is a ratio,
 * and if only defects are ever filed the denominator is whatever anyone happened to log —
 * so the good garments have to be as cheap to record as the bad ones. One tap, one row.
 */
export function InlineClient({
  lineId,
  lines,
  orderId,
  defects,
  operations,
  operators,
  recent,
  dhu,
  threshold,
}: {
  lineId: string
  lines: readonly { id: string; code: string }[]
  orderId: string | null
  defects: readonly TapDefect[]
  operations: readonly string[]
  operators: readonly Operator[]
  recent: readonly Recent[]
  dhu: { dhu: string | null; checked: number; defects: number }
  threshold: string | null
}) {
  const router = useRouter()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [step, setStep] = useState<Step>('operation')
  const [operation, setOperation] = useState<string | null>(null)
  const [defect, setDefect] = useState<TapDefect | null>(null)
  const [typed, setTyped] = useState('')
  const [noted, setNoted] = useState<string | null>(null)

  const overThreshold =
    dhu.dhu !== null && threshold !== null && Number(dhu.dhu) > Number(threshold)

  function reset() {
    setStep('operation')
    setOperation(null)
    setDefect(null)
    setTyped('')
  }

  async function file(
    payload: { operation: string; defects: { code: string; count: number }[]; operatorId?: string },
    confirmation: string,
  ) {
    await capture({
      moduleId: 'quality',
      operation: 'inline_check',
      payload: {
        lineId,
        ...(orderId ? { orderId } : {}),
        checkedQty: 1,
        occurredAt: new Date().toISOString(),
        ...payload,
      },
    })

    setNoted(confirmation)
    reset()
    if (online) await sync()
    router.refresh()
  }

  const categories = [...new Set(defects.map((d) => d.category))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} check{refused.length === 1 ? '' : 's'} the server refused.
          {refused.map((r) => (
            <button
              key={r.offlineKey}
              onClick={() => void clear(r.offlineKey)}
              style={{
                marginLeft: 8,
                background: 'transparent',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              dismiss
            </button>
          ))}
        </InlineAlert>
      ) : null}

      {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}

      {/* ── Live DHU, always with its denominator ────────────────────────── */}
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
            label: 'Line DHU · live',
            value: dhu.dhu ?? '—',
            note: dhu.dhu === null ? 'nothing checked yet' : 'defects per hundred',
            tone: overThreshold ? 'var(--fx-danger)' : undefined,
          },
          { label: 'Checked', value: String(dhu.checked), note: 'garments today' },
          { label: 'Defects', value: String(dhu.defects), note: 'found today' },
          { label: 'Target', value: threshold ? `≤ ${threshold}` : '—', note: 'factory setting' },
        ].map((cell) => (
          <div key={cell.label} style={{ background: 'var(--fx-bg-surface)', padding: '14px 16px' }}>
            <div
              style={{
                font: "400 10.5px/1 var(--fx-font-mono)",
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {cell.label}
            </div>
            <div
              style={{
                marginTop: 6,
                font: "600 26px/1.1 var(--fx-font-sans)",
                color: cell.tone ?? 'var(--fx-text-primary)',
              }}
            >
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

      {/* ── Which line ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {lines.map((l) => {
          const on = l.id === lineId
          return (
            <button
              key={l.id}
              onClick={() => router.push(`/quality/inline?line=${l.id}`)}
              style={{
                minHeight: 44,
                padding: '8px 16px',
                borderRadius: 'var(--fx-radius-md)',
                border: `1px solid ${on ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                background: on ? 'var(--fx-text-primary)' : 'transparent',
                color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                cursor: 'pointer',
                font: "500 13px/1 var(--fx-font-sans)",
              }}
            >
              {l.code}
            </button>
          )
        })}
      </div>

      {/* ── Tap 1 ────────────────────────────────────────────────────────── */}
      {step === 'operation' ? (
        <section>
          <SectionHeading eyebrow="tap 1">Which operation</SectionHeading>
          <TapGrid>
            {operations.map((op) => (
              <TapButton
                key={op}
                onClick={() => {
                  setOperation(op)
                  setStep('defect')
                }}
              >
                {op}
              </TapButton>
            ))}
          </TapGrid>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="or type an operation this line does"
              aria-label="Other operation"
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                minHeight: 44,
                padding: '10px 12px',
                border: '1px solid var(--fx-border-default)',
                borderRadius: 'var(--fx-radius-sm)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                font: "400 14px/1.4 var(--fx-font-sans)",
              }}
            />
            <Button
              variant="ghost"
              disabled={typed.trim() === ''}
              onClick={() => {
                setOperation(typed.trim())
                setStep('defect')
              }}
            >
              Use this
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── Tap 2 ────────────────────────────────────────────────────────── */}
      {step === 'defect' ? (
        <section>
          <SectionHeading eyebrow={`tap 2 · ${operation}`}>What is wrong</SectionHeading>

          {categories.map((category) => (
            <div key={category} style={{ marginBottom: 18 }}>
              <div
                style={{
                  font: "400 11px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                  marginBottom: 8,
                }}
              >
                {category}
              </div>
              <TapGrid>
                {defects
                  .filter((d) => d.category === category)
                  .map((d) => (
                    <TapButton
                      key={d.code}
                      onClick={() => {
                        setDefect(d)
                        setStep('operator')
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 6,
                        }}
                      >
                        {d.label}
                        <Badge tone={SEVERITY_TONE[d.severity] ?? 'neutral'}>{d.severity}</Badge>
                      </span>
                    </TapButton>
                  ))}
              </TapGrid>
            </div>
          ))}

          <Button variant="ghost" onClick={reset}>
            Back
          </Button>
        </section>
      ) : null}

      {/* ── Tap 3 · skippable by design ──────────────────────────────────── */}
      {step === 'operator' && defect ? (
        <section>
          <SectionHeading eyebrow={`tap 3 · ${defect.label}`}>
            Whose machine, if you know
          </SectionHeading>

          {operators.length === 0 ? (
            <InlineAlert tone="info">
              No operators are assigned to this line yet, so there is nobody to attribute this
              to. The defect still files.
            </InlineAlert>
          ) : (
            <TapGrid>
              {operators.map((o) => (
                <TapButton
                  key={o.id}
                  onClick={() =>
                    void file(
                      {
                        operation: operation!,
                        defects: [{ code: defect.code, count: 1 }],
                        operatorId: o.id,
                      },
                      `${defect.label} on ${operation} · ${o.name}`,
                    )
                  }
                >
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                    }}
                  >
                    {o.name}
                    {o.designation ? (
                      <span
                        style={{
                          font: "400 11px/1.2 var(--fx-font-mono)",
                          color: 'var(--fx-text-tertiary)',
                        }}
                      >
                        {o.designation}
                      </span>
                    ) : null}
                  </span>
                </TapButton>
              ))}
            </TapGrid>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                void file(
                  { operation: operation!, defects: [{ code: defect.code, count: 1 }] },
                  `${defect.label} on ${operation} · not attributed`,
                )
              }
            >
              Skip — just log the defect
            </Button>
            <Button variant="ghost" onClick={() => setStep('defect')}>
              Back
            </Button>
          </div>

          <p
            style={{
              marginTop: 12,
              font: "400 12px/1.5 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            Skipping is normal. A defect nobody can attribute is still a defect, and a QC who
            has to guess a name to file one will guess.
          </p>
        </section>
      ) : null}

      {/* ── The denominator ──────────────────────────────────────────────── */}
      {step === 'operation' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="lg"
            disabled={operations.length === 0}
            onClick={() =>
              void file(
                { operation: operations[0] ?? 'Inline check', defects: [] },
                '1 checked, no defect',
              )
            }
          >
            ＋ 1 checked, no defect
          </Button>
          <span
            style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
          >
            DHU is a ratio — good garments have to be as cheap to record as bad ones, or the
            denominator is whatever anyone happened to log
          </span>
        </div>
      ) : null}

      {/* ── Last few ─────────────────────────────────────────────────────── */}
      {recent.length > 0 ? (
        <section>
          <SectionHeading eyebrow="last few">Just filed</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recent.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 16px',
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-sans)",
                }}
              >
                <span
                  style={{
                    font: "400 12px/1 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                    minWidth: 52,
                  }}
                >
                  {clockTime(r.occurredAt)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{r.operation}</span>
                <Badge tone={r.defectQty > 0 ? 'warning' : 'success'}>
                  {r.defectQty > 0 ? `${r.defectQty} defect` : 'no defect'}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function TapGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 10,
      }}
    >
      {children}
    </div>
  )
}

/** A target big enough to hit while walking. The canvas floor density is 44px minimum. */
function TapButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        textAlign: 'left',
        minHeight: 64,
        padding: '14px 16px',
        border: '1px solid var(--fx-border-default)',
        borderRadius: 'var(--fx-radius-md)',
        background: 'var(--fx-bg-surface)',
        color: 'var(--fx-text-primary)',
        cursor: 'pointer',
        font: "500 14px/1.35 var(--fx-font-sans)",
      }}
    >
      {children}
    </button>
  )
}
