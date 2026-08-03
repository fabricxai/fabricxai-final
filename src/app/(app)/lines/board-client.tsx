'use client'

import { useState } from 'react'

import { Card } from '@/components/fx/data'
import { FloorScreen, NumpadInput, RejectedWrites, SyncPill } from '@/components/fx/floor'
import { Button } from '@/components/fx/primitives'
import { Eyebrow } from '@/components/fx/signature'
import { Modal } from '@/components/fx/feedback'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'
import type { LineRow } from '@/modules/production/queries'

/**
 * The hourly board.
 *
 * Entry is offline-first: tapping Save writes to IndexedDB and returns
 * immediately. What the operator did is recorded the moment they did it; posting
 * it is the system's problem. The pill is the only honest signal of what has
 * actually reached the server.
 */
export function LineBoard({
  rows,
  lines,
  producedOn,
  shiftHours,
}: {
  rows: LineRow[]
  lines: { id: string; code: string; name: string }[]
  producedOn: string
  shiftHours: number
}) {
  const { online, queued, refused, syncing, capture, sync, clear } = useOfflineQueue()
  const [entry, setEntry] = useState<{ line: LineRow; hour: number } | null>(null)

  const hourSlots = Array.from({ length: shiftHours }, (_, i) => i + 8)

  return (
    <FloorScreen>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />
          <span style={{ font: "400 14px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            entries are saved on this tablet first, then sent
          </span>
        </div>

        <RejectedWrites refused={refused} onDismiss={(k) => void clear(k)} />

        <Card padding={0}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 860 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `120px repeat(${hourSlots.length}, 1fr) 120px`,
                  gap: 8,
                  padding: '12px 18px',
                  background: 'var(--fx-bg-sunken)',
                  font: "500 12px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                <div>Line</div>
                {hourSlots.map((h) => (
                  <div key={h} style={{ textAlign: 'center' }}>
                    {h}:00
                  </div>
                ))}
                <div style={{ textAlign: 'right' }}>Day</div>
              </div>

              {rows.map((row) => (
                <div
                  key={row.lineId}
                  className="fx-selvage"
                  data-status={
                    row.target === 0 ? undefined : row.variance < 0 ? 'at-risk' : 'on-track'
                  }
                  style={{ borderTop: '1px solid var(--fx-border-subtle)' }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: `120px repeat(${hourSlots.length}, 1fr) 120px`,
                      gap: 8,
                      padding: '10px 18px',
                      alignItems: 'center',
                      minHeight: 'var(--fx-row-height)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ font: "600 17px/1.2 var(--fx-font-sans)" }}>{row.code}</span>
                      {row.openDowntime ? (
                        <span
                          style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-danger)' }}
                        >
                          stopped · {row.openDowntime.reason}
                        </span>
                      ) : null}
                    </div>

                    {hourSlots.map((h) => {
                      const cell = row.hours.find((c) => c.hourSlot === h)
                      return (
                        <button
                          key={h}
                          onClick={() => setEntry({ line: row, hour: h })}
                          style={{
                            minHeight: 48,
                            borderRadius: 'var(--fx-radius-sm)',
                            border: '1px solid var(--fx-border-subtle)',
                            background: cell ? 'var(--fx-bg-surface)' : 'var(--fx-bg-sunken)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                          }}
                        >
                          {cell ? (
                            <>
                              <span
                                data-numeric
                                style={{
                                  font: "600 17px/1 var(--fx-font-mono)",
                                  color:
                                    cell.actual < cell.target
                                      ? 'var(--fx-warning)'
                                      : 'var(--fx-text-primary)',
                                }}
                              >
                                {cell.actual}
                              </span>
                              <span
                                data-numeric
                                style={{
                                  font: "400 11px/1 var(--fx-font-mono)",
                                  color: 'var(--fx-text-tertiary)',
                                }}
                              >
                                /{cell.target}
                              </span>
                            </>
                          ) : (
                            /* Empty, not zero: nobody has said what happened
                               this hour, and a zero would say they made none. */
                            <span
                              style={{ font: "400 15px/1 var(--fx-font-mono)", color: 'var(--fx-text-disabled)' }}
                            >
                              —
                            </span>
                          )}
                        </button>
                      )
                    })}

                    <div
                      style={{
                        textAlign: 'right',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span data-numeric style={{ font: "600 18px/1.1 var(--fx-font-mono)" }}>
                        {row.actual}
                      </span>
                      <span
                        data-numeric
                        style={{
                          font: "400 12px/1.2 var(--fx-font-mono)",
                          color:
                            row.variance < 0
                              ? 'var(--fx-warning)'
                              : row.variance > 0
                                ? 'var(--fx-success)'
                                : 'var(--fx-text-tertiary)',
                        }}
                      >
                        {row.target === 0
                          ? 'no target'
                          : `${row.variance >= 0 ? '+' : ''}${row.variance} · ${row.achievedPct}%`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--fx-border-subtle)',
              font: "400 13px/1.4 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            an empty hour is an hour nobody has counted — it is never read as zero output
          </div>
        </Card>
      </div>

      <HourEntry
        key={entry ? `${entry.line.lineId}-${entry.hour}` : 'none'}
        entry={entry}
        producedOn={producedOn}
        onClose={() => setEntry(null)}
        onSave={async (target, actual) => {
          if (!entry) return
          await capture({
            moduleId: 'production',
            operation: 'record_hourly_outputs',
            payload: {
              entries: [
                {
                  lineId: entry.line.lineId,
                  producedOn,
                  hourSlot: entry.hour,
                  target: Number(target),
                  actual: Number(actual),
                },
              ],
            },
          })
          setEntry(null)
        }}
      />

      {lines.length === 0 ? null : null}
    </FloorScreen>
  )
}

function HourEntry({
  entry,
  producedOn,
  onClose,
  onSave,
}: {
  entry: { line: LineRow; hour: number } | null
  producedOn: string
  onClose: () => void
  onSave: (target: string, actual: string) => Promise<void>
}) {
  const existing = entry?.line.hours.find((c) => c.hourSlot === entry.hour)
  const [target, setTarget] = useState(existing ? String(existing.target) : '')
  const [actual, setActual] = useState(existing ? String(existing.actual) : '')
  const [busy, setBusy] = useState(false)

  if (!entry) return null

  const valid = /^\d+$/.test(target.trim()) && /^\d+$/.test(actual.trim())

  return (
    <Modal
      open
      onClose={onClose}
      width={420}
      title={`${entry.line.code} · ${entry.hour}:00`}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(target.trim(), actual.trim())
              } finally {
                setBusy(false)
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Eyebrow>{producedOn}</Eyebrow>
        <NumpadInput label="Target this hour" value={target} onChange={setTarget} unit="pcs" autoFocus />
        <NumpadInput label="Actually made" value={actual} onChange={setActual} unit="pcs" />
        <span style={{ font: "400 13px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}>
          Saved on this tablet straight away. It goes to the office when there is a network.
        </span>
      </div>
    </Modal>
  )
}
