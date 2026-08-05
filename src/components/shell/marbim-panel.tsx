'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { MarbimSurface } from '@/app/(app)/marbim/surface-client'
import { MarbimMark } from '@/components/fx/mark'

import { moduleForPath, screenLabelForPath, type MarbimEntry } from './marbim-context'
import { MARBIM_OPEN_EVENT } from './marbim-open'

/**
 * X.2 MARBIM Surface — the slide-over panel, built to the design canvas.
 *
 * Opens via the top-bar "Ask MARBIM" control or ⌘K. The panel opens OVER the screen
 * rather than replacing it, because the question a person has is almost always about
 * what they are looking at. Navigating away to ask it loses the thing they were pointing
 * at. That is also why the current screen's module is passed as `fromModule`: the answer
 * leads with that department's primer instead of all twenty-one.
 *
 * `/marbim` stays as the full-page surface — the right shape for a long session at a desk.
 *
 * Four things are load-bearing:
 *
 * 1. **The conversation id is generated on the client, once.** The shell re-renders on every
 *    navigation, so an id from the server would change mid-conversation and the turn indices
 *    would restart against a thread that already had turns.
 *
 * 2. **The thread survives navigation.** The panel lives in the shell, above the page slot,
 *    so walking from Orders to Cutting with it open keeps what was already asked — only
 *    `fromModule` changes, and only for the NEXT question.
 *
 * 3. **The surface is imported, not reimplemented.** Two copies of the composer would drift,
 *    and the one people use less would be the one that rots.
 *
 * 4. **The scrim is deliberate.** An earlier build dropped it so the screen behind stayed
 *    clickable; the canvas says otherwise — scrim at .28 with the hatch, and the host
 *    desaturated to .55 (see `[data-marbim='open']` in theme.css). While MARBIM is open the
 *    screen behind is context, not content.
 */

export interface MarbimTrustLine {
  drafted: number
  approved: number
  correctedFields: number
  pending: number
  windowDays: number
}

export function MarbimPanel({ entry, trust }: { entry: MarbimEntry; trust: MarbimTrustLine }) {
  const [open, setOpen] = useState(false)
  // Lazily created and then stable for the tab's lifetime.
  const [conversationId] = useState(() => globalThis.crypto.randomUUID())
  // "change scope" — narrow to this screen's department, or let MARBIM read across all of
  // them. The canvas puts this on the context chip; it is the one thing about a question
  // the panel cannot infer from where you are standing.
  const [wideScope, setWideScope] = useState(false)

  const pathname = usePathname()
  const screenModule = moduleForPath(pathname)
  const screenLabel = screenLabelForPath(pathname)

  const close = useCallback(() => setOpen(false), [])

  // The host desaturation is a stylesheet rule keyed on the document, because the element it
  // applies to is the page slot — a sibling this component cannot reach through React.
  useEffect(() => {
    const root = document.documentElement
    if (open) root.dataset.marbim = 'open'
    else delete root.dataset.marbim
    return () => {
      delete root.dataset.marbim
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (open) close()
        return
      }
      // ⌘K anywhere, per the canvas.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // Any "Ask MARBIM" button anywhere — the top bar's, or a future in-context one on a
  // screen — asks through this rather than reaching into the panel's state.
  useEffect(() => {
    const onRequest = () => setOpen(true)
    window.addEventListener(MARBIM_OPEN_EVENT, onRequest)
    return () => window.removeEventListener(MARBIM_OPEN_EVENT, onRequest)
  }, [])

  return (
    <>
      {/* ── P1 · the panel ───────────────────────────────────────────────── */}
      {open ? (
        <>
          <div
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              backgroundColor: 'rgb(24 29 41 / .28)',
              backgroundImage:
                'repeating-linear-gradient(146deg, transparent 0 7px, rgb(255 255 255 / .05) 7px 9px, transparent 9px 17px)',
            }}
          />
          <aside
            role="dialog"
            aria-modal="true"
            // Not "Ask MARBIM" — the composer inside already carries that name, and two
            // nodes with the same accessible name make the panel and its input
            // indistinguishable to a screen reader.
            aria-label="MARBIM"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 61,
              width: 520,
              maxWidth: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--fx-glass-bg)',
              backdropFilter: 'var(--fx-glass-blur)',
              WebkitBackdropFilter: 'var(--fx-glass-blur)',
              borderLeft: '1px solid var(--fx-glass-border)',
              boxShadow: 'var(--fx-sh3)',
              animation: 'fx-slide-in var(--fx-dur-overlay) var(--fx-ease-enter) both',
            }}
          >
            <header
              style={{
                padding: '18px 22px 14px',
                borderBottom: '1px solid var(--fx-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--fx-radius-full)',
                    // Surface plate so the theme's ink/white mark set stays
                    // legible — an ink circle in light mode hid the ink strokes.
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MarbimMark state="rest" size={20} label={null} />
                </span>
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <span style={{ font: '600 15px/1.2 var(--fx-font-sans)' }}>MARBIM</span>
                  <span
                    style={{
                      font: '400 12px/1.3 var(--fx-font-mono)',
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    {entry.model ? `${entry.model} · ` : ''}
                    {entry.packLabel} · ⌘K anywhere
                  </span>
                </span>
                <button
                  onClick={close}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: '1px solid var(--fx-border-default)',
                    borderRadius: 'var(--fx-radius-md)',
                    padding: '9px 12px',
                    minHeight: 44,
                    font: '600 12.5px/1 var(--fx-font-sans)',
                    color: 'var(--fx-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>

              {/* The scope chip. Says what MARBIM is about to read, before you ask. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--fx-bg-sunken)',
                  borderRadius: 'var(--fx-radius-md)',
                  padding: '10px 12px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    width: 2,
                    height: 14,
                    transform: 'skewX(-34deg)',
                    background: 'var(--fx-accent)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ font: '500 13px/1.35 var(--fx-font-sans)' }}>
                  {wideScope || !screenModule
                    ? 'Reading across every department'
                    : `You're on ${screenLabel}`}
                </span>
                <span
                  style={{
                    font: '400 12px/1.3 var(--fx-font-mono)',
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  {wideScope || !screenModule ? 'all primers' : `${screenModule} primer leads`}
                </span>
                {screenModule ? (
                  <button
                    onClick={() => setWideScope((v) => !v)}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: 'none',
                      font: '500 12px/1 var(--fx-font-mono)',
                      color: 'var(--fx-text-secondary)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    change scope
                  </button>
                ) : null}
              </div>
            </header>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: '20px 22px',
              }}
            >
              <MarbimSurface
                conversationId={conversationId}
                suggestions={entry.suggestions}
                packLabel={entry.packLabel}
                readOnly={entry.readOnly}
                fromModule={wideScope ? undefined : screenModule}
                // The mark lives in this panel's header; a floating one pinned to the
                // viewport would sit over the screen behind the glass.
                floatingMark={false}
                autoFocus
              />
            </div>

            {/* ── P4 · the trust footer ────────────────────────────────────
                Counted from this tenant's own drafts. A new factory sees zeroes, and that
                is the correct answer — borrowing somebody else's numbers to look
                established is exactly the dishonesty this line exists to refuse. */}
            <footer
              style={{
                padding: '12px 22px 16px',
                borderTop: '1px solid var(--fx-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  font: '400 11.5px/1.4 var(--fx-font-mono)',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {trust.drafted === 0
                  ? `no drafts yet · last ${trust.windowDays} days`
                  : `drafted ${trust.drafted} · approved ${trust.approved} · corrected ${trust.correctedFields} fields`}
              </span>
              <a
                href="/approve"
                style={{
                  font: '500 11.5px/1.4 var(--fx-font-mono)',
                  marginLeft: 'auto',
                }}
              >
                audit trail
              </a>
            </footer>
          </aside>
        </>
      ) : null}
    </>
  )
}
