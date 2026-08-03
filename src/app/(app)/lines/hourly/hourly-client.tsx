'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineAlert, Modal } from '@/components/fx/feedback'
import { NumpadInput, SyncPill } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'

interface LineRow {
  lineId: string
  code: string
  name: string
  target: number
  orderId: string | null
  alreadyEntered: boolean
}

interface Stoppage {
  id: string
  lineId: string
  lineCode: string
  reason: string
  note: string | null
  startedAt: string
}

const REASONS = [
  { code: 'machine', label: 'Machine — raises a maintenance ticket' },
  { code: 'feeding', label: 'Feeding — no work at the line' },
  { code: 'absent', label: 'Absent — operators short' },
  { code: 'power', label: 'Power' },
  { code: 'other', label: 'Other' },
] as const

/** Whole minutes since a stoppage opened. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

/**
 * One number per line, for this hour.
 *
 * Entries are captured, never posted directly: the batch is idempotent on (line, hour), so
 * a tablet that loses the network mid-shift and replays an hour later produces the same
 * row rather than a second one.
 *
 * A stopped line is shown in the list rather than in a separate screen. The supervisor who
 * knows the line stopped is the one entering its zero, and asking them to navigate to log
 * it is how stoppages go unlogged and the day's lost minutes never add up.
 */
export function HourlyClient({
  producedOn,
  hour,
  lines,
  stoppages,
}: {
  producedOn: string
  hour: number
  lines: readonly LineRow[]
  stoppages: readonly Stoppage[]
}) {
  const router = useRouter()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [entries, setEntries] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string | null>(null)
  const [stopping, setStopping] = useState<LineRow | null>(null)
  const [noted, setNoted] = useState<string | null>(null)

  const stoppedByLine = new Map(stoppages.map((s) => [s.lineId, s]))

  const filled = lines.filter((l) => (entries[l.lineId] ?? '').trim() !== '')
  const total = filled.reduce((n, l) => n + (Number.parseInt(entries[l.lineId]!, 10) || 0), 0)

  async function submit() {
    if (filled.length === 0) return

    await capture({
      moduleId: 'production',
      operation: 'record_hourly_outputs',
      payload: {
        entries: filled.map((line) => ({
          lineId: line.lineId,
          ...(line.orderId ? { orderId: line.orderId } : {}),
          producedOn,
          hourSlot: hour,
          target: line.target,
          actual: Number.parseInt(entries[line.lineId]!, 10) || 0,
        })),
      },
    })

    setSent(`${filled.length} line${filled.length === 1 ? '' : 's'} · ${total} pieces`)
    setEntries({})
    if (online) await sync()
    router.refresh()
  }

  /**
   * Capture, drain, then re-read.
   *
   * `capture()` writes to the device and kicks the queue without waiting for it, so
   * refreshing straight after raced the flush: the supervisor logged a stoppage, the screen
   * came back unchanged, and the only reasonable conclusion is that it did not work. The
   * banner says what happened immediately; the refresh waits for the server to agree.
   */
  async function captureThenRefresh(
    write: { operation: string; payload: Record<string, unknown> },
    confirmation: string,
  ) {
    await capture({ moduleId: 'production', ...write })
    setNoted(confirmation)
    if (online) await sync()
    router.refresh()
  }

  async function logStoppage(line: LineRow, reason: string, note: string) {
    setStopping(null)
    await captureThenRefresh(
      {
        operation: 'open_downtime',
        payload: {
          lineId: line.lineId,
          startedAt: new Date().toISOString(),
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      `${line.code} logged as stopped · ${reason}`,
    )
  }

  async function resolveStoppage(stoppage: Stoppage) {
    await captureThenRefresh(
      {
        operation: 'close_downtime',
        payload: { downtimeId: stoppage.id, endedAt: new Date().toISOString() },
      },
      `${stoppage.lineCode} running again after ${minutesSince(stoppage.startedAt)} min`,
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} entr{refused.length === 1 ? 'y' : 'ies'} the server refused.
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

      {noted ? <InlineAlert tone="info">{noted}</InlineAlert> : null}

      {sent ? (
        <InlineAlert tone="success">
          Counted {sent}.{' '}
          {online ? 'Sent.' : 'Held on this tablet until you are back online.'}
        </InlineAlert>
      ) : null}

      <SectionHeading eyebrow={`hour ${hour}:00–${hour + 1}:00`}>What each line made</SectionHeading>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((line) => {
          const stopped = stoppedByLine.get(line.lineId)
          return (
            <div
              key={line.lineId}
              style={{
                display: 'grid',
                // minmax(0, …) so the flexible tracks may shrink past their content's
                // min-width — otherwise the numpad forces the row wider than the tablet.
                gridTemplateColumns: '110px minmax(0, 1fr) 150px minmax(0, 1fr)',
                gap: 14,
                alignItems: 'center',
                padding: '12px 18px',
                minHeight: 72,
                border: '1px solid var(--fx-border-subtle)',
                borderLeft: `3px solid ${stopped ? 'var(--fx-danger)' : 'transparent'}`,
                background: 'var(--fx-bg-surface)',
              }}
            >
              <div>
                <div style={{ font: "600 17px/1.2 var(--fx-font-sans)" }}>{line.code}</div>
                <div
                  style={{
                    font: "400 12px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  target {line.target}
                </div>
              </div>

              <div>
                {stopped ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Badge tone="danger">stopped · {stopped.reason}</Badge>
                    <span
                      style={{
                        font: "400 12.5px/1.3 var(--fx-font-mono)",
                        color: 'var(--fx-text-secondary)',
                      }}
                    >
                      {minutesSince(stopped.startedAt)} min
                    </span>
                  </span>
                ) : line.alreadyEntered ? (
                  <span
                    style={{
                      font: "400 12.5px/1.3 var(--fx-font-mono)",
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    this hour already counted — entering again corrects it
                  </span>
                ) : null}
              </div>

              <NumpadInput
                label={`${line.code} output`}
                value={entries[line.lineId] ?? ''}
                onChange={(next) => setEntries((e) => ({ ...e, [line.lineId]: next }))}
              />

              <div style={{ textAlign: 'right' }}>
                {stopped ? (
                  <Button variant="ghost" onClick={() => void resolveStoppage(stopped)}>
                    Line running again
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setStopping(line)}>
                    Log a stoppage
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          {filled.length === 0
            ? 'an hour nobody counts stays empty — it is never read as zero'
            : `${filled.length} line${filled.length === 1 ? '' : 's'} · ${total} pieces`}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button
            variant="primary"
            size="lg"
            disabled={filled.length === 0}
            onClick={() => void submit()}
          >
            Save hour {hour}:00
          </Button>
        </span>
      </div>

      {stopping ? (
        <StoppageDialog
          line={stopping}
          onClose={() => setStopping(null)}
          onLog={(reason, note) => void logStoppage(stopping, reason, note)}
        />
      ) : null}
    </div>
  )
}

function StoppageDialog({
  line,
  onClose,
  onLog,
}: {
  line: LineRow
  onClose: () => void
  onLog: (reason: string, note: string) => void
}) {
  const [reason, setReason] = useState<string>(REASONS[0].code)
  const [note, setNote] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`${line.code} has stopped`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onLog(reason, note)}>
            Log the stoppage
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Why</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'var(--fx-bg-surface)',
              color: 'var(--fx-text-primary)',
              font: "400 14px/1.4 var(--fx-font-sans)",
            }}
          >
            {REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>What happened</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Needle bar seized on the 4-thread overlock."
            style={{
              padding: '10px 12px',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-sm)',
              background: 'var(--fx-bg-surface)',
              color: 'var(--fx-text-primary)',
              font: "400 14px/1.5 var(--fx-font-sans)",
              resize: 'vertical',
            }}
          />
        </label>

        <InlineAlert tone="info">
          The clock starts now. A machine stoppage also raises a maintenance ticket — a
          supervisor with a dead line should not have to file paperwork twice.
        </InlineAlert>
      </div>
    </Modal>
  )
}
