'use client'

import { useEffect, useRef, useState } from 'react'

import { actionErrorMessage } from '@/lib/action-error'

import {
  documentLimits,
  humanBytes,
  uploadDocument,
  type DocumentLimits,
} from '@/lib/upload-document'

/**
 * The composer's ＋ attach (X.2 canvas).
 *
 * Two round trips with the bytes going straight to object storage in between — the app
 * server never sees the file. Reserve a row, PUT to the presigned URL, confirm. See
 * `app/api/documents/route.ts` for why it is a route rather than an action.
 *
 * **What this does NOT do**, and deliberately: it does not classify the file or turn it
 * into a draft. The canvas's drop-zone promises "I work out what it is first, then read it
 * — you never pick a type", and that classifier does not exist. The extraction pipeline
 * behind it is real (`queueExtraction` → `runQueuedExtractions` on the five-minute
 * schedule), but it needs to be told which module and which target table to draft into,
 * which is exactly the decision a classifier would make. Guessing would file a tech pack as
 * a buyer PO and put a wrong draft in somebody's approve inbox — a worse failure than an
 * upload that stops at "stored".
 *
 * So the file is uploaded, kept, and named in the conversation. Nothing further is claimed.
 */

export interface Attachment {
  documentId: string
  filename: string
  sizeBytes: number
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'failed'; message: string }

export function AttachControl({
  attachments,
  onAttach,
  onRemove,
  disabled,
  children,
}: {
  attachments: readonly Attachment[]
  onAttach: (a: Attachment) => void
  onRemove: (documentId: string) => void
  disabled?: boolean
  /**
   * The rest of the composer's action row — the policy line and the send button. They share
   * a row with ＋ attach in the canvas, and this component owns that row so the attached
   * files can sit ABOVE it without the caller having to know about upload state.
   */
  children?: React.ReactNode
}) {
  const [limits, setLimits] = useState<DocumentLimits | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  // From the server, so the button refuses exactly what the server would refuse.
  useEffect(() => {
    let cancelled = false
    void documentLimits().then((value) => {
      if (!cancelled) setLimits(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function upload(file: File) {
    setPhase({ kind: 'uploading', filename: file.name })
    try {
      const uploaded = await uploadDocument(file, {
        kind: 'marbim_attachment',
        moduleId: 'marbim',
        limits,
      })
      onAttach(uploaded)
      setPhase({ kind: 'idle' })
    } catch (error) {
      setPhase({
        kind: 'failed',
        message: actionErrorMessage(error, 'upload failed'),
      })
    }
  }

  return (
    <>
      {attachments.length > 0 || phase.kind !== 'idle' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {attachments.map((a) => (
            <span
              key={a.documentId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-sm)',
                padding: '6px 8px',
                background: 'var(--fx-bg-sunken)',
                font: "400 11.5px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              {a.filename} · {humanBytes(a.sizeBytes)}
              <button
                onClick={() => onRemove(a.documentId)}
                aria-label={`Remove ${a.filename}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--fx-text-tertiary)',
                  font: "400 12px/1 var(--fx-font-sans)",
                }}
              >
                ✕
              </button>
            </span>
          ))}

          {phase.kind === 'uploading' ? (
            <span
              style={{
                font: "400 11.5px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
                alignSelf: 'center',
              }}
            >
              uploading {phase.filename}…
            </span>
          ) : null}

          {phase.kind === 'failed' ? (
            // Named and retryable, never blank — the canvas's rule for every failure state.
            <span
              style={{
                font: "400 11.5px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-danger)',
                alignSelf: 'center',
              }}
            >
              {phase.message} · pick another file
            </span>
          ) : null}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        hidden
        accept={limits?.allowedMime.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset first: picking the same file twice in a row fires no change event at all.
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || phase.kind === 'uploading'}
          style={{
            background: 'transparent',
            border: '1px solid var(--fx-border-subtle)',
            borderRadius: 'var(--fx-radius-sm)',
            padding: '9px 11px',
            minHeight: 44,
            font: "500 12px/1 var(--fx-font-mono)",
            color: 'var(--fx-text-secondary)',
            cursor: phase.kind === 'uploading' ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ＋ attach
        </button>
        {children}
      </div>
    </>
  )
}
