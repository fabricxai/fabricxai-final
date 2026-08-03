'use client'

import { useSyncExternalStore } from 'react'

type Mode = 'light' | 'dark'

/**
 * Light / dark toggle.
 *
 * Light is the default and every screen is designed there first; dark exists
 * for the wall board and the owner's night view.
 *
 * The DOM is the source of truth here, not React state. `data-theme` on <html>
 * is the same attribute a dark panel sets on itself and the same one the
 * pre-paint script in the layout writes, so mirroring it into component state
 * would give us two answers that can disagree. `useSyncExternalStore` reads the
 * one that actually drives the tokens.
 */

const STORAGE_KEY = 'fx-theme'

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function readMode(): Mode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Server render has no DOM, and light is the designed default. */
function serverMode(): Mode {
  return 'light'
}

function applyMode(next: Mode): void {
  document.documentElement.dataset.theme = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // A locked-down floor tablet may refuse storage. The choice still applies
    // for this session; it just will not survive a reload.
  }
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, serverMode)

  return (
    <div
      role="group"
      aria-label="Colour mode"
      style={{
        display: 'flex',
        border: '1px solid var(--fx-border-default)',
        borderRadius: 'var(--fx-radius-md)',
        overflow: 'hidden',
        background: 'var(--fx-bg-surface)',
      }}
    >
      {(['light', 'dark'] as const).map((m) => {
        const on = mode === m
        return (
          <button
            key={m}
            onClick={() => applyMode(m)}
            aria-pressed={on}
            style={{
              background: on ? 'var(--fx-text-primary)' : 'transparent',
              color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
              border: 'none',
              padding: '8px 14px',
              cursor: 'pointer',
              font: "600 12px/1 var(--fx-font-sans)",
              textTransform: 'capitalize',
            }}
          >
            {m}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Applied before first paint so a dark-mode user never sees a light flash.
 * Inlined in the document head; it runs before React hydrates.
 */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`
