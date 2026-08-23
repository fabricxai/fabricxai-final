'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Badge, Button } from '@/components/fx/primitives'
import { TextInput } from '@/components/fx/forms'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { claimUnfiled } from '@/modules/marbim/actions'
import type { UnfiledDocument } from '@/modules/marbim/service'

/**
 * The Unfiled tray (HANDOFF-marbim-mail-intake). A file naming no order was NOT
 * guessed onto one — it waits here, grouped by its mail thread, until a person
 * files it by the PO they can read. The PO travels, not the uuid; two orders
 * sharing a PO refuse rather than picking one silently.
 */
export function UnfiledTray({ docs }: { docs: readonly UnfiledDocument[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claiming, setClaiming] = useState<string | null>(null)
  const [po, setPo] = useState('')
  const [failure, setFailure] = useState<string | null>(null)

  if (docs.length === 0) return null

  // Group by thread so "part 3 of 3" reads as one enquiry.
  const threads = new Map<string, UnfiledDocument[]>()
  for (const doc of docs) {
    const key = doc.threadRef ?? doc.id
    const held = threads.get(key) ?? []
    held.push(doc)
    threads.set(key, held)
  }

  function claim(documentId: string) {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(await claimUnfiled({ documentId, poNumber: po }))
        setClaiming(null)
        setPo('')
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The file was not claimed.'))
      }
    })
  }

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '8px 24px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {[...threads.entries()].map(([key, files], threadIndex) => (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '12px 0',
            borderTop: threadIndex === 0 ? undefined : '1px solid var(--fx-border-subtle)',
          }}
        >
          {files[0]?.mailSubject ? (
            <span
              style={{
                font: '500 11px/1 var(--fx-font-mono)',
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
                paddingBottom: 4,
              }}
            >
              {files[0].mailSubject}
              {files[0].mailFrom ? ` · from ${files[0].mailFrom}` : ''}
            </span>
          ) : null}

          {files.map((doc) => (
            <div
              key={doc.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 36 }}
            >
              <span style={{ font: '500 13.5px/1.3 var(--fx-font-sans)' }}>{doc.filename}</span>
              <Badge>unfiled</Badge>
              {claiming === doc.id ? (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'end', marginLeft: 'auto' }}>
                  <TextInput
                    label="File against PO"
                    mono
                    placeholder="PO-88203"
                    value={po}
                    onChange={(e) => setPo(e.target.value)}
                  />
                  <Button variant="ghost" disabled={pending} onClick={() => setClaiming(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pending || po.trim() === ''}
                    onClick={() => claim(doc.id)}
                  >
                    File it
                  </Button>
                </span>
              ) : (
                <span style={{ marginLeft: 'auto' }}>
                  <Button variant="ghost" onClick={() => { setClaiming(doc.id); setFailure(null) }}>
                    File against an order
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      <span
        style={{
          borderTop: '1px solid var(--fx-border-subtle)',
          paddingTop: 12,
          font: '400 12px/1.5 var(--fx-font-sans)',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        Nothing here was guessed onto an order — a wrong guess buried on the right order is
        invisible in a way an unfiled file is not. You file it; the trail records who.
      </span>
    </div>
  )
}
