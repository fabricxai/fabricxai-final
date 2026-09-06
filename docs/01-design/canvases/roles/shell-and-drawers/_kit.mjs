/**
 * Emits the S0 artboards for `FabricX Role — Shell and Drawers`.
 *
 * The chrome (rail, top bar, drawer frame) is drawn ONCE here and reused by every
 * artboard, because the runbook's whole point is that S1–S15 compose themselves from
 * these. Values are lifted from src/app/theme.css and the fx components — never rounded.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const files = []
const emit = (name, source) => { files.push(name); writeFileSync(join(OUT, name), source) }

/* ── Tokens, straight out of theme.css ─────────────────────────────────────── */

const LIGHT = {
  canvas: '#FBFAF8', surface: '#FFFFFF', raised: '#FFFFFF', sunken: '#F3F1EC',
  hover: 'rgba(24,29,41,.035)', selected: 'rgba(225,179,52,.12)',
  subtle: '#E7E4DE', line: '#D6D2C9', strong: '#A9A49A',
  primary: '#181D29', secondary: '#4C5364', tertiary: '#5E6675', disabled: '#A8AEBB',
  inverse: '#FBFAF8',
  accent: '#E1B334', accentHover: '#CFA22B', accentPressed: '#B88C21',
  accentSubtle: '#FAF1DA', accentOn: '#181D29',
  success: '#2F7D5B', warning: '#8C5A16', danger: '#B23A32', info: '#2F5FA8',
  focus: '#181D29',
  sh1: '0 1px 2px rgba(24,29,41,.06)', sh2: '0 4px 12px rgba(24,29,41,.08)',
  sh3: '0 12px 32px rgba(24,29,41,.12)',
  mark: 'i', lockup: 'fabricxai-logo-light.png', composite: 'marbim-logo-ink.png',
}

const DARK = {
  canvas: '#0F131B', surface: '#181D29', raised: '#212736', sunken: '#0B0E15',
  hover: 'rgba(255,255,255,.05)', selected: 'rgba(225,179,52,.17)',
  subtle: '#252B3A', line: '#343B4C', strong: '#4E576B',
  primary: '#F4F3F0', secondary: '#AEB5C4', tertiary: '#7D8597', disabled: '#565E71',
  inverse: '#181D29',
  accent: '#E1B334', accentHover: '#EBC352', accentPressed: '#F2D077',
  accentSubtle: 'rgba(225,179,52,.14)', accentOn: '#181D29',
  success: '#4FA97D', warning: '#D99A3F', danger: '#E0665C', info: '#6D9BE8',
  focus: '#E1B334',
  sh1: 'none', sh2: '0 6px 20px rgba(0,0,0,.45)', sh3: '0 18px 44px rgba(0,0,0,.55)',
  mark: 'w', lockup: 'fabricxai-logo-dark.png', composite: 'marbim-logo.png',
}

const vars = (t) => [
  `--fx-bg-canvas:${t.canvas}`, `--fx-bg-surface:${t.surface}`, `--fx-bg-raised:${t.raised}`,
  `--fx-bg-sunken:${t.sunken}`, `--fx-bg-hover:${t.hover}`, `--fx-bg-selected:${t.selected}`,
  `--fx-border-subtle:${t.subtle}`, `--fx-border-default:${t.line}`, `--fx-border-strong:${t.strong}`,
  `--fx-text-primary:${t.primary}`, `--fx-text-secondary:${t.secondary}`,
  `--fx-text-tertiary:${t.tertiary}`, `--fx-text-disabled:${t.disabled}`,
  `--fx-text-inverse:${t.inverse}`,
  `--fx-accent:${t.accent}`, `--fx-accent-hover:${t.accentHover}`,
  `--fx-accent-pressed:${t.accentPressed}`, `--fx-accent-subtle:${t.accentSubtle}`,
  `--fx-accent-on:${t.accentOn}`,
  `--fx-success:${t.success}`, `--fx-warning:${t.warning}`, `--fx-danger:${t.danger}`,
  `--fx-info:${t.info}`, `--fx-focus:${t.focus}`,
  `--fx-sh1:${t.sh1}`, `--fx-sh2:${t.sh2}`, `--fx-sh3:${t.sh3}`,
  '--fx-slash-angle:-34deg', '--fx-weave-angle:146deg', '--fx-thread-angle:115deg',
].join('; ')

const SANS = `'Plus Jakarta Sans', system-ui, sans-serif`
const MONO = `'JetBrains Mono', ui-monospace, monospace`
const BANGLA = `'Anek Bangla', 'Noto Sans Bengali', sans-serif`

/* ── The .dc.html envelope ─────────────────────────────────────────────────── */

const CSS = (t) => `
  body { margin: 0; background: ${t.canvas}; -webkit-font-smoothing: antialiased; }
  * { box-sizing: border-box; }
  a { color: ${t.primary}; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
  a:hover { color: ${t.accentPressed}; }
  .tabular, [data-numeric] { font-variant-numeric: tabular-nums; }
  .fx-selvage { display: flex; align-items: stretch; overflow: hidden; }
  .fx-selvage::before { content: ''; flex-shrink: 0; width: 3px; background: ${t.strong}; }
  .fx-selvage[data-status="on-track"]::before { background: ${t.success}; }
  .fx-selvage[data-status="at-risk"]::before { background: ${t.warning}; }
  .fx-selvage[data-status="late"]::before { background: ${t.danger}; }
  .fx-selvage[data-status="done"]::before { background: ${t.strong}; }
  .fx-selvage[data-critical="true"]::before { width: 5px; }
  .fx-thread-rule { height: 9px; background-image: repeating-linear-gradient(115deg, ${t.accent} 0 2px, transparent 2px 9px); }
  .fx-thread-rule[data-variant="muted"] { height: 7px; background-image: repeating-linear-gradient(115deg, ${t.line} 0 2px, transparent 2px 9px); }
  .fx-weave { background-image: repeating-linear-gradient(146deg, transparent 0 7px, ${t.subtle} 7px 9px, transparent 9px 17px); }
  .fx-cut { clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%); border-radius: 8px; }
  .fx-cut-chip { clip-path: polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px)); }
  @keyframes fx-spread { to { transform: translate(calc(var(--dx) * 6%), calc(var(--dy) * 6%)); } }
  @keyframes fx-converge { 0% { transform: translate(calc(var(--dx) * 26%), calc(var(--dy) * 26%)) scale(.82); opacity: 0; } 62% { transform: translate(0, 0) scale(1.15); opacity: 1; } 100% { transform: translate(0, 0) scale(1); opacity: 1; } }
  @keyframes fx-orbit { 0%, 100% { transform: rotate(-13deg); opacity: .45; } 50% { transform: rotate(13deg); opacity: 1; } }
  @keyframes fx-travel { 0% { transform: translate(-10%, 10%); opacity: .25; } 40% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(10%, -10%); opacity: .25; } }
  @keyframes fx-breathe { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(calc(var(--dx) * 3.5%), calc(var(--dy) * 3.5%)); } }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`

function board({ w, h, mode = 'light', bangla = false, body, pad = 0, bg }) {
  const t = mode === 'dark' ? DARK : LIGHT
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Anek+Bangla:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${CSS(t)}</style>
</helmet>

<div style="${vars(t)}; width: ${w}px; min-height: ${h}px; background: ${bg ?? 'var(--fx-bg-canvas)'}; color: var(--fx-text-primary); font-family: ${bangla ? BANGLA : SANS}; font-size: 16px; line-height: ${bangla ? '1.7' : '1.55'}; padding: ${pad}px; display: flex; flex-direction: column;">
${body}
</div>
</x-dc>
</body>
</html>
`
}

/* ── Signature elements and small primitives ───────────────────────────────── */

/** The mark, static. Eight strokes exist for animation; rest is the composite asset. */
const mark = (size, t, { state = 'rest' } = {}) => {
  if (state === 'rest' || state === 'blocked') {
    const dim = state === 'blocked' ? 'filter: grayscale(1); opacity: .5; ' : ''
    return `<img src="${t.composite}" alt="" style="${dim}width: ${size}px; height: ${size}px; display: block; flex-shrink: 0;" />`
  }
  const SLASH = [[-0.896, 0.444], [-0.271, 0.963], [-0.97, -0.243], [0.415, 0.91],
                 [-0.512, -0.859], [0.936, 0.352], [0.282, -0.96], [0.908, -0.419]]
  const anim = (i) => ({
    awake: `fx-spread 220ms cubic-bezier(.2,.8,.2,1) ${i * 30}ms 1 forwards`,
    listening: `fx-breathe 2.4s ease-in-out ${-i * 150}ms infinite`,
    thinking: `fx-orbit 1.4s ease-in-out ${-i * 90}ms infinite`,
    streaming: `fx-travel .8s ease-in-out ${-i * 90}ms infinite`,
    resolved: `fx-converge 440ms cubic-bezier(.2,.8,.2,1) ${i * 35}ms 1 forwards`,
  })[state]
  return `<span style="position: relative; display: inline-block; width: ${size}px; height: ${size}px; flex-shrink: 0;">${
    SLASH.map(([dx, dy], i) => `<img src="${t.mark}-${i + 1}.png" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; --dx: ${dx}; --dy: ${dy}; transform-origin: center; animation: ${anim(i)};" />`).join('')
  }</span>`
}

/** Three 2px strokes at the wordmark's 34deg. */
const slashes = (t, { accent = false, h = 14, count = 3 } = {}) =>
  `<span style="display: flex; gap: 4px; transform: skewX(-34deg);">${
    Array.from({ length: count }, () => `<i style="display: block; width: 2px; height: ${h}px; background: ${accent ? 'var(--fx-accent)' : 'var(--fx-border-default)'};"></i>`).join('')
  }</span>`

const thread = (variant = 'accent') => `<div class="fx-thread-rule" data-variant="${variant}"></div>`

const STATUS_COLOUR = { 'on-track': 'var(--fx-success)', 'at-risk': 'var(--fx-warning)', late: 'var(--fx-danger)', done: 'var(--fx-text-tertiary)' }

const statusLabel = (status, text) =>
  `<span style="font: 500 11px/1 ${MONO}; letter-spacing: .05em; text-transform: uppercase; color: ${STATUS_COLOUR[status]};">${text}</span>`

const eyebrow = (text, size = 11) =>
  `<div style="font: 500 ${size}px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; color: var(--fx-text-tertiary);">${text}</div>`

const mono = (text, { size = 13, colour = 'var(--fx-text-primary)', weight = 500 } = {}) =>
  `<span data-numeric style="font: ${weight} ${size}px/1.3 ${MONO}; color: ${colour};">${text}</span>`

const BADGE_TONE = {
  neutral: ['var(--fx-text-tertiary)', 'transparent'], success: ['var(--fx-success)', 'transparent'],
  warning: ['var(--fx-warning)', 'transparent'], danger: ['var(--fx-danger)', 'transparent'],
  info: ['var(--fx-info)', 'transparent'], accent: ['var(--fx-accent-on)', 'var(--fx-accent-subtle)'],
}
const badge = (tone, text, { cut = false } = {}) => {
  const [fg, bg] = BADGE_TONE[tone]
  return `<span class="${cut ? 'fx-cut-chip' : ''}" style="display: inline-block; font: 500 11px/1 ${MONO}; letter-spacing: .05em; text-transform: uppercase; color: ${fg}; background: ${bg}; border: 1px solid ${bg === 'transparent' ? 'var(--fx-border-subtle)' : 'transparent'}; border-radius: ${cut ? '0' : '4px'}; padding: 5px 8px;">${text}</span>`
}

const BTN_PAD = { sm: '8px 14px', md: '10px 18px', lg: '13px 22px' }
const BTN_FONT = { sm: 13, md: 14, lg: 15 }
const BTN_SKIN = {
  primary: 'background: var(--fx-accent); color: var(--fx-accent-on); border: none;',
  ink: 'background: var(--fx-text-primary); color: var(--fx-text-inverse); border: none;',
  secondary: 'background: transparent; color: var(--fx-text-primary); border: 1px solid var(--fx-border-default);',
  ghost: 'background: transparent; color: var(--fx-text-primary); border: 1px solid transparent;',
  danger: 'background: var(--fx-danger); color: #FFFFFF; border: none;',
  off: 'background: transparent; color: var(--fx-text-disabled); border: 1px solid var(--fx-border-subtle);',
}
const btn = (variant, text, { size = 'md', tap = 36, full = false } = {}) =>
  `<button style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: ${BTN_PAD[size]}; font: 600 ${BTN_FONT[size]}px/1 ${SANS}; min-height: ${tap}px; ${full ? 'width: 100%;' : ''} ${BTN_SKIN[variant]} cursor: pointer;">${text}</button>`

/**
 * Two kbd treatments, because the product has two.
 *
 * `kbd` is primitives.tsx's `Kbd` and the approve inbox's inlined copy of it — radius-sm,
 * 11px, 5/7 padding. `kbdCap` is the shortcuts sheet's own, which is a physical key: 26px
 * square, 12px, a 2px bottom border, and a 5px radius that is NOT a token. The sheet is
 * drawn as it is built; the mismatch is reported, not quietly normalised.
 */
const kbd = (text) =>
  `<kbd style="font: 500 11px/1 ${MONO}; background: var(--fx-bg-sunken); border: 1px solid var(--fx-border-subtle); border-radius: 4px; padding: 5px 7px; color: var(--fx-text-secondary);">${text}</kbd>`

const kbdCap = (text) =>
  `<kbd style="display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 7px; font: 500 12px/1 ${MONO}; background: var(--fx-bg-surface); border: 1px solid var(--fx-border-default); border-bottom-width: 2px; border-radius: 5px; color: var(--fx-text-secondary);">${text}</kbd>`

const avatar = (initials, size = 30) =>
  `<span style="width: ${size}px; height: ${size}px; border-radius: 999px; background: var(--fx-bg-sunken); border: 2px solid var(--fx-bg-surface); display: inline-flex; align-items: center; justify-content: center; font: 600 ${Math.round(size * 0.38)}px/1 ${SANS}; color: var(--fx-text-secondary); flex-shrink: 0;">${initials}</span>`

/** label left, value right — tna.tsx's FactPair. */
const fact = (label, value) =>
  `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px solid var(--fx-border-subtle);">
    <span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
    <span style="font: 500 14px/1.4 ${SANS}; color: var(--fx-text-primary); text-align: right;">${value}</span>
  </div>`

/** Ten slashes. Below 0.90 the fill turns warning. */
const confidence = (v) => {
  if (v === null) return `<span style="font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-tertiary);">unscored</span>`
  const filled = Math.round(v * 10)
  const low = v < 0.9
  const colour = low ? 'var(--fx-warning)' : 'var(--fx-accent)'
  return `<span style="display: inline-flex; align-items: center; gap: 8px;">
    <span data-numeric style="font: 500 13px/1.2 ${MONO}; color: ${low ? 'var(--fx-warning)' : 'var(--fx-text-primary)'};">${v.toFixed(2)}</span>
    <span style="display: flex; gap: 4px; align-items: center;">${
      Array.from({ length: 10 }, (_, i) => `<span style="width: 2px; height: 12px; flex-shrink: 0; transform: skewX(-34deg); background: ${i < filled ? colour : 'var(--fx-border-default)'};"></span>`).join('')
    }</span></span>`
}

/** A canvas-only caption. Never product chrome — it explains the artboard. */
const note = (text) =>
  `<div style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary); padding: 10px 0 0; max-width: 70ch; text-wrap: pretty;">${text}</div>`

const caption = (text) =>
  `<div style="font: 500 11px/1.45 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary); padding-bottom: 10px;">${text}</div>`

export { LIGHT, DARK, SANS, MONO, BANGLA, board, mark, slashes, thread, statusLabel, eyebrow,
         mono, badge, btn, kbd, kbdCap, avatar, fact, confidence, note, caption, emit, files, OUT,
         STATUS_COLOUR, vars }
