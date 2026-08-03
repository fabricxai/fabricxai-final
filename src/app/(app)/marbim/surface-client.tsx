'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import {
  AnswerText,
  PartialAnswerNotice,
  SuggestedPrompts,
  ToolStrip,
  UserBubble,
  type ToolStep,
} from '@/components/fx/ai'
import { EmptyState } from '@/components/fx/feedback'
import { MarbimMark, type MarkState } from '@/components/fx/mark'
import { ask } from '@/modules/marbim/actions'

import { AttachControl, type Attachment } from './attach-client'

interface Turn {
  id: string
  question: string
  answer: string | null
  toolSteps: ToolStep[]
  failed: boolean
  /** `marbim-large · 4 tools · 2.4 s` in the canvas — the run's receipt. */
  receipt: string | null
}

/**
 * The line under a tool strip: which model, how many tools, how long.
 *
 * Named after what it is — a receipt for a run somebody is about to act on. The model is
 * whatever actually answered, never a fixed product name: an answer captioned with a model
 * that did not produce it is worse than no caption.
 */
function receiptOf(model: string, toolCount: number, durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(1)
  const tools = toolCount === 1 ? '1 tool' : `${toolCount} tools`
  return `${model} · ${tools} · ${seconds} s`
}

/**
 * The conversation surface.
 *
 * The mark carries the request state — listening while the composer has focus,
 * thinking between send and first token, resolved when the answer lands. It is
 * the only loading affordance on this screen.
 */
export function MarbimSurface({
  conversationId,
  suggestions,
  packLabel,
  readOnly,
  fromModule,
  floatingMark = true,
  autoFocus = false,
}: {
  conversationId: string
  suggestions: readonly string[]
  packLabel: string
  readOnly: boolean
  /**
   * The screen this was opened from, so the answer leads with that department's primer
   * instead of all twenty-one. The page has no single module; the slide-over does.
   */
  fromModule?: string
  /**
   * The page pins the mark to the viewport corner. Inside the slide-over that would place
   * it over the screen behind the panel — the mark belongs to the surface, not the window —
   * so the panel renders its own in the header instead.
   */
  floatingMark?: boolean
  autoFocus?: boolean
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [mark, setMark] = useState<MarkState>('rest')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // The slide-over opens because somebody wants to type. Landing the caret in the composer
  // is the difference between a panel and a panel you have to click into first.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function send(question: string) {
    const text = question.trim()
    if (!text || pending) return

    const turnIndex = turns.length
    const localId = `${conversationId}:${turnIndex}`

    setDraft('')
    setTurns((t) => [
      ...t,
      {
        id: localId,
        question: text,
        answer: null,
        // Until tool packs are wired per module, the strip shows the one step
        // that is genuinely happening rather than inventing a plausible trace.
        toolSteps: [{ label: 'reading the department primers', state: 'active' }],
        failed: false,
        receipt: null,
      },
    ])
    setMark('thinking')

    startTransition(async () => {
      try {
        const result = await ask({ conversationId, turnIndex, question: text, fromModule })
        setTurns((t) =>
          t.map((turn) =>
            turn.id === localId
              ? {
                  ...turn,
                  answer: result.answer,
                  toolSteps: [
                    {
                      label: 'reading the department primers',
                      meta: Object.entries(result.primerVersions)
                        .map(([m, v]) => `${m} ${v}`)
                        .join(' · '),
                      state: 'done',
                    },
                    ...result.toolCalls.map((c): ToolStep => ({ label: c.name, state: 'done' })),
                  ],
                  receipt: receiptOf(result.model, result.toolCalls.length, result.durationMs),
                }
              : turn,
          ),
        )
        setMark('resolved')
        setTimeout(() => setMark('rest'), 900)
      } catch {
        setTurns((t) =>
          t.map((turn) => (turn.id === localId ? { ...turn, failed: true } : turn)),
        )
        setMark('blocked')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 880 }}>
      {turns.length === 0 ? (
        <EmptyState
          title="Ask about an order, a line, or a date"
          body="MARBIM reads what your role can already read. It proposes changes for you to approve — it never writes to this factory itself."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {turns.map((turn) => (
            <div key={turn.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <UserBubble>{turn.question}</UserBubble>

              <div style={{ display: 'flex', gap: 14 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--fx-radius-full)',
                    background: 'var(--fx-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MarbimMark
                    state={turn.answer || turn.failed ? 'rest' : 'thinking'}
                    size={20}
                    label={null}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, flex: 1 }}>
                  <ToolStrip
                    steps={turn.toolSteps}
                    footer={turn.receipt ?? 'MARBIM states no number it did not read from a tool.'}
                  />

                  {turn.failed ? (
                    <PartialAnswerNotice
                      trusted="Nothing above was written."
                      untrusted="The run stopped before it produced an answer, so there is nothing here to act on."
                      onRetry={() => send(turn.question)}
                    />
                  ) : turn.answer ? (
                    <AnswerText>{turn.answer}</AnswerText>
                  ) : (
                    <AnswerText streaming>{''}</AnswerText>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {turns.length === 0 ? (
        <SuggestedPrompts label={packLabel} prompts={suggestions} onPick={send} />
      ) : null}

      <div
        style={{
          border: '1px solid var(--fx-border-default)',
          borderRadius: 'var(--fx-radius-lg)',
          background: 'var(--fx-bg-surface)',
          padding: '13px 15px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={2}
          onFocus={() => {
            setFocused(true)
            if (mark === 'rest') setMark('listening')
          }}
          onBlur={() => {
            setFocused(false)
            if (mark === 'listening') setMark('rest')
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
          placeholder="Ask about an order, a line, or a date…"
          aria-label="Ask MARBIM"
          style={{
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            color: 'var(--fx-text-primary)',
            font: "400 15px/1.5 var(--fx-font-sans)",
          }}
        />
        <AttachControl
          attachments={attachments}
          onAttach={(a) => setAttachments((list) => [...list, a])}
          onRemove={(id) => setAttachments((list) => list.filter((a) => a.documentId !== id))}
          disabled={readOnly}
        >
          <span
            style={{ font: "400 11.5px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
          >
            {readOnly ? 'read-only role · answers only' : 'proposes drafts · never writes'}
          </span>
          {/* The one amber moment on this screen. */}
          <button
            onClick={() => send(draft)}
            disabled={!draft.trim() || pending}
            aria-label="Send"
            style={{
              marginLeft: 'auto',
              width: 44,
              height: 44,
              borderRadius: 'var(--fx-radius-md)',
              background: draft.trim() && !pending ? 'var(--fx-accent)' : 'var(--fx-bg-sunken)',
              color:
                draft.trim() && !pending ? 'var(--fx-accent-on)' : 'var(--fx-text-disabled)',
              border: 'none',
              cursor: draft.trim() && !pending ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: "600 16px/1 var(--fx-font-sans)",
            }}
          >
            ↑
          </button>
        </AttachControl>
      </div>

      {/* Bottom-right, in whichever of its six states fits. */}
      {floatingMark ? (
        <div style={{ position: 'fixed', right: 28, bottom: 28, zIndex: 40 }}>
          <MarbimMark
            state={focused && mark === 'rest' ? 'listening' : mark}
            size={32}
            label={null}
          />
        </div>
      ) : null}
    </div>
  )
}
