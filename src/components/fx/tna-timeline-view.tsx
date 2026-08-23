'use client'

import type { Milestone } from './tna'
import { milestoneLabel } from './tna'
import type { Locale } from '@/lib/i18n'

/**
 * The TNA against the calendar — the design canvas's option B, as a toggle.
 *
 * One horizontal rail from the first planned date to the last, a marker per
 * milestone (shape + colour, same rule as everywhere), labels staggered on four
 * levels so the late-August cluster a real schedule always has does not overlap.
 * Deliberately read-only: "where are we against the calendar" is a glance, and
 * actualizing belongs to the table where the ripple preview lives.
 */

const LEVELS = [-72, -118, 34, 80] as const

const COLOR: Record<string, string> = {
  late: 'var(--fx-danger)',
  at_risk: 'var(--fx-warning)',
  on_track: 'var(--fx-text-primary)',
  done: 'var(--fx-text-primary)',
  pending: 'var(--fx-bg-surface)',
}

export function TnaTimelineView({
  milestones,
  today,
  locale,
}: {
  milestones: readonly Milestone[]
  today: string
  locale: Locale
}) {
  const dated = milestones.filter((m) => m.plannedDate)
  if (dated.length < 2) {
    return (
      <p style={{ font: '400 13.5px/1.6 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
        The timeline needs at least two dated milestones — the table has the rest.
      </p>
    )
  }

  const days = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000
  const start = Math.min(...dated.map((m) => days(m.plannedDate!)))
  const end = Math.max(...dated.map((m) => days(m.plannedDate!)))
  const span = Math.max(end - start, 1)

  const RAIL = 170
  const WIDTH = 1080
  const PAD = 40
  const x = (iso: string) => PAD + ((days(iso) - start) / span) * (WIDTH - PAD * 2)

  const todayX = days(today) >= start && days(today) <= end ? x(today) : null

  return (
    <div
      className="fx-scroll-x"
      tabIndex={0}
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        overflowY: 'hidden',
      }}
    >
      <div style={{ position: 'relative', height: 340, minWidth: WIDTH }}>
        {/* the rail */}
        <div
          style={{
            position: 'absolute',
            left: PAD - 10,
            right: PAD - 10,
            top: RAIL,
            height: 2,
            background: 'var(--fx-border-default)',
          }}
        />
        {todayX !== null ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: todayX,
                top: 12,
                bottom: 26,
                width: 2,
                background: 'var(--fx-accent)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: todayX + 8,
                top: 8,
                font: '500 10.5px/1 var(--fx-font-mono)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-warning)',
              }}
            >
              today
            </span>
          </>
        ) : null}

        {dated.map((m, i) => {
          const cx = x(m.plannedDate!)
          const level = LEVELS[i % LEVELS.length]!
          const above = level < 0
          const color = COLOR[m.status] ?? 'var(--fx-text-primary)'
          const isLate = m.status === 'late'
          const isRisk = m.status === 'at_risk'
          return (
            <div key={m.id}>
              <div
                style={{
                  position: 'absolute',
                  left: cx,
                  top: above ? RAIL + level + 30 : RAIL,
                  width: 1,
                  height: Math.abs(level) - (above ? 30 : 0),
                  background: 'var(--fx-border-subtle)',
                }}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: cx - 5,
                  top: RAIL - 4,
                  width: 10,
                  height: 10,
                  transform: isLate ? 'none' : 'rotate(45deg)',
                  clipPath: isLate ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined,
                  background: m.status === 'pending' ? 'var(--fx-bg-surface)' : color,
                  border:
                    m.status === 'pending'
                      ? '1.5px solid var(--fx-border-strong)'
                      : isRisk
                        ? 'none'
                        : 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: cx,
                  top: RAIL + level,
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ font: '500 12px/1.3 var(--fx-font-sans)' }}>
                  {milestoneLabel(m.name, locale)}
                </div>
                <div
                  style={{
                    font: '400 10.5px/1.4 var(--fx-font-mono)',
                    color:
                      m.status === 'late'
                        ? 'var(--fx-danger)'
                        : m.status === 'at_risk'
                          ? 'var(--fx-warning)'
                          : 'var(--fx-text-tertiary)',
                  }}
                >
                  {m.actualDate ?? m.plannedDate}
                  {m.actualDate && m.plannedDate && m.actualDate > m.plannedDate ? ' · slipped' : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
