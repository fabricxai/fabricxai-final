'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { SyncPill } from '@/components/fx/floor'
import { useT } from '@/components/fx/locale'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import type { Translator } from '@/lib/i18n-ui'
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

/**
 * A `defect_severity` as the word next to the defect, not as the column value.
 *
 * Falls back to the raw value, so a fourth severity added to the enum without touching
 * this screen renders wrong rather than as a missing key.
 */
const SEVERITY_COPY: Record<string, string> = {
  critical: 'ui.quality.severity_critical',
  major: 'ui.quality.severity_major',
  minor: 'ui.quality.severity_minor',
}

function severityLabel(t: Translator, severity: string): string {
  const key = SEVERITY_COPY[severity]
  return key ? t(key) : severity
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
  const t = useT()
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
          {t.plural('ui.quality.checks_refused', refused.length)}
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
              {t('ui.common.dismiss')}
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
            label: t('ui.quality.stat_line_dhu'),
            value: dhu.dhu ?? '—',
            note:
              dhu.dhu === null
                ? t('ui.quality.stat_nothing_checked')
                : t('ui.quality.stat_per_hundred'),
            tone: overThreshold ? 'var(--fx-danger)' : undefined,
          },
          {
            label: t('ui.quality.col_checked'),
            value: String(dhu.checked),
            note: t('ui.quality.stat_garments_today'),
          },
          {
            label: t('ui.quality.col_defects'),
            value: String(dhu.defects),
            note: t('ui.quality.stat_found_today'),
          },
          {
            label: t('ui.quality.stat_target'),
            value: threshold ? t('ui.quality.at_most', { value: threshold }) : '—',
            note: t('ui.quality.stat_factory_setting'),
          },
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
          <SectionHeading eyebrow={t('ui.quality.tap_1')}>
            {t('ui.quality.tap_operation_heading')}
          </SectionHeading>
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
              placeholder={t('ui.quality.operation_placeholder')}
              aria-label={t('ui.quality.operation_aria')}
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
              {t('ui.quality.use_this')}
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── Tap 2 ────────────────────────────────────────────────────────── */}
      {step === 'defect' ? (
        <section>
          <SectionHeading eyebrow={t('ui.quality.tap_2', { operation })}>
            {t('ui.quality.tap_defect_heading')}
          </SectionHeading>

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
                        <Badge tone={SEVERITY_TONE[d.severity] ?? 'neutral'}>
                          {severityLabel(t, d.severity)}
                        </Badge>
                      </span>
                    </TapButton>
                  ))}
              </TapGrid>
            </div>
          ))}

          <Button variant="ghost" onClick={reset}>
            {t('ui.quality.back')}
          </Button>
        </section>
      ) : null}

      {/* ── Tap 3 · skippable by design ──────────────────────────────────── */}
      {step === 'operator' && defect ? (
        <section>
          <SectionHeading eyebrow={t('ui.quality.tap_3', { defect: defect.label })}>
            {t('ui.quality.tap_operator_heading')}
          </SectionHeading>

          {operators.length === 0 ? (
            <InlineAlert tone="info">{t('ui.quality.no_operators')}</InlineAlert>
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
                      t('ui.quality.filed_with_operator', {
                        defect: defect.label,
                        operation,
                        operator: o.name,
                      }),
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
                  t('ui.quality.filed_unattributed', { defect: defect.label, operation }),
                )
              }
            >
              {t('ui.quality.skip_operator')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('defect')}>
              {t('ui.quality.back')}
            </Button>
          </div>

          <p
            style={{
              marginTop: 12,
              font: "400 12px/1.5 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            {t('ui.quality.skip_note')}
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
                t('ui.quality.one_checked_noted'),
              )
            }
          >
            {t('ui.quality.one_checked_button')}
          </Button>
          <span
            style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
          >
            {t('ui.quality.denominator_note')}
          </span>
        </div>
      ) : null}

      {/* ── Last few ─────────────────────────────────────────────────────── */}
      {recent.length > 0 ? (
        <section>
          <SectionHeading eyebrow={t('ui.quality.recent_eyebrow')}>
            {t('ui.quality.recent_heading')}
          </SectionHeading>
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
                  {r.defectQty > 0
                    ? t.plural('ui.quality.defect_count', r.defectQty)
                    : t('ui.quality.no_defect')}
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
