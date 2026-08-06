'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { useLocale, useT } from '@/components/fx/locale'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { SyncPill } from '@/components/fx/floor'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'

interface SpecPoint {
  name: string
  spec: string
  tolPlus: string
  tolMinus: string
}

interface Subject {
  orderId: string
  poNumber: string | null
  buyerName: string | null
  styleCode: string | null
  specId: string | null
  specVersion: number | null
  unit: string
  points: SpecPoint[]
  measured: { size: string; pieces: number; failed: number }[]
}

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const
const PIECES = 3

/** Cell state, purely for the operator's benefit — the server decides the verdict. */
type CellState = 'empty' | 'in' | 'over' | 'under'

function cellState(point: SpecPoint, raw: string): CellState {
  // Not `value` — the money-name heuristic reads that stem and is right to. This is a
  // measurement in centimetres.
  // eslint-disable-next-line fabricxai/no-float-money -- half-typed tape measurement in cm for the live cell hint; the server re-derives every deviation from the stored chart
  const measured = Number.parseFloat(raw)
  if (!raw.trim() || Number.isNaN(measured)) return 'empty'
  // eslint-disable-next-line fabricxai/no-float-money -- spec point in cm for the same hint colour, never sent as a result
  const deviation = measured - Number.parseFloat(point.spec)
  // eslint-disable-next-line fabricxai/no-float-money -- plus-tolerance in cm for the same hint colour, never sent as a result
  if (deviation > Number.parseFloat(point.tolPlus)) return 'over'
  // eslint-disable-next-line fabricxai/no-float-money -- minus-tolerance in cm for the same hint colour, never sent as a result
  if (-deviation > Number.parseFloat(point.tolMinus)) return 'under'
  return 'in'
}

const STATE_COLOUR: Record<CellState, string | undefined> = {
  empty: undefined,
  in: 'var(--fx-success)',
  over: 'var(--fx-danger)',
  under: 'var(--fx-danger)',
}

/**
 * The points-of-measure table.
 *
 * The colour on a cell is a HINT, computed here so the QC sees a problem while the tape is
 * still on the garment. It is not the verdict: the server re-derives every deviation from
 * the stored chart version and writes what it found. If the two ever disagree the server is
 * right, and this file is a bug — which is why nothing here is sent as a result.
 */
export function MeasurementsClient({ subjects }: { subjects: readonly Subject[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [size, setSize] = useState<string>('L')
  // [pieceIndex][pointName] — the grid exactly as the canvas draws it.
  const [grid, setGrid] = useState<Record<string, string>[]>([])
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function open(next: Subject) {
    setSubject(next)
    setSize('L')
    setGrid(Array.from({ length: PIECES }, () => ({})))
    setFailure(null)
  }

  const filledPieces = grid.filter((piece) => Object.values(piece).some((v) => v.trim() !== ''))

  // A piece with any reading but not all of them files as FAILED, because an unmeasured
  // point is not a good point. Said before the save rather than discovered afterwards — a
  // QC who stops halfway should know the check will be filed against the garment.
  const pointCount = subject?.points.length ?? 0
  const partPieces = filledPieces.filter(
    (piece) => Object.values(piece).filter((v) => v.trim() !== '').length < pointCount,
  ).length

  /**
   * Queue the size (plan 4.1, audit FE-H5).
   *
   * This screen used to post straight to a server action, with no written reason — unlike
   * `quality/fabric`, which is a fixed frame in the store and says so. Measurements are
   * taken at a table with a tape and a printed chart, often in a corner of the finishing
   * floor, and losing the network there lost the readings.
   *
   * The whole size goes as ONE queued write, which is also what made it atomic: the server
   * validates every piece before writing any, so a bad value cannot leave a half-measured
   * size that reads as a completed check.
   *
   * The summary below is built from the CELL HINTS, not from a verdict. The hints already
   * exist — they colour the cells while the tape is still on the garment — and the file's
   * standing rule applies: the server re-derives every deviation from the stored chart, and
   * if the two disagree the server is right. So this says what it looks like here, and the
   * list refreshes with what was actually filed once the write lands.
   */
  function save() {
    if (!subject?.specId || filledPieces.length === 0) return
    setFailure(null)

    const points = subject.points
    const looksOut = filledPieces.filter((piece) =>
      points.some((point) => {
        const state = cellState(point, piece[point.name] ?? '')
        return state === 'over' || state === 'under'
      }),
    ).length

    startTransition(async () => {
      try {
        await capture({
          moduleId: 'quality',
          operation: 'measurement_set',
          payload: {
            measurementSpecId: subject.specId!,
            orderId: subject.orderId,
            sampledSize: size,
            // Blank cells are dropped rather than sent as zero. The server records them as
            // MISSING points, which is the truth — an unmeasured point is not a good one, and
            // a zero would read as a garment measuring nothing at the chest.
            pieces: filledPieces.map((piece) =>
              Object.fromEntries(Object.entries(piece).filter(([, v]) => v.trim() !== '')),
            ),
          },
        })

        // Named separately — see the note on the action. "Looks out of spec" and
        // "not fully measured" are different findings and lead to different actions.
        const parts = [t.plural('ui.quality.pieces_recorded', filledPieces.length)]
        if (looksOut > 0) parts.push(t('ui.quality.looks_out_of_spec', { count: looksOut }))
        if (partPieces > 0) {
          parts.push(t('ui.quality.not_fully_measured', { count: partPieces }))
        }
        if (looksOut === 0 && partPieces === 0) parts.push(t('ui.quality.all_within_spec'))

        setNoted(t('ui.quality.measure_queued', { size, summary: parts.join(' · ') }))
        setSubject(null)
        if (online) await sync()
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, t('ui.quality.measure_not_saved'), locale))
      }
    })
  }

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
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {subject?.specId ? (
        <section
          style={{
            border: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-surface)',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <SectionHeading
            eyebrow={t('ui.quality.measure_chart_eyebrow', {
              style: subject.styleCode,
              version: subject.specVersion,
              unit: subject.unit,
            })}
          >
            Points of measure · size {size} · {PIECES} pieces
          </SectionHeading>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SIZES.map((s) => {
              const on = s === size
              return (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  style={{
                    minHeight: 44,
                    minWidth: 56,
                    padding: '8px 14px',
                    borderRadius: 'var(--fx-radius-md)',
                    border: `1px solid ${on ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                    background: on ? 'var(--fx-text-primary)' : 'transparent',
                    color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                    cursor: 'pointer',
                    font: "500 13px/1 var(--fx-font-sans)",
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {/* Scrolls inside itself rather than pushing the page wide — a tape-and-tablet
              screen must never scroll horizontally as a whole. */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  {[
                    { key: 'point', label: t('ui.quality.col_point') },
                    { key: 'spec', label: t('ui.quality.col_spec') },
                    { key: 'tol', label: t('ui.quality.col_tolerance') },
                    ...Array.from({ length: PIECES }, (_, i) => ({
                      key: `pc-${i + 1}`,
                      label: t('ui.quality.col_piece', { n: i + 1 }),
                    })),
                  ].map(
                    ({ key, label: heading }) => (
                      <th
                        key={key}
                        style={{
                          // Keyed off the column identity, not its text: comparing against
                          // the English heading silently right-aligned the first column the
                          // moment it was translated.
                          textAlign: key === 'point' ? 'left' : 'right',
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--fx-border-default)',
                          font: "400 10.5px/1 var(--fx-font-mono)",
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: 'var(--fx-text-tertiary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {subject.points.map((point) => (
                  <tr key={point.name}>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--fx-border-subtle)',
                        font: "400 13.5px/1.3 var(--fx-font-sans)",
                      }}
                    >
                      {point.name}
                    </td>
                    <td style={numericCell}>{point.spec}</td>
                    <td style={{ ...numericCell, color: 'var(--fx-text-tertiary)' }}>
                      {/* Both halves, always. Collapsing +1.0/−0.5 to one number is the
                          bug this column exists to prevent. */}
                      +{point.tolPlus} / −{point.tolMinus}
                    </td>
                    {Array.from({ length: PIECES }, (_, piece) => {
                      const raw = grid[piece]?.[point.name] ?? ''
                      const state = cellState(point, raw)
                      return (
                        <td
                          key={piece}
                          style={{
                            padding: '4px 8px',
                            borderBottom: '1px solid var(--fx-border-subtle)',
                            textAlign: 'right',
                          }}
                        >
                          <input
                            inputMode="decimal"
                            aria-label={t('ui.quality.cell_aria', {
                              point: point.name,
                              n: piece + 1,
                            })}
                            value={raw}
                            onChange={(e) =>
                              setGrid((g) =>
                                g.map((row, i) =>
                                  i === piece ? { ...row, [point.name]: e.target.value } : row,
                                ),
                              )
                            }
                            style={{
                              width: 84,
                              minHeight: 40,
                              padding: '6px 10px',
                              textAlign: 'right',
                              border: `1px solid ${STATE_COLOUR[state] ?? 'var(--fx-border-default)'}`,
                              borderRadius: 'var(--fx-radius-sm)',
                              background: 'var(--fx-bg-surface)',
                              color: STATE_COLOUR[state] ?? 'var(--fx-text-primary)',
                              font: "500 14px/1 var(--fx-font-mono)",
                            }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {partPieces > 0 ? (
            <InlineAlert tone="warning">
              {t.plural('ui.quality.part_measured', partPieces)}
            </InlineAlert>
          ) : null}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
            >
              {filledPieces.length === 0
                ? t('ui.quality.blank_cell_note')
                : t('ui.quality.pieces_with_readings', {
                    count: filledPieces.length,
                    total: PIECES,
                  })}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={() => setSubject(null)}>
                {t('ui.boundary.not_found_back')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={filledPieces.length === 0 || pending}
                onClick={save}
              >
                {pending ? t('ui.common.saving') : t('ui.quality.save_measurements')}
              </Button>
            </span>
          </div>
        </section>
      ) : null}

      {/* ── The orders ───────────────────────────────────────────────────── */}
      {subjects.map((s) => (
        <div
          key={s.orderId}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 200px minmax(0, 1fr) 170px',
            gap: 14,
            alignItems: 'center',
            padding: '14px 18px',
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-subtle)',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ font: "600 15px/1.2 var(--fx-font-sans)" }}>
              {s.poNumber ?? s.orderId.slice(0, 8)}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 3,
                font: "400 12px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {s.buyerName ?? 'no buyer'}
              {s.styleCode ? ` · ${s.styleCode}` : ''}
            </span>
          </span>

          <span
            style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
          >
            {s.specId
              ? `chart v${s.specVersion} · ${s.points.length} points`
              : 'no chart for this style'}
          </span>

          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            {s.measured.length === 0 ? (
              <span
                style={{
                  font: "400 12px/1.3 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                nothing measured yet
              </span>
            ) : (
              s.measured.map((m) => (
                <Badge key={m.size} tone={m.failed > 0 ? 'danger' : 'success'}>
                  {m.size} · {m.pieces - m.failed}/{m.pieces} in spec
                </Badge>
              ))
            )}
          </span>

          <span style={{ textAlign: 'right' }}>
            <Button variant="ghost" disabled={!s.specId} onClick={() => open(s)}>
              Measure
            </Button>
          </span>
        </div>
      ))}
    </div>
  )
}

const numericCell: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--fx-border-subtle)',
  textAlign: 'right',
  font: "400 13px/1.3 var(--fx-font-mono)",
  whiteSpace: 'nowrap',
}
