/**
 * The drawer frame — runbook §2.2, in the order the runbook fixes.
 *
 * Geometry from src/components/fx/feedback.tsx `Drawer`: right-anchored, radius-lg on
 * the leading edge only, 22px/26px header padding, 26px body, 18px/26px footer, sh3.
 * Everything the runbook ADDS to that primitive — the selvage rim, the identity line,
 * the figure, the tabs, the gate strip — is drawn here so S1–S15 inherit one shape.
 */
import { SANS, MONO, statusLabel, mono, btn } from './_kit.mjs'

const STRIPE = {
  'on-track': 'var(--fx-success)', 'at-risk': 'var(--fx-warning)',
  late: 'var(--fx-danger)', done: 'var(--fx-border-strong)', neutral: 'var(--fx-border-strong)',
}

export function drawer({
  width = 560, height, status = 'on-track', critical = false,
  code, who, statusText, tabs = [], active = 0, figure, body,
  gate, footer, readOnly, scrim = true, part,
}) {
  const p = (n, label) => part ? `<span style="position: absolute; left: -34px; margin-top: 2px; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 999px; background: var(--fx-text-primary); color: var(--fx-text-inverse); font: 600 12px/1 ${MONO};" title="${label}">${n}</span>` : ''

  return `<aside style="position: relative; width: ${width}px; ${height ? `height: ${height}px;` : ''} flex-shrink: 0; background: var(--fx-bg-surface); border-left: 1px solid var(--fx-border-subtle); border-radius: 14px 0 0 14px; box-shadow: var(--fx-sh3); display: flex; flex-direction: column; overflow: hidden;">

  <!-- 1 · header: the status rim, the identity line, the one number -->
  <div style="display: flex; align-items: stretch;">
    <div style="width: ${critical ? 5 : 3}px; flex-shrink: 0; background: ${STRIPE[status]};"></div>
    <div style="flex: 1; min-width: 0; padding: 22px 26px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; flex-direction: column; gap: 14px;">
      ${p(1, 'Header')}
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;">
        <div style="display: flex; flex-direction: column; gap: 7px; min-width: 0;">
          <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
            ${mono(code, { size: 15, weight: 500 })}
            <span style="font: 400 14px/1.3 ${SANS}; color: var(--fx-text-secondary);">${who}</span>
          </div>
          ${statusText ? statusLabel(status === 'neutral' ? 'done' : status, statusText) : ''}
        </div>
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; color: var(--fx-text-secondary); font: 400 15px/1 ${SANS}; flex-shrink: 0;">✕</span>
      </div>
      ${figure ? `<div style="position: relative; background: var(--fx-bg-sunken); border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
        ${p(2, 'The one number')}
        <div style="font: 500 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; color: var(--fx-text-tertiary);">${figure.label}</div>
        <div style="display: flex; align-items: baseline; gap: 6px;">
          <span data-numeric style="font: 600 30px/1.05 ${SANS}; letter-spacing: -.02em; color: ${figure.tone ?? 'var(--fx-text-primary)'};">${figure.value}</span>
          ${figure.unit ? `<span style="font: 400 14px/1 ${MONO}; color: var(--fx-text-tertiary);">${figure.unit}</span>` : ''}
        </div>
        <div style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary);">${figure.basis}</div>
      </div>` : ''}
    </div>
  </div>

  ${tabs.length ? `<div style="position: relative; display: flex; gap: 4px; padding: 0 26px; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
    ${p(3, 'Tabs')}
    ${tabs.map((tab, i) => `<span style="padding: 13px 12px; font: ${i === active ? '600' : '500'} 13.5px/1 ${SANS}; color: ${i === active ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)'}; border-bottom: 2px solid ${i === active ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${tab}</span>`).join('')}
  </div>` : ''}

  <div style="position: relative; flex: 1; min-height: 0; padding: 26px; overflow: hidden; display: flex; flex-direction: column; gap: 18px;">
    ${p(4, 'Body')}
    ${readOnly ? readOnlyNote(readOnly) : ''}
    ${body}
  </div>

  ${gate ? `<div style="position: relative; padding: 16px 26px; border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-sunken); display: flex; flex-direction: column; gap: 10px;">
    ${p(5, 'Gate strip')}
    <div style="font: 500 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; color: var(--fx-text-tertiary);">Before the next action</div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">${gate}</div>
  </div>` : ''}

  ${footer === null ? '' : `<div style="position: relative; padding: 18px 26px; border-top: 1px solid var(--fx-border-subtle); display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
    ${p(6, 'Footer')}
    ${footer ?? ''}
  </div>`}
</aside>`
}

/** A gate's live state, drawn BEFORE the button it guards. */
export const gateChip = (state, label) => {
  const skin = {
    pass: ['var(--fx-success)', '✓'],
    fail: ['var(--fx-danger)', '✕'],
    warn: ['var(--fx-warning)', '!'],
    idle: ['var(--fx-text-tertiary)', '–'],
  }[state]
  return `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 999px; border: 1px solid ${skin[0]}; background: var(--fx-bg-surface); font: 500 12px/1 ${MONO}; color: var(--fx-text-primary);">
    <span style="color: ${skin[0]};">${skin[1]}</span>${label}</span>`
}

/** feedback.tsx ReadOnlyNote, verbatim copy. */
export const readOnlyNote = (what) =>
  `<div style="display: flex; align-items: baseline; gap: 10px; padding: 9px 14px; border-radius: 4px; border: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
    <span style="font: 500 11px/1.3 ${MONO}; text-transform: uppercase; letter-spacing: .06em; color: var(--fx-text-tertiary); flex-shrink: 0;">Read only</span>
    <span style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary);">Your role can read ${what} but not change it. Ask an owner or admin if you need to.</span>
  </div>`

/** A footer button that is present but not available, with the sentence why. */
export const withheld = (label, why) =>
  `<div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
    <span style="font: 400 12.5px/1.45 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${why}</span>
  </div>${btn('off', label)}`

/** The row a drawer uses for a linked record — clicking navigates, never a second drawer. */
export const linkRow = (code, text, hint) =>
  `<div style="display: flex; align-items: center; gap: 12px; padding: 11px 13px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface);">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
      <span style="display: flex; align-items: baseline; gap: 8px;">${mono(code, { size: 12.5 })}<span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-primary);">${text}</span></span>
      ${hint ? `<span style="font: 400 12px/1.4 ${SANS}; color: var(--fx-text-tertiary);">${hint}</span>` : ''}
    </div>
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink: 0;"><path d="M5.5 2.5L11 8l-5.5 5.5" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/></svg>
  </div>`

/** History, as sentences. Person + time + what changed. */
export const history = (rows) =>
  `<div style="display: flex; flex-direction: column; gap: 0;">
    ${rows.map((r) => `<div style="display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--fx-border-subtle);">
      <span style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary); width: 96px; flex-shrink: 0;">${r[0]}</span>
      <span style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary); flex: 1; text-wrap: pretty;">${r[1]}</span>
    </div>`).join('')}
  </div>`

/** The scrim the drawer sits on — weave at 5%, per feedback.tsx. */
export const scrimStyle = 'background-color: rgba(24,29,41,.45); background-image: repeating-linear-gradient(146deg, transparent 0 7px, rgba(255,255,255,.05) 7px 9px, transparent 9px 17px);'
