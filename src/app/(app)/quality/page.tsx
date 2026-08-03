import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
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

  const policy = await getPolicy<QualityPolicy>(ctx, 'quality')
  const today = new Date().toISOString().slice(0, 10)

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
        eyebrow={`Quality · ${today}`}
        title={lines.length === 0 ? 'No lines' : `${lines.length} lines`}
        meta={
          over.length > 0
            ? `${over.length} ${over.length === 1 ? 'line' : 'lines'} above ${policy.dhuAlertThreshold} DHU`
            : undefined
        }
        ownsAmber
      />

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <QualityLink href="/quality/inline">Walk a line</QualityLink>
        <QualityLink href="/quality/fabric">Fabric inspection</QualityLink>
        <QualityLink href="/quality/final">Final inspection</QualityLink>
        <QualityLink href="/quality/measurements">Measurements</QualityLink>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        {/* Not checking is a different problem from checking badly, and the one
            more likely to go unnoticed — so it gets its own line. */}
        {unchecked.length > 0 && lines.length > 0 ? (
          <InlineAlert tone="warning">
            {unchecked.length} of {lines.length} lines have no inline check today. Those lines have
            no DHU — which is not the same as a DHU of zero.
          </InlineAlert>
        ) : null}

        {failed.length > 0 ? (
          <InlineAlert tone="danger">
            {failed.length} final {failed.length === 1 ? 'inspection has' : 'inspections have'}{' '}
            failed. A failed lot does not ship until it is re-inspected.
          </InlineAlert>
        ) : null}

        {/* ── Where quality is costing us (canvas P5) ─────────────────── */}
        <section>
          <SectionHeading
            eyebrow={
              periodDhu
                ? `${periodDhu}% average · target ${policy.dhuAlertThreshold ?? '—'}%`
                : 'nothing checked in the last fortnight'
            }
          >
            DHU · 14 days, all lines
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
                      ? `${day.date} · nothing checked`
                      : `${day.date} · ${day.dhu} DHU · ${day.defects} of ${day.checked}`
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
                  ? `80% sits in ${causesTo80} ${causesTo80 === 1 ? 'cause' : 'causes'}`
                  : undefined
              }
            >
              Defect pareto
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
                      {slice.severity}
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
            <SectionHeading eyebrow="same defect, same station, days running">
              Repeats worth a conversation
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
                    {runLabels.get(run.code)?.label ?? run.code} at {run.operation}
                  </span>
                  <Badge tone="warning">{run.days} days running</Badge>
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
              One of these is a slip. The same one for days at the same station is a machine
              out of adjustment or an operator nobody trained — both fixable, and neither
              visible in a daily DHU that stays under target the whole time.
            </p>
          </section>
        ) : null}

        <section>
          <SectionHeading
            eyebrow={`${activity.checks} checks · ${activity.fromDevice} from a device`}
          >
            DHU by line
          </SectionHeading>

          {lines.length === 0 ? (
            <EmptyState
              title="No lines to check"
              body="Lines are set up on the planning board. Inline checks are captured on the floor and count toward each line's DHU for the day."
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
                <div>Line</div>
                <div>DHU</div>
                <div style={{ textAlign: 'right' }}>Checked</div>
                <div style={{ textAlign: 'right' }}>Defects</div>
                <div style={{ textAlign: 'right' }}>Verdict</div>
              </div>

              {lines.map((line) => (
                <DhuRow key={line.lineId} line={line} threshold={policy.dhuAlertThreshold ?? null} />
              ))}

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                DHU = defects ÷ garments checked × 100 · a ratio is never shown without what it
                was measured on
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHeading eyebrow={`${inspections.length} recent`}>Final inspections</SectionHeading>

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
              No final inspections yet. The AQL plan comes from the standard table and is
              snapshotted onto the inspection, so a lot is judged by the plan in force when it
              was inspected.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inspections.map((i) => (
                <InspectionCard key={i.id} inspection={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </FloorScreen>
  )
}

function DhuRow({ line, threshold }: { line: LineDhu; threshold: string | null }) {
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
            not checked
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
            <Badge>no data</Badge>
          ) : line.overThreshold ? (
            <Badge tone="danger">over</Badge>
          ) : (
            <Badge tone="success">within</Badge>
          )}
        </span>
      </div>
    </div>
  )
}

function InspectionCard({ inspection }: { inspection: FinalInspectionRow }) {
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
          <Badge tone={failed ? 'danger' : 'success'}>{inspection.verdict}</Badge>
          <Badge>{inspection.status.replace(/_/g, ' ')}</Badge>
          <span
            data-numeric
            style={{
              marginLeft: 'auto',
              font: "400 13px/1.3 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            lot {inspection.lotQty.toLocaleString()} · sample {inspection.sampleSize}
          </span>
        </div>

        {/* Found against accept, side by side — the verdict is computed from the
            snapshotted plan, and this is the arithmetic it used. */}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Found label="Critical" found={inspection.criticalFound} accept={0} />
          <Found label="Major" found={inspection.majorFound} accept={inspection.majorAccept} />
          <Found label="Minor" found={inspection.minorFound} accept={inspection.minorAccept} />
        </div>
      </div>
    </div>
  )
}

function Found({ label, found, accept }: { label: string; found: number; accept: number }) {
  const over = found > accept

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        {label}
      </span>
      <span data-numeric style={{ font: "500 16px/1.2 var(--fx-font-mono)" }}>
        <span style={{ color: over ? 'var(--fx-danger)' : 'var(--fx-text-primary)' }}>{found}</span>
        <span style={{ color: 'var(--fx-text-tertiary)' }}> / {accept} allowed</span>
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
