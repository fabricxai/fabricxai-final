'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { recordMeasuredPieces } from '@/modules/quality/actions'

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
  const measured = Number.parseFloat(raw)
  if (!raw.trim() || Number.isNaN(measured)) return 'empty'
  const deviation = measured - Number.parseFloat(point.spec)
  if (deviation > Number.parseFloat(point.tolPlus)) return 'over'
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
  const [pending, startTransition] = useTransition()

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

  function save() {
    if (!subject?.specId || filledPieces.length === 0) return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await recordMeasuredPieces({
          measurementSpecId: subject.specId!,
          orderId: subject.orderId,
          sampledSize: size,
          // Blank cells are dropped rather than sent as zero. The server records them as
          // MISSING points, which is the truth — an unmeasured point is not a good one, and
          // a zero would read as a garment measuring nothing at the chest.
          pieces: filledPieces.map((piece) =>
            Object.fromEntries(Object.entries(piece).filter(([, v]) => v.trim() !== '')),
          ),
        })

        // Named separately — see the note on the action. "Out of tolerance" and
        // "not fully measured" are different findings and lead to different actions.
        const parts = [`${result.pieces} ${result.pieces === 1 ? 'piece' : 'pieces'} recorded`]
        if (result.outOfTolerance > 0) parts.push(`${result.outOfTolerance} out of tolerance`)
        if (result.incomplete > 0) parts.push(`${result.incomplete} not fully measured`)
        if (result.failed === 0) parts.push('all within spec')

        setNoted(`${size} · ${parts.join(' · ')}`)
        setSubject(null)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The measurements were not saved.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
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
            eyebrow={`${subject.styleCode} · chart v${subject.specVersion} · ${subject.unit}`}
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
                  {['Point of measure', 'Spec', 'Tol ±', ...Array.from({ length: PIECES }, (_, i) => `Pc ${i + 1}`)].map(
                    (heading) => (
                      <th
                        key={heading}
                        style={{
                          textAlign: heading === 'Point of measure' ? 'left' : 'right',
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
                            aria-label={`${point.name} piece ${piece + 1}`}
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
              {partPieces === 1 ? 'One piece has' : `${partPieces} pieces have`} some points
              unmeasured. Those checks file as failed — an unmeasured point is not a good one,
              and a partial check is not a clean one.
            </InlineAlert>
          ) : null}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
            >
              {filledPieces.length === 0
                ? 'a blank cell is filed as unmeasured, never as zero'
                : `${filledPieces.length} of ${PIECES} pieces have readings · each files its own check`}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={() => setSubject(null)}>
                Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={filledPieces.length === 0 || pending}
                onClick={save}
              >
                {pending ? 'Saving…' : 'Save measurements'}
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
