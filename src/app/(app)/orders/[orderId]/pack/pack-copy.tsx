'use client'

import { useState } from 'react'

import { Button } from '@/components/fx/primitives'

/**
 * Copy the pack as plain text — the shape a merchandiser actually sends, because
 * the buyer's merchandiser reads it in a mail client, not in this app. Clipboard
 * only: the PDF pipeline has no worker yet (docs/STUBS.md), and a button that
 * promised one would be the stand-in this codebase keeps refusing to ship.
 */
export function CopyPack({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          } catch {
            // Clipboard can be refused (permissions, http). The textarea below the
            // button is the fallback — the text is on the page either way.
            setCopied(false)
          }
        }}
      >
        Copy as text
      </Button>
      {copied ? (
        <span style={{ font: '400 12.5px/1 var(--fx-font-sans)', color: 'var(--fx-success)' }}>
          copied — paste it into the mail
        </span>
      ) : null}
    </span>
  )
}
