'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'

interface BoardLine {
  code: string
  target: number
  actual: number
  stopped: boolean
}

interface Stoppage {
  lineCode: string
  reason: string
  startedAt: string
}

const MINUTE = 60_000

/**
 * The wall clock, as an external store.
 *
 * The clock genuinely is state outside React — it changes on its own and the server has no
 * business guessing it, so the server snapshot is `null` and the board renders a dash until
 * hydration. Truncating to the minute is what makes this legal: `getSnapshot` has to return
 * a stable value between renders or React re-renders forever, and `Date.now()` never does.
 * Polling faster than a minute only pins the displayed minute closer to its boundary.
 */
const POLL = 15_000

function subscribeToClock(onChange: () => void): () => void {
  const id = setInterval(onChange, POLL)
  return () => clearInterval(id)
}

function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE)
}

function noClockOnTheServer(): null {
  return null
}

/** Milliseconds from now until the top of the next hour. */
function untilNextHour(): number {
  const now = new Date()
  return (
    ((59 - now.getMinutes()) * 60 + (60 - now.getSeconds())) * 1000 - now.getMilliseconds()
  )
}

function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * The wall board.
 *
 * Two behaviours worth naming, because both are the difference between a board people
 * trust and one they stop looking at:
 *
 * **The refresh is aligned to the hour, not offset from page load.** A naive hourly
 * interval started at 14:41 keeps refreshing at 14:41 forever, so the board spends
 * fifty-nine minutes of every hour showing an hour that has already closed. This waits
 * for the top of the hour once, then settles into an hourly beat.
 *
 * **The stoppage clock ticks every minute regardless.** Output is an hourly number, but
 * "Line 4 stopped — 34 minutes" that stays frozen at 34 for an hour is worse than absent:
 * it reads as a resolved stoppage nobody cleared.
 */
export function TvBoard({
  lines,
  target,
  actual,
  floorEfficiency,
  stoppages,
}: {
  lines: readonly BoardLine[]
  target: number
  actual: number
  floorEfficiency: string | null
  stoppages: readonly Stoppage[]
}) {
  const router = useRouter()

  const minute = useSyncExternalStore(subscribeToClock, currentMinute, noClockOnTheServer)
  const now = minute === null ? null : new Date(minute * MINUTE)

  useEffect(() => {
    let hourly: ReturnType<typeof setInterval> | undefined
    const align = setTimeout(() => {
      router.refresh()
      hourly = setInterval(() => router.refresh(), 60 * MINUTE)
    }, untilNextHour())
    return () => {
      clearTimeout(align)
      if (hourly) clearInterval(hourly)
    }
  }, [router])

  const behind = target - actual
  const lostMinutes = now
    ? stoppages.reduce(
        (n, s) => n + Math.max(0, Math.floor((now.getTime() - Date.parse(s.startedAt)) / MINUTE)),
        0,
      )
    : 0

  return (
    <div
      data-theme="dark"
      style={{
        minHeight: '100vh',
        padding: '48px 56px',
        background: 'var(--fx-bg-canvas)',
        color: 'var(--fx-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {/* ── Who and when ─────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <h1 style={{ font: "600 34px/1 var(--fx-font-sans)", letterSpacing: '-.01em' }}>
          Sewing floor
        </h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            font: "400 15px/1 var(--fx-font-mono)",
            color: 'var(--fx-text-secondary)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--fx-success)',
            }}
          />
          live · hour {now ? `${now.getHours()}–${now.getHours() + 1}` : '—'}
        </span>
      </header>

      {/* ── The two numbers ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 72, flexWrap: 'wrap' }}>
        {[
          { label: 'Target · day so far', value: target, tone: 'var(--fx-text-secondary)' },
          {
            label: 'Made',
            value: actual,
            tone: behind > 0 ? 'var(--fx-warning)' : 'var(--fx-success)',
          },
        ].map((cell) => (
          <div key={cell.label}>
            <div
              style={{
                font: "400 14px/1 var(--fx-font-mono)",
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {cell.label}
            </div>
            <div
              style={{
                marginTop: 10,
                font: "600 92px/1 var(--fx-font-sans)",
                letterSpacing: '-.02em',
                fontVariantNumeric: 'tabular-nums',
                color: cell.tone,
              }}
            >
              {cell.value.toLocaleString()}
            </div>
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 56 }}>
          <Stat label="Floor efficiency" value={floorEfficiency ? `${floorEfficiency}%` : '—'} />
          <Stat
            label="Lost to stoppages"
            value={stoppages.length > 0 ? `${lostMinutes} min` : '—'}
            tone={stoppages.length > 0 ? 'var(--fx-danger)' : undefined}
          />
        </div>
      </div>

      {/* ── A stopped line owns the board ────────────────────────────────── */}
      {stoppages.map((s) => (
        <div
          key={`${s.lineCode}-${s.startedAt}`}
          style={{
            padding: '20px 26px',
            borderLeft: '4px solid var(--fx-danger)',
            background: 'color-mix(in srgb, var(--fx-danger) 14%, transparent)',
            font: "500 30px/1.2 var(--fx-font-sans)",
          }}
        >
          {s.lineCode} stopped —{' '}
          {now ? Math.max(0, Math.floor((now.getTime() - Date.parse(s.startedAt)) / MINUTE)) : 0}{' '}
          minutes
          <span
            style={{
              marginLeft: 14,
              font: "400 20px/1.2 var(--fx-font-mono)",
              color: 'var(--fx-text-secondary)',
            }}
          >
            {s.reason}
          </span>
        </div>
      ))}

      {/* ── Line by line ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 2,
          background: 'var(--fx-border-subtle)',
          border: '1px solid var(--fx-border-subtle)',
        }}
      >
        {lines.map((line) => {
          const short = line.target - line.actual
          return (
            <div
              key={line.code}
              style={{
                background: 'var(--fx-bg-surface)',
                padding: '22px 24px',
                borderTop: `3px solid ${
                  line.stopped
                    ? 'var(--fx-danger)'
                    : short > 0
                      ? 'var(--fx-warning)'
                      : 'var(--fx-success)'
                }`,
              }}
            >
              <div style={{ font: "600 22px/1.1 var(--fx-font-sans)" }}>{line.code}</div>
              <div
                style={{
                  marginTop: 10,
                  font: "600 46px/1 var(--fx-font-sans)",
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {line.actual.toLocaleString()}
              </div>
              <div
                style={{
                  marginTop: 8,
                  font: "400 15px/1.3 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                of {line.target.toLocaleString()}
                {short > 0 ? ` · ${short.toLocaleString()} short` : ''}
              </div>
            </div>
          )
        })}
      </div>

      <footer
        style={{
          marginTop: 'auto',
          font: "400 14px/1 var(--fx-font-mono)",
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {now ? `updated ${clock(now)} · refreshes every hour on the hour` : 'updated —'}
      </footer>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div
        style={{
          font: "400 14px/1 var(--fx-font-mono)",
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 10,
          font: "600 44px/1 var(--fx-font-sans)",
          fontVariantNumeric: 'tabular-nums',
          color: tone ?? 'var(--fx-text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
