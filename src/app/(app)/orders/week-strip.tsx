import Link from 'next/link'

import { type SelvageStatus } from '@/components/fx/signature'
import { StatusChip } from '@/components/fx/status-chip'
import { milestoneLabel } from '@/components/fx/tna'
import type { Locale } from '@/lib/i18n'
import type { WeekMilestone } from '@/modules/orders/queries'

/**
 * 1.3 Order Desk — the week, day by day.
 *
 * The build pack calls this "the screen a merchandiser opens every morning — make it
 * scannable in 10 seconds", and it is the one specified merchandising surface that never
 * got built: the milestones existed, the nightly scan graded them, and the only way to
 * see Thursday was to open every order in turn.
 *
 * Monday to Friday of the CURRENT week, today highlighted. The overdue backlog rides in
 * today's column — a week view that files last Tuesday's unstarted cutting under last
 * Tuesday is hiding it exactly where nobody looks.
 */

const DAY_WORDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const STATUS_TO_SELVAGE: Record<string, SelvageStatus> = {
  late: 'late',
  at_risk: 'at-risk',
  on_track: 'on-track',
  pending: 'on-track',
  done: 'done',
}

const STATUS_WORD: Record<string, string> = {
  late: 'late',
  at_risk: 'at risk',
  on_track: 'on track',
  pending: 'planned',
}

/** At most this many chips per day; the rest collapse to a count. A column of
 *  fourteen chips is a list wearing a calendar's clothes. */
const PER_DAY = 4

export interface WeekDay {
  iso: string
  label: string
  today: boolean
  items: WeekMilestone[]
  hidden: number
}

/** The Monday→Friday of the week containing `todayIso`, each day carrying its milestones. */
export function buildWeek(todayIso: string, milestones: readonly WeekMilestone[]): WeekDay[] {
  const today = new Date(`${todayIso}T00:00:00Z`)
  // getUTCDay(): Sunday 0. Monday of this week:
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7))

  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(monday)
    day.setUTCDate(monday.getUTCDate() + i)
    const iso = day.toISOString().slice(0, 10)
    const isToday = iso === todayIso

    // Overdue items land on today, where the person who must act is looking.
    const items = milestones
      .filter((m) => (isToday ? m.plannedDate === iso || m.overdue : m.plannedDate === iso && !m.overdue))
      .sort((a, b) => {
        const rank = (m: WeekMilestone) => (m.status === 'late' ? 0 : m.status === 'at_risk' ? 1 : 2)
        return rank(a) - rank(b)
      })

    return {
      iso,
      label: `${DAY_WORDS[day.getUTCDay()]} ${day.getUTCDate()}`,
      today: isToday,
      items: items.slice(0, PER_DAY),
      hidden: Math.max(0, items.length - PER_DAY),
    }
  })
}

export function WeekStrip({ days, locale }: { days: readonly WeekDay[]; locale: Locale }) {
  if (days.every((d) => d.items.length === 0)) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 16,
      }}
    >
      {days.map((day) => (
        <div
          key={day.iso}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            ...(day.today
              ? {
                  background: 'var(--fx-bg-selected)',
                  borderRadius: 'var(--fx-radius-md)',
                  padding: 10,
                  margin: -10,
                }
              : {}),
          }}
        >
          <span
            style={{
              font: '500 11px/1 var(--fx-font-mono)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: day.today ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)',
            }}
          >
            {day.label}
            {day.today ? ' · today' : ''}
          </span>

          {day.items.map((m) => (
            <Link
              key={`${m.orderId}-${m.name}`}
              href={`/orders/${m.orderId}`}
              className="fx-selvage"
              data-status={STATUS_TO_SELVAGE[m.status] ?? 'on-track'}
              data-critical={m.critical && m.status === 'late' ? true : undefined}
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      font: '500 13.5px/1.3 var(--fx-font-sans)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {milestoneLabel(m.name, locale)}
                  </span>
                  <StatusChip status={STATUS_TO_SELVAGE[m.status] ?? 'on-track'}>
                    {STATUS_WORD[m.status] ?? m.status}
                  </StatusChip>
                </div>
                <span
                  style={{
                    font: '400 11.5px/1.4 var(--fx-font-mono)',
                    color: 'var(--fx-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[m.poNumber, m.buyerName].filter(Boolean).join(' · ') || '—'}
                  {m.overdue ? ` · overdue since ${m.plannedDate}` : ''}
                </span>
              </div>
            </Link>
          ))}

          {day.hidden > 0 ? (
            <span
              style={{
                font: '400 11.5px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
                paddingLeft: 2,
              }}
            >
              +{day.hidden} more
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
