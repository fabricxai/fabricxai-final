'use client'

import { useEffect, useState } from 'react'

/**
 * The keyboard, written down — `?` opens it anywhere in the app.
 *
 * Only bindings that actually exist are listed: a shortcuts sheet with aspirations
 * on it teaches people the sheet lies, and then no one opens it again. Every entry
 * here names its real handler; adding a key means adding it to this list in the
 * same change, which is a convention this comment is the enforcement of.
 */

const GROUPS: readonly {
  title: string
  keys: readonly { combo: readonly string[]; what: string; where: string }[]
}[] = [
  {
    title: 'Anywhere',
    keys: [
      { combo: ['Ctrl', 'K'], what: 'ask MARBIM about the screen you are on', where: '⌘K on a Mac' },
      { combo: ['?'], what: 'this sheet', where: '' },
    ],
  },
  {
    title: 'Order book',
    keys: [
      { combo: ['j'], what: 'next order', where: '/orders' },
      { combo: ['k'], what: 'previous order', where: '/orders' },
      { combo: ['↵'], what: 'open the focused order', where: '/orders' },
      { combo: ['i'], what: 'inputs readiness', where: '/orders' },
    ],
  },
  {
    title: 'Approve inbox',
    keys: [
      { combo: ['j'], what: 'next draft', where: '/approve' },
      { combo: ['k'], what: 'previous draft', where: '/approve' },
      { combo: ['a'], what: 'approve the focused draft — with your corrections', where: '/approve' },
      { combo: ['r'], what: 'reject — asks for a reason', where: '/approve' },
      { combo: ['x'], what: 'select for a batch', where: '/approve' },
    ],
  },
]

export function ShortcutsSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgb(24 29 41 / 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fx-cut"
        style={{
          background: 'var(--fx-bg-raised)',
          border: '1px solid var(--fx-border-subtle)',
          borderRadius: 'var(--fx-radius-lg)',
          boxShadow: 'var(--fx-sh3)',
          padding: 28,
          width: 520,
          maxWidth: '94vw',
          maxHeight: '78vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <span style={{ font: '600 18px/1.2 var(--fx-font-sans)' }}>Keyboard</span>

        {GROUPS.map((group) => (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                font: '500 11px/1 var(--fx-font-mono)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
                paddingBottom: 8,
              }}
            >
              {group.title}
            </span>
            {group.keys.map((key) => (
              <div
                key={`${group.title}-${key.combo.join('+')}-${key.what}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: '1px solid var(--fx-border-subtle)',
                }}
              >
                <span style={{ display: 'inline-flex', gap: 5, minWidth: 92 }}>
                  {key.combo.map((cap) => (
                    <kbd
                      key={cap}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 26,
                        height: 26,
                        padding: '0 7px',
                        border: '1px solid var(--fx-border-default)',
                        borderBottomWidth: 2,
                        borderRadius: 5,
                        background: 'var(--fx-bg-surface)',
                        font: '500 12px/1 var(--fx-font-mono)',
                      }}
                    >
                      {cap}
                    </kbd>
                  ))}
                </span>
                <span style={{ font: '400 13.5px/1.4 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
                  {key.what}
                </span>
                {key.where ? (
                  <span
                    style={{
                      marginLeft: 'auto',
                      font: '400 11.5px/1 var(--fx-font-mono)',
                      color: 'var(--fx-text-tertiary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {key.where}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ))}

        <span style={{ font: '400 12px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
          Nothing here is destructive without a confirm — approve and reject always show what
          changes first.
        </span>
      </div>
    </div>
  )
}
