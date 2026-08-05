'use client'

import type { ReactNode } from 'react'

import { MarbimMark } from './mark'

/**
 * The MARBIM surfaces.
 *
 * Two rules from the system prompt show up as UI here, not just as prose:
 * MARBIM never claims an action is done (it proposes, a human approves), and it
 * never states a number it did not read from a tool. So the tool strip is not
 * decoration — it is the citation, and it stays visible next to the answer.
 */

export type ToolStepState = 'done' | 'active' | 'pending' | 'failed'

export interface ToolStep {
  label: string
  meta?: string
  state: ToolStepState
}

/** What MARBIM read, in the order it read it. Three slashes fill as each step lands. */
export function ToolStrip({ steps, footer }: { steps: readonly ToolStep[]; footer?: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        overflow: 'hidden',
        background: 'var(--fx-bg-surface)',
      }}
    >
      {steps.map((step, i) => {
        const colour =
          step.state === 'failed'
            ? 'var(--fx-danger)'
            : step.state === 'pending'
              ? 'var(--fx-text-tertiary)'
              : 'var(--fx-text-primary)'

        return (
          <div
            key={`${step.label}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 11,
              padding: '11px 13px',
              borderBottom: '1px solid var(--fx-border-subtle)',
            }}
          >
            <span
              style={{
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                flexShrink: 0,
                // Match the label's first-line cap height so the slashes sit level.
                height: '1.4em',
                marginTop: 1,
              }}
            >
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  style={{
                    width: 2,
                    height: 12,
                    transform: 'skewX(var(--fx-slash-angle))',
                    background:
                      step.state === 'done'
                        ? 'var(--fx-accent)'
                        : step.state === 'active' && k === 0
                          ? 'var(--fx-accent)'
                          : step.state === 'failed'
                            ? 'var(--fx-danger)'
                            : 'var(--fx-border-default)',
                  }}
                />
              ))}
            </span>
            {/* Column, not a row fight: a long nowrap meta was crushing the label
                (minWidth:0 + flex-shrink) into a one-word-wide stack and then
                painting over it with overflow:visible. */}
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span style={{ font: "500 12.5px/1.4 var(--fx-font-mono)", color: colour }}>
                {step.label}
              </span>
              {step.meta ? (
                <span
                  style={{
                    font: "400 11.5px/1.35 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {step.meta}
                </span>
              ) : null}
            </span>
          </div>
        )
      })}
      {footer ? (
        <div
          style={{
            padding: '10px 13px',
            font: "400 11.5px/1.4 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/** The assistant's prose. The amber caret is the only amber in a streaming view. */
export function AnswerText({ children, streaming }: { children: ReactNode; streaming?: boolean }) {
  return (
    <div
      style={{
        font: "400 15px/1.6 var(--fx-font-sans)",
        color: 'var(--fx-text-primary)',
        textWrap: 'pretty',
      }}
    >
      {children}
      {streaming ? (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 2,
            height: 15,
            background: 'var(--fx-accent)',
            marginLeft: 3,
            verticalAlign: -2,
            animation: 'fx-caret 1s steps(1) infinite',
          }}
        />
      ) : null}
    </div>
  )
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          background: 'var(--fx-bg-sunken)',
          borderRadius: '14px 14px 4px 14px',
          padding: '13px 17px',
          font: "400 15px/1.55 var(--fx-font-sans)",
          color: 'var(--fx-text-primary)',
          maxWidth: '72%',
          textWrap: 'pretty',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * A structured result beside the prose — the one card in the group, so it takes
 * the cut corner. Rows carry a selvage because each is a verdict.
 */
export function AnswerCard({
  kicker,
  title,
  children,
  actions,
}: {
  kicker: ReactNode
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      className="fx-cut"
      style={{
        border: '1px solid var(--fx-border-subtle)',
        background: 'var(--fx-bg-surface)',
        boxShadow: 'var(--fx-sh1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderBottom: '1px solid var(--fx-border-subtle)',
        }}
      >
        <div
          style={{
            font: "400 11px/1 var(--fx-font-mono)",
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {kicker}
        </div>
        <div style={{ font: "600 16px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-primary)' }}>
          {title}
        </div>
      </div>
      {children}
      {actions ? (
        <div
          style={{
            padding: '13px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** One changed line inside an answer card: name, struck-through old, new. */
export function AnswerCardRow({
  name,
  from,
  to,
  tone = 'warning',
}: {
  name: ReactNode
  from: ReactNode
  to: ReactNode
  tone?: 'success' | 'warning' | 'danger'
}) {
  const colour = `var(--fx-${tone})`
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--fx-border-subtle)' }}>
      <div style={{ width: 3, flexShrink: 0, background: colour }} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 84px 84px',
          gap: 10,
          padding: '11px 14px',
          alignItems: 'center',
        }}
      >
        <span style={{ font: "500 13.5px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-primary)' }}>
          {name}
        </span>
        <span
          data-numeric
          style={{
            font: "400 12.5px/1.3 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
            textDecoration: 'line-through',
          }}
        >
          {from}
        </span>
        <span
          data-numeric
          style={{ font: `500 12.5px/1.3 var(--fx-font-mono)`, color: colour, textAlign: 'right' }}
        >
          {to}
        </span>
      </div>
    </div>
  )
}

/** Role-scoped starting points. Absent tools are absent, never disabled. */
export function SuggestedPrompts({
  label,
  prompts,
  onPick,
}: {
  label: ReactNode
  prompts: readonly string[]
  onPick: (p: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div
        style={{
          font: "400 11px/1 var(--fx-font-mono)",
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            style={{
              background: 'transparent',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-full)',
              padding: '10px 14px',
              font: "500 12.5px/1.3 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
              cursor: 'pointer',
              minHeight: 'var(--fx-tap-min)',
              textAlign: 'left',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A refusal. The mark desaturates and holds — MARBIM does not animate when it
 * has nothing to say — and the copy names what it CAN read instead of stopping
 * at "no".
 */
export function RefusalNotice({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        padding: 16,
        display: 'flex',
        gap: 12,
        background: 'var(--fx-bg-surface)',
      }}
    >
      <MarbimMark state="blocked" size={24} label={null} />
      <div
        style={{
          font: "400 14px/1.6 var(--fx-font-sans)",
          color: 'var(--fx-text-secondary)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * A run that died mid-answer. It says which part of what is above survived,
 * because a partial answer presented as whole is how somebody acts on the half
 * that was never checked.
 */
export function PartialAnswerNotice({
  trusted,
  untrusted,
  runId,
  onRetry,
}: {
  trusted: ReactNode
  untrusted: ReactNode
  runId?: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--fx-danger)',
        borderRadius: 'var(--fx-radius-md)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--fx-bg-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--fx-radius-full)',
            background: 'var(--fx-danger)',
            flexShrink: 0,
          }}
        />
        <span style={{ font: "600 14.5px/1.3 var(--fx-font-sans)" }}>
          I lost the connection halfway through
        </span>
      </div>
      <div
        style={{
          font: "400 13.5px/1.55 var(--fx-font-sans)",
          color: 'var(--fx-text-secondary)',
          textWrap: 'pretty',
        }}
      >
        {trusted} {untrusted}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {onRetry ? (
          <button
            onClick={onRetry}
            style={{
              background: 'transparent',
              color: 'var(--fx-text-primary)',
              border: '1px solid var(--fx-border-default)',
              borderRadius: 'var(--fx-radius-md)',
              padding: '11px 15px',
              font: "600 13.5px/1 var(--fx-font-sans)",
              cursor: 'pointer',
              minHeight: 'var(--fx-tap-min)',
            }}
          >
            Ask again
          </button>
        ) : null}
        {runId ? (
          <span style={{ font: "400 11.5px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {runId}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Neutral until 90%, then warning — not amber. Amber is never a status. */
export function UsageMeter({ used, total, unit = 'ctx' }: { used: number; total: number; unit?: string }) {
  // `total` here is a context-window token budget, not money: the rule matches the NAME,
  // and this meter never sees a currency.
  // eslint-disable-next-line fabricxai/no-float-money
  const pct = Math.round((used / total) * 100)
  const high = pct >= 90
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: "400 13px/1 var(--fx-font-mono)",
          color: 'var(--fx-text-secondary)',
        }}
      >
        <span data-numeric>
          {used.toLocaleString()} / {total.toLocaleString()} {unit}
        </span>
        <span data-numeric style={{ color: high ? 'var(--fx-warning)' : undefined }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 'var(--fx-radius-full)',
          background: 'var(--fx-bg-sunken)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: high ? 'var(--fx-warning)' : 'var(--fx-text-primary)',
          }}
        />
      </div>
    </div>
  )
}
