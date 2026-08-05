import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
import type { Locale } from '@/lib/i18n'
import { tui } from '@/lib/i18n-ui'
import { requestLocale } from '@/lib/ui-locale'
import { getCtx } from '@/modules/core/session'
import {
  defectLabels,
  defectPareto,
  dhuByLine,
  dhuTrend,
  inlineActivity,
  recentFinalInspections,
  type FinalInspectionRow,
  type LineDhu,
} from '@/modules/quality/queries'
import { repeatDefectAlerts, type QualityPolicy } from '@/modules/quality/service'
import { getPolicy } from '@/modules/settings/service'
import { factoryToday } from '@/lib/dates'

/**
 * 7.1 Quality.
 *
 * Two numbers, and both are ratios that must never appear without their
 * denominator: DHU on the sewing floor, and the AQL accept/reject count on a
 * finished lot. A verdict is computed server-side from the AQL plan — an
 * inspector cannot make a lot pass by relabelling a major defect on the way in,
 * so this screen shows the arithmetic rather than asking anyone to trust it.
 */
export const dynamic = 'force-dynamic'

export default async function QualityPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()

  const policy = await getPolicy<QualityPolicy>(ctx, 'quality')
  const today = factoryToday()

  // A fortnight, which is the window the canvas dashboard shows: long enough for a trend
  // to have a shape, short enough that a fix made last week is still visible in it.
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 13 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const [lines, inspections, activity, trend, pareto, repeats] = await Promise.all([
    dhuByLine(ctx, { on: today, threshold: policy.dhuAlertThreshold ?? null }),
    recentFinalInspections(ctx),
    inlineActivity(ctx, { from: today, to: today }),
    dhuTrend(ctx, { from, to: today }),
    defectPareto(ctx, { from, to: today }),
    repeatDefectAlerts(ctx, { from, to: today }, policy),
  ])

  // Weighted, not the mean of the daily figures — a quiet Saturday with forty checks must
  // not count as much as a full Tuesday with six hundred.
  const measured = trend.filter((d) => d.checked > 0)
  const periodChecked = measured.reduce((n, d) => n + d.checked, 0)
  const periodDefects = measured.reduce((n, d) => n + d.defects, 0)
  const periodDhu =
    periodChecked > 0 ? ((periodDefects * 100) / periodChecked).toFixed(1) : null
  const worstDhu = Math.max(...trend.map((d) => Number(d.dhu ?? 0)), 0.01)
  const causesTo80 = pareto.findIndex((p) => Number(p.cumulativePct) >= 80) + 1

  // `DefectRun` carries the raw code. Left as-is the screen shows "Skipped stitch" in the
  // pareto and "SKIP_STITCH" three inches below it — the same defect in two vocabularies,
  // which makes a reader wonder whether they are the same thing.
  const runLabels = await defectLabels(ctx, repeats.map((r) => r.code))

  const over = lines.filter((l) => l.overThreshold)
  const unchecked = lines.filter((l) => l.dhu === null)
  const failed = inspections.filter((i) => i.verdict === 'fail')

  return (
    <FloorScreen>
      <PageHeader
        eyebrow={tui(locale, 'ui.quality.eyebrow_dated', { date: today })}
        title={
          lines.length === 0
            ? tui(locale, 'ui.quality.no_lines_title')
            : tui(
                locale,
                lines.length === 1 ? 'ui.quality.lines_count_one' : 'ui.quality.lines_count_other',
                { count: lines.length },
              )
        }
        meta={
          over.length > 0
            ? tui(
                locale,
                over.length === 1
                  ? 'ui.quality.lines_over_dhu_one'
                  : 'ui.quality.lines_over_dhu_other',
                { count: over.length, threshold: policy.dhuAlertThreshold },
              )
            : undefined
        }
        ownsAmber
      />

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <QualityLink href="/quality/inline">{tui(locale, 'ui.quality.nav_inline')}</QualityLink>
        <QualityLink href="/quality/fabric">{tui(locale, 'ui.quality.nav_fabric')}</QualityLink>
        <QualityLink href="/quality/final">{tui(locale, 'ui.quality.nav_final')}</QualityLink>
        <QualityLink href="/quality/measurements">
          {tui(locale, 'ui.quality.nav_measurements')}
        </QualityLink>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        {/* Not checking is a different problem from checking badly, and the one
            more likely to go unnoticed — so it gets its own line. */}
        {unchecked.length > 0 && lines.length > 0 ? (
          <InlineAlert tone="warning">
            {tui(locale, 'ui.quality.unchecked_lines', {
              count: unchecked.length,
              total: lines.length,
            })}
          </InlineAlert>
        ) : null}

        {failed.length > 0 ? (
          <InlineAlert tone="danger">
            {tui(
              locale,
              failed.length === 1 ? 'ui.quality.final_failed_one' : 'ui.quality.final_failed_other',
              { count: failed.length },
            )}
          </InlineAlert>
        ) : null}

        {/* ── Where quality is costing us (canvas P5) ─────────────────── */}
        <section>
          <SectionHeading
            eyebrow={
              periodDhu
                ? tui(locale, 'ui.quality.dhu_period_eyebrow', {
                    dhu: periodDhu,
                    target: policy.dhuAlertThreshold ?? '—',
                  })
                : tui(locale, 'ui.quality.dhu_nothing_checked')
            }
          >
            {tui(locale, 'ui.quality.dhu_trend_heading')}
          </SectionHeading>

          {/* Bars, not a line: a day nobody checked has NO DHU, and a line chart would
              interpolate straight through it and invent a number for a day the factory was
              shut. A missing bar is the honest rendering of a missing measurement. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              height: 150,
              padding: '0 2px',
              borderBottom: '1px solid var(--fx-border-default)',
            }}
          >
            {trend.map((day) => {
              const dhuOfDay = Number(day.dhu ?? 0)
              const over =
                day.dhu !== null &&
                policy.dhuAlertThreshold !== undefined &&
                dhuOfDay > Number(policy.dhuAlertThreshold)
              return (
                <div
                  key={day.date}
                  title={
                    day.dhu === null
                      ? tui(locale, 'ui.quality.day_nothing_checked', { date: day.date })
                      : tui(locale, 'ui.quality.day_dhu_title', {
                          date: day.date,
                          dhu: day.dhu,
                          defects: day.defects,
                          checked: day.checked,
                        })
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 4,
                    height: '100%',
                  }}
                >
                  <span
                    style={{
                      font: "400 10px/1 var(--fx-font-mono)",
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    {day.dhu ?? '—'}
                  </span>
                  <span
                    style={{
                      width: '100%',
                      height: day.dhu === null ? 0 : `${(dhuOfDay / worstDhu) * 100}%`,
                      minHeight: day.dhu === null ? 0 : 2,
                      background: over ? 'var(--fx-danger)' : 'var(--fx-accent)',
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {trend.map((day) => (
              <span
                key={day.date}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'center',
                  font: "400 9.5px/1 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {day.date.slice(8)}
              </span>
            ))}
          </div>
        </section>

        {pareto.length > 0 ? (
          <section>
            <SectionHeading
              eyebrow={
                causesTo80 > 0
                  ? tui(
                      locale,
                      causesTo80 === 1
                        ? 'ui.quality.pareto_causes_one'
                        : 'ui.quality.pareto_causes_other',
                      { count: causesTo80 },
                    )
                  : undefined
              }
            >
              {tui(locale, 'ui.quality.pareto_heading')}
            </SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pareto.slice(0, 8).map((slice, index) => (
                <div
                  key={slice.code}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 70px 90px',
                    gap: 14,
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-subtle)',
                    // The 80% line, drawn where it actually falls rather than after a fixed
                    // number of rows — the whole point is that the count is not always four.
                    borderLeft: `3px solid ${
                      index < causesTo80 ? 'var(--fx-accent)' : 'transparent'
                    }`,
                  }}
                >
                  <span style={{ minWidth: 0, font: "500 13.5px/1.3 var(--fx-font-sans)" }}>
                    {slice.label}
                    <span
                      style={{
                        marginLeft: 8,
                        font: "400 11px/1 var(--fx-font-mono)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {severityLabel(locale, slice.severity)}
                    </span>
                  </span>
                  <span
                    data-numeric
                    style={{ font: "600 14px/1 var(--fx-font-mono)", textAlign: 'right' }}
                  >
                    {slice.count}
                  </span>
                  <span
                    style={{
                      font: "400 12px/1 var(--fx-font-mono)",
                      color: 'var(--fx-text-tertiary)',
                      textAlign: 'right',
                    }}
                  >
                    {slice.cumulativePct}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {repeats.length > 0 ? (
          <section>
            <SectionHeading eyebrow={tui(locale, 'ui.quality.repeats_eyebrow')}>
              {tui(locale, 'ui.quality.repeats_heading')}
            </SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {repeats.map((run) => (
                <div
                  key={`${run.code}-${run.operation}-${run.to}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                    padding: '12px 16px',
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-subtle)',
                    borderLeft: '3px solid var(--fx-warning)',
                  }}
                >
                  <span style={{ font: "500 14px/1.3 var(--fx-font-sans)" }}>
                    {tui(locale, 'ui.quality.repeat_at', {
                      defect: runLabels.get(run.code)?.label ?? run.code,
                      operation: run.operation,
                    })}
                  </span>
                  <Badge tone="warning">
                    {tui(
                      locale,
                      run.days === 1 ? 'ui.quality.days_running_one' : 'ui.quality.days_running_other',
                      { count: run.days },
                    )}
                  </Badge>
                  <span
                    style={{
                      font: "400 12px/1.3 var(--fx-font-mono)",
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    {run.from} → {run.to}
                  </span>
                </div>
              ))}
            </div>
            <p
              style={{
                marginTop: 10,
                font: "400 12px/1.6 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {tui(locale, 'ui.quality.repeats_note')}
            </p>
          </section>
        ) : null}

        <section>
          <SectionHeading
            eyebrow={tui(locale, 'ui.quality.checks_eyebrow', {
              checks: activity.checks,
              devices: activity.fromDevice,
            })}
          >
            {tui(locale, 'ui.quality.dhu_by_line_heading')}
          </SectionHeading>

          {lines.length === 0 ? (
            <EmptyState
              title={tui(locale, 'ui.quality.lines_empty_title')}
              body={tui(locale, 'ui.quality.lines_empty_body')}
            />
          ) : (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.4fr 1fr 1fr 1fr',
                  gap: 12,
                  padding: '12px 20px',
                  background: 'var(--fx-bg-sunken)',
                  font: "500 12px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                <div>{tui(locale, 'ui.quality.col_line')}</div>
                <div>{tui(locale, 'ui.quality.col_dhu')}</div>
                <div style={{ textAlign: 'right' }}>{tui(locale, 'ui.quality.col_checked')}</div>
                <div style={{ textAlign: 'right' }}>{tui(locale, 'ui.quality.col_defects')}</div>
                <div style={{ textAlign: 'right' }}>{tui(locale, 'ui.quality.col_verdict')}</div>
              </div>

              {lines.map((line) => (
                <DhuRow
                  key={line.lineId}
                  locale={locale}
                  line={line}
                  threshold={policy.dhuAlertThreshold ?? null}
                />
              ))}

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {tui(locale, 'ui.quality.dhu_formula_note')}
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHeading
            eyebrow={tui(locale, 'ui.quality.recent_count', { count: inspections.length })}
          >
            {tui(locale, 'ui.quality.final_heading')}
          </SectionHeading>

          {inspections.length === 0 ? (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                padding: 22,
                font: "400 15px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              {tui(locale, 'ui.quality.final_none_note')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inspections.map((i) => (
                <InspectionCard key={i.id} locale={locale} inspection={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </FloorScreen>
  )
}

function DhuRow({
  locale,
  line,
  threshold,
}: {
  locale: Locale
  line: LineDhu
  threshold: string | null
}) {
  return (
    <div
      className="fx-selvage"
      data-status={
        line.dhu === null ? undefined : line.overThreshold ? 'late' : 'on-track'
      }
      style={{ borderTop: '1px solid var(--fx-border-subtle)' }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr 1fr 1fr 1fr',
          gap: 12,
          padding: '14px 20px',
          alignItems: 'center',
          minHeight: 'var(--fx-row-height)',
        }}
      >
        <span style={{ font: "600 17px/1.2 var(--fx-font-sans)" }}>{line.code}</span>

        {line.dhu === null ? (
          /* Absence, not zero. A line nobody checked is not a perfect line. */
          <span style={{ font: "400 15px/1.2 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {tui(locale, 'ui.quality.not_checked')}
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              data-numeric
              style={{
                font: "600 22px/1.1 var(--fx-font-mono)",
                color: line.overThreshold ? 'var(--fx-danger)' : 'var(--fx-text-primary)',
              }}
            >
              {line.dhu}
            </span>
            {threshold ? (
              <span
                data-numeric
                style={{ font: "400 12px/1.2 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
              >
                / {threshold}
              </span>
            ) : null}
          </span>
        )}

        <span
          data-numeric
          style={{
            font: "400 15px/1.2 var(--fx-font-mono)",
            textAlign: 'right',
            color: 'var(--fx-text-secondary)',
          }}
        >
          {line.checked}
        </span>
        <span
          data-numeric
          style={{
            font: "400 15px/1.2 var(--fx-font-mono)",
            textAlign: 'right',
            color: 'var(--fx-text-secondary)',
          }}
        >
          {line.defects}
        </span>

        <span style={{ textAlign: 'right' }}>
          {line.dhu === null ? (
            <Badge>{tui(locale, 'ui.quality.badge_no_data')}</Badge>
          ) : line.overThreshold ? (
            <Badge tone="danger">{tui(locale, 'ui.quality.badge_over')}</Badge>
          ) : (
            <Badge tone="success">{tui(locale, 'ui.quality.badge_within')}</Badge>
          )}
        </span>
      </div>
    </div>
  )
}

function InspectionCard({
  locale,
  inspection,
}: {
  locale: Locale
  inspection: FinalInspectionRow
}) {
  const failed = inspection.verdict === 'fail'

  return (
    <div
      className="fx-selvage"
      data-status={failed ? 'late' : inspection.status === 'closed' ? 'done' : 'on-track'}
      data-critical={inspection.criticalFound > 0 || undefined}
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
      }}
    >
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Ident size={14}>{inspection.inspectionNo}</Ident>
          <Badge>{inspection.standard}</Badge>
          <Badge tone={failed ? 'danger' : 'success'}>
            {verdictLabel(locale, inspection.verdict)}
          </Badge>
          <Badge>{inspectionStatus(locale, inspection.status)}</Badge>
          <span
            data-numeric
            style={{
              marginLeft: 'auto',
              font: "400 13px/1.3 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            {tui(locale, 'ui.quality.lot_sample', {
              lot: inspection.lotQty.toLocaleString(),
              sample: inspection.sampleSize,
            })}
          </span>
        </div>

        {/* Found against accept, side by side — the verdict is computed from the
            snapshotted plan, and this is the arithmetic it used. */}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Found
            locale={locale}
            label={severityLabel(locale, 'critical')}
            found={inspection.criticalFound}
            accept={0}
          />
          <Found
            locale={locale}
            label={severityLabel(locale, 'major')}
            found={inspection.majorFound}
            accept={inspection.majorAccept}
          />
          <Found
            locale={locale}
            label={severityLabel(locale, 'minor')}
            found={inspection.minorFound}
            accept={inspection.minorAccept}
          />
        </div>
      </div>
    </div>
  )
}

function Found({
  locale,
  label,
  found,
  accept,
}: {
  locale: Locale
  label: string
  found: number
  accept: number
}) {
  const over = found > accept

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        {label}
      </span>
      <span data-numeric style={{ font: "500 16px/1.2 var(--fx-font-mono)" }}>
        <span style={{ color: over ? 'var(--fx-danger)' : 'var(--fx-text-primary)' }}>{found}</span>
        <span style={{ color: 'var(--fx-text-tertiary)' }}>
          {' '}
          {tui(locale, 'ui.quality.allowed_suffix', { accept })}
        </span>
      </span>
    </span>
  )
}

function QualityLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 44,
        padding: '10px 14px',
        borderRadius: 'var(--fx-radius-md)',
        border: '1px solid var(--fx-border-default)',
        font: "500 13px/1 var(--fx-font-sans)",
        color: 'var(--fx-text-secondary)',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  )
}

/**
 * The three DB enums this screen renders as words: `defect_severity`,
 * `inspection_result` and `final_inspection_status`.
 *
 * Each falls back to the raw column value rather than to a missing key, so a fourth
 * value added to an enum without touching this screen reads wrong but readable — which
 * on a floor tablet is the safer failure.
 */
const SEVERITY_COPY: Record<string, string> = {
  critical: 'ui.quality.severity_critical',
  major: 'ui.quality.severity_major',
  minor: 'ui.quality.severity_minor',
}

const VERDICT_COPY: Record<string, string> = {
  pass: 'ui.quality.verdict_pass',
  fail: 'ui.quality.verdict_fail',
}

const INSPECTION_STATUS_COPY: Record<string, string> = {
  draft: 'ui.quality.status_draft',
  submitted: 'ui.quality.status_submitted',
  reinspection_required: 'ui.quality.status_reinspection_required',
  closed: 'ui.quality.status_closed',
}

function severityLabel(locale: Locale, severity: string): string {
  const key = SEVERITY_COPY[severity]
  return key ? tui(locale, key) : severity
}

function verdictLabel(locale: Locale, verdict: string): string {
  const key = VERDICT_COPY[verdict]
  return key ? tui(locale, key) : verdict
}

function inspectionStatus(locale: Locale, status: string): string {
  const key = INSPECTION_STATUS_COPY[status]
  return key ? tui(locale, key) : status.replace(/_/g, ' ')
}
