'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { NumpadInput } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { recordFabricInspection } from '@/modules/quality/actions'

interface Roll {
  rollId: string
  rollNo: string
  lot: string | null
  shadeGroup: string | null
  qty: string
  unit: string
  itemName: string
  result: 'pass' | 'fail' | null
  pointsPer100SqYd: string | null
  inheritedFromGrn: boolean
}

interface Grn {
  grnId: string
  challanNo: string
  receivedAt: string
  inspectionStatus: string
  rolls: Roll[]
  uninspected: number
  failed: number
}

/** The four penalty bands. A band-3 fault is worth 3 points, and so on. */
const BANDS = [
  { key: '1', label: '1 pt', hint: 'up to 3 inches' },
  { key: '2', label: '2 pt', hint: '3 to 6 inches' },
  { key: '3', label: '3 pt', hint: '6 to 9 inches' },
  { key: '4', label: '4 pt', hint: 'over 9 inches, or a hole' },
] as const

type Bands = Record<string, string>

const EMPTY_BANDS: Bands = { '1': '', '2': '', '3': '', '4': '' }

/**
 * Grading a roll at the inspection frame.
 *
 * The screen previews the arithmetic — total points, the rate per hundred square yards, and
 * which side of the threshold it lands — but the preview is **not** what gets saved. The
 * server recomputes all of it from the band counts and the factory's own threshold, and its
 * answer is the one written. A client that could decide a verdict is a client that can be
 * asked to decide a convenient one, and 4-point results end up in claims against mills.
 */
export function FabricClient({
  grns,
  threshold,
  mandatory,
}: {
  grns: readonly Grn[]
  threshold: string
  mandatory: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [openGrn, setOpenGrn] = useState<string | null>(
    grns.find((g) => g.uninspected > 0)?.grnId ?? null,
  )
  const [grading, setGrading] = useState<{ grn: Grn; roll: Roll } | null>(null)
  const [bands, setBands] = useState<Bands>(EMPTY_BANDS)
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // eslint-disable-next-line fabricxai/no-float-money -- keypad defect-band tallies for the live 4-point preview, counts not money; NaN falls back to 0
  const counts = BANDS.map((b) => Number.parseInt(bands[b.key] ?? '', 10) || 0)
  const penaltyPoints = counts.reduce((sum, n, i) => sum + n * (i + 1), 0)
  // eslint-disable-next-line fabricxai/no-float-money -- keypad roll length in yards for the same preview; the server re-derives the stored grade
  const lengthYards = Number.parseFloat(length) || 0
  // eslint-disable-next-line fabricxai/no-float-money -- keypad fabric width in inches for the same preview; the server re-derives the stored grade
  const widthInches = Number.parseFloat(width) || 0
  // points / (length yd × width in ÷ 36) × 100 — the standard normalisation to 100 yd².
  const squareYards = lengthYards > 0 && widthInches > 0 ? (lengthYards * widthInches) / 36 : 0
  const per100SqYd = squareYards > 0 ? (penaltyPoints * 100) / squareYards : null
  const wouldPass = per100SqYd === null ? null : per100SqYd <= Number(threshold)

  const valid = lengthYards > 0 && widthInches > 0

  function startGrading(grn: Grn, roll: Roll) {
    setGrading({ grn, roll })
    setBands(EMPTY_BANDS)
    setLength(roll.unit.toLowerCase().startsWith('y') ? roll.qty : '')
    setWidth('')
    setFailure(null)
  }

  function save() {
    if (!grading || !valid) return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await recordFabricInspection({
          grnId: grading.grn.grnId,
          rollId: grading.roll.rollId,
          points4: {
            1: counts[0]!,
            2: counts[1]!,
            3: counts[2]!,
            4: counts[3]!,
          },
          inspectedLengthYards: lengthYards.toFixed(2),
          widthInches: widthInches.toFixed(2),
        })

        setNoted(
          `${grading.roll.rollNo} · ${result.pointsPer100SqYd} points/100 yd² · ${result.result}`,
        )
        setGrading(null)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The inspection was not saved.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {noted ? <InlineAlert tone="success">Recorded {noted}.</InlineAlert> : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {mandatory ? (
        <InlineAlert tone="info">
          Woven fabric must be graded before the store may issue it. A roll with no result
          here is a roll production cannot have — that gate is server-side, not a reminder.
        </InlineAlert>
      ) : null}

      {/* ── Grading one roll ─────────────────────────────────────────────── */}
      {grading ? (
        <section
          style={{
            border: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-surface)',
            padding: '22px 24px',
          }}
        >
          <SectionHeading eyebrow={`challan ${grading.grn.challanNo}`}>
            Roll {grading.roll.rollNo} · {grading.roll.itemName}
          </SectionHeading>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14,
              marginTop: 16,
            }}
          >
            {BANDS.map((band) => (
              <label key={band.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <NumpadInput
                  label={band.label}
                  value={bands[band.key] ?? ''}
                  onChange={(v) => setBands((b) => ({ ...b, [band.key]: v }))}
                />
                <span
                  style={{
                    font: "400 11px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  {band.hint}
                </span>
              </label>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14,
              marginTop: 18,
            }}
          >
            <NumpadInput label="Length inspected (yd)" value={length} onChange={setLength} />
            <NumpadInput label="Width (in)" value={width} onChange={setWidth} />
          </div>

          {/* ── The arithmetic, shown rather than trusted ───────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 1,
              marginTop: 20,
              background: 'var(--fx-border-subtle)',
              border: '1px solid var(--fx-border-subtle)',
            }}
          >
            {[
              { label: 'Penalty points', value: String(penaltyPoints) },
              {
                label: 'Points / 100 yd²',
                value: per100SqYd === null ? '—' : per100SqYd.toFixed(2),
                tone: wouldPass === false ? 'var(--fx-danger)' : undefined,
              },
              { label: 'Threshold', value: `≤ ${threshold}` },
              {
                label: 'Would be',
                value: wouldPass === null ? '—' : wouldPass ? 'pass' : 'fail',
                tone: wouldPass === false ? 'var(--fx-danger)' : undefined,
              },
            ].map((cell) => (
              <div
                key={cell.label}
                style={{ background: 'var(--fx-bg-surface)', padding: '14px 16px' }}
              >
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
                    font: "600 24px/1.1 var(--fx-font-sans)",
                    color: cell.tone ?? 'var(--fx-text-primary)',
                  }}
                >
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          <p
            style={{
              marginTop: 12,
              font: "400 12px/1.5 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            The same faults pass on a wide roll and fail on a narrow one — that is why width
            is asked for and why this is a rate rather than a count. The server recomputes
            all of it; what is shown here is a preview, not the verdict.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
            <Button variant="primary" size="lg" disabled={!valid || pending} onClick={save}>
              {pending ? 'Recording…' : 'Record the result'}
            </Button>
            <Button variant="ghost" onClick={() => setGrading(null)}>
              Back
            </Button>
            {!valid ? (
              <span
                style={{
                  font: "400 12px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                length and width are needed before a rate exists
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── The deliveries ───────────────────────────────────────────────── */}
      {grns.map((grn) => {
        const open = grn.grnId === openGrn
        return (
          <section key={grn.grnId}>
            <button
              onClick={() => setOpenGrn(open ? null : grn.grnId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                minHeight: 56,
                padding: '12px 18px',
                border: '1px solid var(--fx-border-default)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                font: "500 15px/1.3 var(--fx-font-sans)",
              }}
            >
              <span>Challan {grn.challanNo}</span>
              <span
                style={{
                  font: "400 12px/1.3 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                received {grn.receivedAt} · {grn.rolls.length} rolls
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {grn.failed > 0 ? <Badge tone="danger">{grn.failed} failed</Badge> : null}
                {grn.uninspected > 0 ? (
                  <Badge tone="warning">{grn.uninspected} not graded</Badge>
                ) : (
                  <Badge tone="success">graded</Badge>
                )}
              </span>
            </button>

            {open ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                {grn.rolls.map((roll) => (
                  <div
                    key={roll.rollId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px minmax(0, 1fr) 150px 160px',
                      gap: 14,
                      alignItems: 'center',
                      padding: '10px 18px',
                      border: '1px solid var(--fx-border-subtle)',
                      background: 'var(--fx-bg-surface)',
                    }}
                  >
                    <span style={{ font: "600 14px/1.2 var(--fx-font-sans)" }}>{roll.rollNo}</span>
                    <span
                      style={{
                        font: "400 12.5px/1.3 var(--fx-font-mono)",
                        color: 'var(--fx-text-tertiary)',
                        minWidth: 0,
                      }}
                    >
                      {roll.qty} {roll.unit}
                      {roll.lot ? ` · lot ${roll.lot}` : ''}
                      {roll.shadeGroup ? ` · shade ${roll.shadeGroup}` : ''}
                    </span>
                    <span>
                      {roll.result === null ? (
                        <Badge tone="warning">not graded</Badge>
                      ) : (
                        <span
                          style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}
                        >
                          <Badge tone={roll.result === 'pass' ? 'success' : 'danger'}>
                            {roll.result} · {roll.pointsPer100SqYd}
                          </Badge>
                          {/* Says whose verdict it is. "This roll passed" and "the delivery
                              it came in on passed" are different degrees of assurance. */}
                          {roll.inheritedFromGrn ? (
                            <span
                              style={{
                                font: "400 10.5px/1.2 var(--fx-font-mono)",
                                color: 'var(--fx-text-tertiary)',
                              }}
                            >
                              from the consignment sheet
                            </span>
                          ) : null}
                        </span>
                      )}
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <Button variant="ghost" onClick={() => startGrading(grn, roll)}>
                        {roll.result === null ? 'Grade this roll' : 'Re-grade'}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
