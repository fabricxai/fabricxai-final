'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/fx/primitives'
import { signOut } from '@/lib/auth-client'

/**
 * Who is signed in, and the way out.
 *
 * There was no way to log out. `signOut` was exported from `lib/auth-client` and called
 * from nowhere; the avatar was a `<span>`, and `/logout`, `/signout`, `/profile` and
 * `/account` all 404'd. Clearing cookies was the only exit.
 *
 * That matters most where this software actually runs. A store counter or a cutting desk is
 * a shared terminal — one machine, a shift's worth of people — and the previous person's
 * session staying open means the next one issues bonded fabric under somebody else's name,
 * into an audit log that will say so for years.
 *
 * **The role is named here because nothing else named it.** A person could infer theirs
 * from a short sidebar, which does not distinguish "not yours" from "does not exist", and
 * says nothing about what they may change on a screen they can open.
 */
export function AccountMenu({
  name,
  email,
  roleLabel,
  companyName,
}: {
  name: string | null
  email: string
  roleLabel: string
  companyName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Click-away and Escape. A menu over somebody's identity that traps focus on a shared
  // terminal is the opposite of what this is for.
  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** Initials from the actual name. `userId.slice(0, 2)` made everybody "SE". */
  const initials = (name ?? email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

  async function leave() {
    setLeaving(true)
    try {
      await signOut()
    } finally {
      /*
       * Navigate whatever the server said. A failed sign-out that leaves somebody looking
       * at their own dashboard has told them they are logged out when they are not — on a
       * shared terminal that is the one lie with a cost. `/login` re-checks the session and
       * sends a still-valid one onward, so the worst case is an honest redirect back.
       */
      router.replace('/login')
      router.refresh()
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Signed in as ${name ?? email}. Account menu.`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--fx-text-primary)',
        }}
      >
        <Avatar initials={initials} size={30} />
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            minWidth: 262,
            zIndex: 60,
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-md)',
            boxShadow: 'var(--fx-sh2)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ font: "600 14px/1.3 var(--fx-font-sans)" }}>{name ?? email}</span>
            {name ? (
              <span
                style={{
                  font: "400 12.5px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {email}
              </span>
            ) : null}
            <span
              style={{
                marginTop: 6,
                font: "500 12px/1.4 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              {roleLabel} · {companyName}
            </span>
          </div>

          <div
            style={{
              borderTop: '1px solid var(--fx-border-subtle)',
              padding: '10px 16px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <button
              role="menuitem"
              onClick={() => void leave()}
              disabled={leaving}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                font: "500 13.5px/1.4 var(--fx-font-sans)",
                color: 'var(--fx-danger)',
                cursor: leaving ? 'default' : 'pointer',
              }}
            >
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
            <span
              style={{
                font: "400 11.5px/1.45 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {/* Said plainly: this is a shared terminal in most of the building. */}
              Sign out before handing the terminal over — what you do here is recorded
              against your name.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
