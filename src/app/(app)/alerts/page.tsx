import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { listUnread } from '@/modules/core/notifications'
import { getCtx } from '@/modules/core/session'
import { t } from '@/lib/i18n'
import { requestLocale } from '@/lib/ui-locale'

/**
 * Alerts — what will shout, and the doctrine of when.
 *
 * The bell shows twenty; this page shows everything unread and, more importantly,
 * writes the rule down so the channels stay ignorable-proof: the digest carries
 * everything once, the badge carries what can be acted on today, and MAIL is
 * reserved for the last warning before something becomes irreversible. An alert
 * is for something that EXPIRES — a date, a window, a deadline. If nothing is
 * lost by seeing it tomorrow, it is not an alert; it lives on the screen that
 * owns it.
 */
export const dynamic = 'force-dynamic'

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  critical: 'danger',
  warning: 'warning',
  info: 'neutral',
}

export default async function AlertsPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const unread = await listUnread(ctx, 100)

  return (
    <>
      <RouteHeader
        path="/alerts"
        locale={locale}
        eyebrow="Everything addressed to you or your role"
        title="Alerts"
        meta={unread.length === 0 ? 'nothing unread' : `${unread.length} unread`}
        ownsAmber
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, maxWidth: 980 }}>
        {unread.length === 0 ? (
          <EmptyState
            title="Nothing is shouting"
            body="Alerts land here when a date, a window or a deadline is about to expire — LC countdowns, quote deadlines, a missing EXP number. Quiet is the good state."
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
            {unread.map((alert, i) => {
              const row = (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '13px 20px',
                    minHeight: 'var(--fx-row-height)',
                    borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
                  }}
                >
                  <Badge tone={SEVERITY_TONE[alert.severity] ?? 'neutral'}>{alert.severity}</Badge>
                  <span style={{ font: '500 14px/1.4 var(--fx-font-sans)', minWidth: 0 }}>
                    {t(locale, alert.titleKey, (alert.params ?? {}) as Record<string, unknown>)}
                  </span>
                  {alert.bodyKey ? (
                    <span
                      style={{
                        font: '400 13px/1.5 var(--fx-font-sans)',
                        color: 'var(--fx-text-secondary)',
                      }}
                    >
                      {t(locale, alert.bodyKey, (alert.params ?? {}) as Record<string, unknown>)}
                    </span>
                  ) : null}
                  <span
                    style={{
                      marginLeft: 'auto',
                      font: '400 12px/1.4 var(--fx-font-mono)',
                      color: 'var(--fx-text-tertiary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Intl.DateTimeFormat('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(alert.createdAt)}
                  </span>
                </div>
              )
              return alert.href ? (
                <Link
                  key={alert.id}
                  href={alert.href}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  {row}
                </Link>
              ) : (
                <div key={alert.id}>{row}</div>
              )
            })}
          </div>
        )}

        <section>
          <SectionHeading eyebrow="three channels, on purpose — a fourth would make all four ignorable">
            Where each kind lands
          </SectionHeading>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {[
              {
                name: 'The morning digest',
                what: 'Everything, once, composed at 05:30 from the nightly scan. Read it with tea; nothing in it is a surprise by lunch.',
              },
              {
                name: 'The bell',
                what: 'Only what can be acted on today. Twenty at most — past that, the badge is a number nobody reads.',
              },
              {
                name: 'Mail',
                what: 'The last warning before something becomes irreversible: an LC date inside a week, a quote deadline, a missing EXP number at shipment.',
              },
            ].map((channel) => (
              <div
                key={channel.name}
                style={{
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                  borderRadius: 'var(--fx-radius-md)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span style={{ font: '600 14px/1.3 var(--fx-font-sans)' }}>{channel.name}</span>
                <span
                  style={{
                    font: '400 13px/1.6 var(--fx-font-sans)',
                    color: 'var(--fx-text-secondary)',
                  }}
                >
                  {channel.what}
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              font: '400 13px/1.65 var(--fx-font-sans)',
              color: 'var(--fx-text-tertiary)',
              maxWidth: '68ch',
            }}
          >
            What never becomes an alert: anything a screen can simply show when you look — a
            milestone turning at-risk, a sample moving a stage, an input landing on time. An
            alert is for something that expires. If nothing is lost by seeing it tomorrow, it is
            not an alert.
          </p>
        </section>
      </div>
    </>
  )
}
