'use client'

import { useState, useTransition } from 'react'

import { StatusChip } from '@/components/fx/status-chip'
import type { SelvageStatus } from '@/components/fx/signature'
import { milestoneLabel } from '@/components/fx/tna'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import type { Locale } from '@/lib/i18n'
import { orderTnaPeek } from '@/modules/orders/actions'
import type { MilestonePeek } from '@/modules/orders/queries'

/**
 * The TNA drawer — peek at any order's schedule without leaving the book.
 *
 * The design canvas offered three ways to show the time-and-action; the drawer won
 * because the question it answers ("where is THIS order against its dates") is
 * asked twenty times a morning from the book, and every answer used to cost a
 * navigation there and back. The full timeline with its ripple controls stays on
 * the order page; the drawer is read-only by design — a peek that could write
 * would need the ripple preview, and then it would be the page.
 */

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
  done: 'done',
}

export function TnaPeekButton({
  orderId,
  po,
  locale,
}: {
  orderId: string
  po: string
  locale: Locale
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [milestones, setMilestones] = useState<MilestonePeek[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function peek(event: React.MouseEvent) {
    // The row itself is a link to the order — the peek must not follow it.
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
    if (milestones !== null) return
    startTransition(async () => {
      try {
        const result = unwrap(await orderTnaPeek({ orderId }))
        setMilestones(result.milestones)
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The schedule could not be read.'))
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={peek}
        aria-label={`Time and action for ${po}`}
        style={{
          border: '1px solid var(--fx-border-subtle)',
          background: 'transparent',
          borderRadius: 'var(--fx-radius-sm)',
          padding: '4px 8px',
          font: '500 10.5px/1 var(--fx-font-mono)',
          color: 'var(--fx-text-tertiary)',
          cursor: 'pointer',
        }}
      >
        TNA
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`Time and action — ${po}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgb(24 29 41 / 0.45)',
            cursor: 'default',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 520,
              maxWidth: '94vw',
              background: 'var(--fx-bg-raised)',
              borderRadius: 'var(--fx-radius-lg) 0 0 var(--fx-radius-lg)',
              boxShadow: 'var(--fx-sh3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '22px 26px',
                borderBottom: '1px solid var(--fx-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    font: '500 11px/1 var(--fx-font-mono)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  peek — the book stays where it is
                </span>
                <span style={{ font: '600 20px/1.2 var(--fx-font-sans)' }}>
                  {po} — Time and action
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  marginLeft: 'auto',
                  border: '1px solid var(--fx-border-default)',
                  background: 'transparent',
                  borderRadius: 'var(--fx-radius-md)',
                  padding: '8px 12px',
                  font: '500 13px/1 var(--fx-font-sans)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 26px 20px' }}>
              {failure ? (
                <span style={{ font: '400 13px/1.5 var(--fx-font-sans)', color: 'var(--fx-danger)' }}>
                  {failure}
                </span>
              ) : milestones === null || pending ? (
                <span
                  style={{ font: '400 13px/1.5 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}
                >
                  reading the schedule…
                </span>
              ) : milestones.length === 0 ? (
                <span style={{ font: '400 13.5px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
                  No schedule yet — open the order to generate one from a template.
                </span>
              ) : (
                milestones.map((m, i) => (
                  <div
                    key={m.name}
                    className="fx-selvage"
                    data-status={STATUS_TO_SELVAGE[m.status] ?? 'on-track'}
                    data-critical={m.critical && m.status === 'late' ? true : undefined}
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)' }}
                  >
                    <div
                      style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: '1.6fr .7fr .7fr auto',
                        gap: 10,
                        alignItems: 'center',
                        padding: '10px 0 10px 12px',
                      }}
                    >
                      <span style={{ font: '500 13.5px/1.3 var(--fx-font-sans)' }}>
                        {milestoneLabel(m.name, locale)}
                      </span>
                      <span
                        data-numeric
                        data-mono
                        style={{ font: '400 12.5px/1.3 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}
                      >
                        {m.plannedDate}
                      </span>
                      <span
                        data-numeric
                        data-mono
                        style={{
                          font: '400 12.5px/1.3 var(--fx-font-mono)',
                          color: m.actualDate ? 'var(--fx-text-primary)' : 'var(--fx-text-disabled)',
                        }}
                      >
                        {m.actualDate ?? '—'}
                      </span>
                      <StatusChip status={STATUS_TO_SELVAGE[m.status] ?? 'on-track'}>
                        {STATUS_WORD[m.status] ?? m.status}
                      </StatusChip>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                padding: '16px 26px',
                borderTop: '1px solid var(--fx-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <a
                href={`/orders/${orderId}`}
                style={{ font: '600 13.5px/1 var(--fx-font-sans)', color: 'var(--fx-text-primary)' }}
              >
                Open the order →
              </a>
              <span
                style={{
                  marginLeft: 'auto',
                  font: '400 11.5px/1.4 var(--fx-font-mono)',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                read-only — actualizing shows its ripple on the order page
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
