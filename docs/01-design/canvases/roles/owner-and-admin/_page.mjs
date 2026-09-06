/**
 * Page furniture for S1, over S0's kit.
 *
 * S0 locked the chrome (`_kit` tokens and primitives, `_shell` rail and top bar, `_drawer`
 * the six-part frame). This file is the layer above it that S0's _build.mjs kept private —
 * the page body, the card, the list row, the figure tile. It belongs in the kit eventually;
 * it is here so S1 does not edit a committed S0 file to get at it.
 */
import { LIGHT, SANS, MONO, BANGLA, board, mark, slashes, eyebrow, mono, badge, btn, statusLabel }
  from '../shell-and-drawers/_kit.mjs'
import { rail, topBar, pageHeader } from '../shell-and-drawers/_shell.mjs'

export const bodyCol = (inner, { pad = '32px 48px 40px' } = {}) =>
  `<main style="flex: 1; min-width: 0; background: var(--fx-bg-canvas); padding: ${pad}; overflow: hidden;">
    <div style="max-width: 1280px; margin: 0 auto;">${inner}</div>
  </main>`

export const screen = ({ w = 1440, h, role = 'owner', phrase = 'Owner', who = 'MR', active,
                        collapsed = ['commercial', 'floor', 'oversight', 'system'], badges = {},
                        inner, bangla = false, markState = 'rest' }) =>
  board({
    w, h, bangla,
    body: `${topBar(LIGHT, { phrase, who, mark: mark(20, LIGHT, { state: markState }), bangla,
      search: bangla ? 'মডিউল, অর্ডার, বায়ার খুঁজুন…' : undefined })}
<div style="flex: 1; display: flex; min-height: 0;">
  ${rail(role, { active, collapsed, badges, bangla })}
  ${bodyCol(inner)}
</div>`,
  })

export const sectionHeading = (text, right, { bangla = false } = {}) =>
  `<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
    ${slashes(LIGHT, { accent: true, h: 15 })}
    <h2 style="font: 600 26px/${bangla ? '1.35' : '1.15'} ${bangla ? BANGLA : SANS}; letter-spacing: ${bangla ? '0' : '-.012em'}; margin: 0;">${text}</h2>
    ${right ? `<span style="margin-left: auto; font: ${bangla ? `400 12.5px/1.4 ${BANGLA}` : `500 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase`}; color: var(--fx-text-tertiary);">${right}</span>` : ''}
  </div>`

export const card = (inner, { pad = 0 } = {}) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); overflow: hidden; padding: ${pad}px;">${inner}</div>`

export const row = ({ status = 'on-track', critical = false, code, text, sub, meta, right, bangla = false }) =>
  `<div class="fx-selvage" data-status="${status}" ${critical ? 'data-critical="true"' : ''} style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 12px 18px; min-height: 44px;">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
          ${code ? mono(code, { size: 12.5 }) : ''}
          <span style="font: 400 14px/${bangla ? '1.7' : '1.45'} ${bangla ? BANGLA : SANS}; color: var(--fx-text-primary); text-wrap: pretty;">${text}</span>
        </div>
        ${sub ? `<span style="font: 400 12.5px/${bangla ? '1.7' : '1.45'} ${bangla ? BANGLA : SANS}; color: var(--fx-text-tertiary);">${sub}</span>` : ''}
      </div>
      ${meta ? `<span style="font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-tertiary); flex-shrink: 0;">${meta}</span>` : ''}
      ${right ?? ''}
    </div>
  </div>`

/** Every figure carries its denominator and its as-of. A bare number is not a figure. */
export const figureTile = ({ label, value, unit, basis, source, asOf, tone = 'var(--fx-text-primary)', unavailable }) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; min-width: 0;">
    ${eyebrow(label)}
    ${unavailable
      ? `<div style="font: 500 15px/1.35 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">unavailable — ${unavailable}</div>`
      : `<div style="display: flex; align-items: baseline; gap: 6px;">
          <span data-numeric style="font: 600 34px/1.05 ${SANS}; letter-spacing: -.02em; color: ${tone};">${value}</span>
          ${unit ? `<span style="font: 400 14px/1 ${MONO}; color: var(--fx-text-tertiary);">${unit}</span>` : ''}
        </div>`}
    <div style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${basis}</div>
    ${source ? `<div style="font: 400 11.5px/1.45 ${MONO}; color: var(--fx-text-tertiary);">${source}</div>` : ''}
    ${asOf ? `<div style="font: 400 11.5px/1.45 ${MONO}; color: var(--fx-text-tertiary);">as of ${asOf}</div>` : ''}
  </div>`

export const emptyState = (title, bodyText, action) =>
  `<div class="fx-weave" style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 34px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; background-color: var(--fx-bg-surface);">
    ${mark(48, LIGHT)}
    <div style="font: 600 17px/1.25 ${SANS};">${title}</div>
    <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); max-width: 52ch; text-wrap: pretty;">${bodyText}</div>
    ${action ?? ''}
  </div>`

export const note = (text) =>
  `<div style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary); padding: 12px 0 0; max-width: 76ch; text-wrap: pretty;">${text}</div>`

export const caption = (text) =>
  `<div style="font: 500 11px/1.45 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary); padding-bottom: 10px;">${text}</div>`

/** A refusal sentence drawn where the button would be — never a disabled control. */
export const refusalNote = (title, sentence) =>
  `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); padding: 18px 20px; display: flex; gap: 14px; align-items: flex-start;">
    ${mark(24, LIGHT, { state: 'blocked' })}
    <div style="display: flex; flex-direction: column; gap: 5px;">
      <span style="font: 600 14.5px/1.35 ${SANS};">${title}</span>
      <span style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${sentence}</span>
    </div>
  </div>`

/** A step in a flow: a numbered, reduced-fidelity panel. */
export const step = (n, title, inner, { w = 400, note: hint } = {}) =>
  `<div style="width: ${w}px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; background: var(--fx-text-primary); color: var(--fx-text-inverse); font: 600 11px/1 ${MONO};">${n}</span>
      <span style="font: 600 13.5px/1.3 ${SANS};">${title}</span>
    </div>
    <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); overflow: hidden; flex: 1;">${inner}</div>
    ${hint ? `<span style="font: 400 12px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${hint}</span>` : ''}
  </div>`

export const arrow = () =>
  `<div style="display: flex; align-items: center; padding: 0 4px; flex-shrink: 0; align-self: center;">
    <svg width="26" height="16" viewBox="0 0 26 16" fill="none"><path d="M0 8h22M16 2l6 6-6 6" stroke="var(--fx-border-strong)" stroke-width="1.5"/></svg>
  </div>`

/** A small facsimile of another desk's landing, as the owner sees it. */
export const deskCard = ({ route, desk, landing, inner, extra }) =>
  `<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0;">
    <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
      <span style="font: 600 13.5px/1.3 ${SANS};">${desk}</span>
      ${mono(route, { size: 11.5, colour: 'var(--fx-text-tertiary)' })}
    </div>
    <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); overflow: hidden; min-height: 128px;">${inner}</div>
    <span style="font: 400 11.5px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${extra ?? `The desk's own screen, unchanged. ${landing}`}</span>
  </div>`

export const miniRow = (status, text, meta) =>
  `<div class="fx-selvage" data-status="${status}" style="border-top: 1px solid var(--fx-border-subtle);">
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 9px 12px;">
      <span style="flex: 1; min-width: 0; font: 400 12.5px/1.4 ${SANS}; color: var(--fx-text-primary);">${text}</span>
      ${meta ? `<span style="font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary); flex-shrink: 0;">${meta}</span>` : ''}
    </div>
  </div>`
