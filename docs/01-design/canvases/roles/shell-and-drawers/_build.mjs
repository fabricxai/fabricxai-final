/** Emits every S0 artboard plus canvas.json. Run: node _build.mjs */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LIGHT, DARK, SANS, MONO, BANGLA, board, mark, slashes, thread, statusLabel, eyebrow, mono,
  badge, btn, kbd, kbdCap, avatar, fact, confidence, note, caption,
} from './_kit.mjs'
import { rail, topBar, pageHeader, NAV, RAILS, ICON } from './_shell.mjs'
import { drawer, gateChip, history, linkRow, readOnlyNote, withheld, scrimStyle } from './_drawer.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const made = []
const emit = (name, src) => { made.push(name); writeFileSync(join(OUT, name), src) }

/* ── shared page furniture ─────────────────────────────────────────────────── */

const body = (inner, { pad = '32px 48px 40px' } = {}) =>
  `<main style="flex: 1; min-width: 0; background: var(--fx-bg-canvas); padding: ${pad}; overflow: hidden;">
    <div style="max-width: 1280px; margin: 0 auto;">${inner}</div>
  </main>`

const sectionHeading = (text, right) =>
  `<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
    ${slashes(LIGHT, { accent: true, h: 15 })}
    <h2 style="font: 600 26px/1.15 ${SANS}; letter-spacing: -.012em; margin: 0; color: var(--fx-text-primary);">${text}</h2>
    ${right ? `<span style="margin-left: auto; font: 500 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; color: var(--fx-text-tertiary);">${right}</span>` : ''}
  </div>`

const card = (inner, { pad = 0 } = {}) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); overflow: hidden; padding: ${pad}px;">${inner}</div>`

const figureTile = ({ label, value, unit, basis, source, tone = 'var(--fx-text-primary)' }) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; min-width: 0;">
    ${eyebrow(label)}
    <div style="display: flex; align-items: baseline; gap: 6px;">
      <span data-numeric style="font: 600 34px/1.05 ${SANS}; letter-spacing: -.02em; color: ${tone};">${value}</span>
      ${unit ? `<span style="font: 400 14px/1 ${MONO}; color: var(--fx-text-tertiary);">${unit}</span>` : ''}
    </div>
    <div style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary);">${basis}</div>
    ${source ? `<div style="font: 400 11.5px/1.45 ${MONO}; color: var(--fx-text-tertiary);">${source}</div>` : ''}
  </div>`

/** A list row: a sentence with a selvage rim. Clicking opens the drawer. */
const row = ({ status = 'on-track', critical = false, code, text, meta, right, sub }) =>
  `<div class="fx-selvage" data-status="${status}" ${critical ? 'data-critical="true"' : ''} style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 12px 18px; min-height: 44px;">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
          ${code ? mono(code, { size: 12.5 }) : ''}
          <span style="font: 400 14px/1.45 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty;">${text}</span>
        </div>
        ${sub ? `<span style="font: 400 12.5px/1.45 ${SANS}; color: var(--fx-text-tertiary);">${sub}</span>` : ''}
      </div>
      ${meta ? `<span style="font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-tertiary); flex-shrink: 0;">${meta}</span>` : ''}
      ${right ?? ''}
    </div>
  </div>`

const emptyState = (title, bodyText, action) =>
  `<div class="fx-weave" style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 34px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; background-color: var(--fx-bg-surface);">
    ${mark(48, LIGHT)}
    <div style="font: 600 17px/1.25 ${SANS}; color: var(--fx-text-primary);">${title}</div>
    <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); max-width: 46ch; text-wrap: pretty;">${bodyText}</div>
    ${action ?? ''}
  </div>`

/* ══════════════════════════════════════════════════════════════════════════
   1 · Shell · desk
   ══════════════════════════════════════════════════════════════════════════ */

emit('Main.dc.html', board({
  w: 1440, h: 1060,
  body: `${topBar(LIGHT, { phrase: 'Owner', who: 'MR', mark: mark(20, LIGHT, { state: 'listening' }) })}
<div style="flex: 1; display: flex; min-height: 0;">
  ${rail('owner', { active: 'home', collapsed: ['commercial', 'floor', 'oversight', 'system'], badges: { approve: 7 } })}
  ${body(`
    ${pageHeader({
      eyebrow: 'Wednesday, 2 December 2026',
      title: 'Your work',
      meta: 'Barakah Fashions Ltd · woven',
    })}

    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px;">
      ${figureTile({ label: 'Orders shipping this month', value: '11', basis: 'of 19 open orders on the book', source: 'ex-factory date within December' })}
      ${figureTile({ label: 'Drafts waiting on a person', value: '7', basis: '2 of them older than 24 hours', source: 'pending_changes, routed to a role you hold', tone: 'var(--fx-warning)' })}
      ${figureTile({ label: 'Refused writes today', value: '3', basis: 'store 2 · cutting 1', source: 'server-side gates — never a UI block' })}
    </div>

    ${sectionHeading('Needs you now', '4 open')}
    ${card(`
      ${row({ status: 'late', critical: true, code: 'PO-BF-2044', text: 'will miss ex-factory by 4 days — cutting has not started', sub: 'H&M · ST-2610 · 42,000 pcs · ex-factory 18 Dec 2026', meta: '9 days', right: statusLabel('late', 'late') })}
      ${row({ status: 'at-risk', code: 'LC-BF-7781', text: 'latest shipment 21 Dec falls before the revised ex-factory', sub: 'Bestseller A/S · $486,200 · amendment not raised', meta: '2 days', right: statusLabel('at-risk', 'at risk') })}
      ${row({ status: 'at-risk', code: 'UD-2026-118', text: 'balance is down to 1,240 m against 6 open bonded issues', sub: 'Karim Uddin asked for an overdraw at 11:20', meta: '4 h', right: statusLabel('at-risk', 'at risk') })}
      ${row({ status: 'late', code: 'PO-IMP-0311', text: '9 days past the promised delivery — chase Shanghai Textile', sub: '12,400 m of 40s poplin · fabric for ST-2610', meta: '9 days', right: statusLabel('late', 'late') })}
    `)}

    <div style="height: 28px;"></div>
    ${sectionHeading('Waiting on your approval', '7 drafts')}
    ${card(`
      ${row({ status: 'done', code: 'GRN-2291', text: 'goods receipt read from a challan photo', sub: 'raised by Karim Uddin · store · 7 fields · one below 0.90', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.82)}${badge('accent', '2 h')}</span>` })}
      ${row({ status: 'done', code: 'PO-IMP-0327', text: 'purchase order read from the supplier’s pro-forma', sub: 'raised by Procurement Officer · 11 fields', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.96)}${badge('accent', '5 h')}</span>` })}
      ${row({ status: 'done', code: 'ST-2610', text: 'style measurements read from the buyer’s tech pack', sub: 'raised by Rashida Akter · 23 fields · 3 below 0.90', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.74)}${badge('accent', '26 h')}</span>` })}
    `)}
  `)}
</div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   2 · Shell · rails, three roles
   ══════════════════════════════════════════════════════════════════════════ */

const railColumn = (title, sub, spec, opts) =>
  `<div style="display: flex; flex-direction: column; gap: 12px; min-width: 0;">
    <div style="display: flex; flex-direction: column; gap: 5px; padding-left: 2px;">
      <span style="font: 600 15px/1.2 ${SANS}; color: var(--fx-text-primary);">${title}</span>
      <span style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary); text-wrap: pretty;">${sub}</span>
    </div>
    ${rail(spec, opts)}
  </div>`

emit('Rails.dc.html', board({
  w: 1180, h: 1300, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('Shell · the rail is the map')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">One registry, three jobs</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 78ch; text-wrap: pretty;">
      Sections in <code style="font: 500 13px/1 ${MONO};">NAV_SECTIONS</code> order — Work, Commercial, Floor, Oversight, System.
      A role with no access has no entry at all; that is the rule, so the rail's length is the honest
      answer to "what is this job". The counts below are what <code style="font: 500 13px/1 ${MONO};">visibleNav()</code>
      returns for a woven unit with the copilot on.
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 36px; align-items: start;">
    ${railColumn('Owner · 25 entries', 'A directory, not a menu. Every group but Work is closed on arrival, or the rail is taller than the screen.', 'owner', { active: 'home', collapsed: ['commercial', 'floor', 'oversight', 'system'], badges: { approve: 7 } })}
    ${railColumn('Merchandiser · 13 entries', 'Four of them read-only: Your work, MARBIM, Refused writes, Settings. Everything else the desk can change.', 'merchandiser', { active: 'orders', badges: { approve: 3 } })}
    ${railColumn('Production · 7 entries', 'Six more are open to this role but trimmed from the daily scan by railHiddenFor. No "Your work": production is absent from that entry’s role list.', 'production', { active: 'lines', badges: { approve: 1 } })}
  </div>
  ${note('Owner and admin see the same 25. The runbook says 26 and says production is trimmed to 8 — the code says 25 and 7, because <code>dashboard</code>, <code>alerts</code> and <code>factory</code> are hiddenFromSidebar and reached from the top bar instead. The canvas draws the code.')}
`,
}))


/* ══════════════════════════════════════════════════════════════════════════
   3 · Shell · floor  (768×1024 tablet, portrait, dark only)
   ══════════════════════════════════════════════════════════════════════════ */

const syncPill = (kind) => {
  const [tone, text] = {
    sent: ['var(--fx-success)', 'all sent'],
    queued: ['var(--fx-info)', '3 to send · tap to retry'],
    offline: ['var(--fx-warning)', 'offline · 2 saved here'],
    // Sending swaps the dot for the mark itself, travelling. It is the only spinner
    // this product has, and it is the same mark that answers questions.
    sending: ['var(--fx-info)', 'sending'],
  }[kind]
  return `<span style="display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 16px; border-radius: 999px; border: 1px solid ${tone}; background: var(--fx-bg-surface); color: var(--fx-text-primary); font: 500 14px/1 ${MONO};">
    ${kind === 'sending' ? mark(20, DARK, { state: 'streaming' }) : `<span style="width: 9px; height: 9px; border-radius: 999px; background: ${tone};"></span>`}${text}</span>`
}

/** The designed MARBIM entry point on a screen with no top bar. */
const marbimFab = (t, size = 56) =>
  `<span style="position: absolute; right: 20px; bottom: 20px; width: ${size}px; height: ${size}px; border-radius: 999px; border: 1px solid var(--fx-border-default); background: var(--fx-bg-raised); box-shadow: var(--fx-sh2); display: inline-flex; align-items: center; justify-content: center;">${mark(Math.round(size * 0.57), t)}</span>`

const floorRow = ({ status, primary, secondary, trailing }) =>
  `<div class="${status ? 'fx-selvage' : ''}" ${status ? `data-status="${status}"` : ''} style="background: var(--fx-bg-surface); border-top: 1px solid var(--fx-border-subtle); ${status ? '' : 'display: flex;'}">
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 14px 20px; min-height: 56px;">
      <span style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;">
        <span style="font: 600 17px/1.3 ${SANS}; color: var(--fx-text-primary);">${primary}</span>
        ${secondary ? `<span style="font: 400 15px/1.4 ${SANS}; color: var(--fx-text-secondary);">${secondary}</span>` : ''}
      </span>
      ${trailing ?? ''}
    </div>
  </div>`

emit('ShellFloor.dc.html', board({
  w: 768, h: 1024, mode: 'dark',
  body: `
  <header style="flex-shrink: 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: flex; align-items: center; gap: 16px; padding: 14px 20px; min-height: 72px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 8px; border: 1px solid var(--fx-border-default); color: var(--fx-text-primary);">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M10 2.5L4.5 8l5.5 5.5" stroke="currentColor" stroke-width="1.6"/></svg>
    </span>
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
      <span style="font: 600 20px/1.2 ${SANS}; color: var(--fx-text-primary);">Receiving</span>
      <span style="font: 500 11px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary);">Storekeeper · Karim Uddin</span>
    </div>
    ${syncPill('queued')}
  </header>

  <div style="position: relative; flex: 1; min-height: 0; padding: 20px; display: flex; flex-direction: column; gap: 18px; background: var(--fx-bg-canvas);">
    ${marbimFab(DARK)}
    <div style="display: flex; gap: 12px;">
      <span style="flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px; border-radius: 8px; background: var(--fx-bg-selected); color: var(--fx-text-primary); font: 600 16px/1 ${SANS}; border: 1px solid var(--fx-border-default);">Against a PO</span>
      <span style="flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px; border-radius: 8px; background: var(--fx-bg-surface); color: var(--fx-text-secondary); font: 500 16px/1 ${SANS}; border: 1px solid var(--fx-border-subtle);">Free receipt</span>
    </div>

    <div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">
      <div style="padding: 14px 20px 12px; border-bottom: 1px solid var(--fx-border-subtle);">
        ${eyebrow('At the gate — 3 trucks', 12)}
      </div>
      ${floorRow({ status: 'at-risk', primary: 'Shanghai Textile — 12,400 m', secondary: 'PO-IMP-0311 · 40s poplin · bonded, needs a UD', trailing: `<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">${statusLabel('at-risk', 'bonded')}${mono('26 rolls', { size: 14, colour: 'var(--fx-text-secondary)' })}</span>` })}
      ${floorRow({ status: 'on-track', primary: 'Ha-Meem Accessories — 84 cartons', secondary: 'PO-BF-0982 · sewing thread, buttons · local', trailing: `<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">${statusLabel('on-track', 'local')}${mono('84 ctn', { size: 14, colour: 'var(--fx-text-secondary)' })}</span>` })}
      ${floorRow({ status: 'done', primary: 'Padma Poly Bags — 40,000 pcs', secondary: 'PO-BF-1004 · poly bags · received 11:04, waiting inspection', trailing: statusLabel('done', 'received') })}
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${eyebrow('The pill says what is genuinely unsent', 12)}
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        ${syncPill('sent')}${syncPill('queued')}${syncPill('offline')}${syncPill('sending')}
      </div>
    </div>

    <div style="margin-top: auto; display: flex; gap: 12px;">
      ${btn('primary', 'Start a receipt', { size: 'lg', tap: 48, full: true })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   4 · Shell · phone  (390×844) — the tab bar, and the rail is gone
   ══════════════════════════════════════════════════════════════════════════ */

const tabBar = (tabs, active) =>
  `<div style="display: flex; background: var(--fx-bg-raised); border-top: 1px solid var(--fx-border-default);">
    ${tabs.map((tab, i) => `<span style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 56px; padding: 8px 4px; color: ${i === active ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)'};">
      <span style="display: block; width: 2px; height: 12px; transform: skewX(-34deg); background: ${i === active ? 'var(--fx-accent)' : 'transparent'};"></span>
      <span style="font: ${i === active ? '600' : '500'} 12px/1.2 ${SANS}; text-align: center;">${tab}</span>
    </span>`).join('')}
  </div>`

emit('ShellPhone.dc.html', board({
  w: 390, h: 920, mode: 'dark',
  body: `
  <header style="flex-shrink: 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: flex; align-items: center; gap: 12px; padding: 12px 16px; min-height: 64px;">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
      <span style="font: 600 18px/1.2 ${SANS};">Receiving</span>
      <span style="font: 500 10.5px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary);">Storekeeper</span>
    </div>
    <span style="display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--fx-info); font: 500 12px/1 ${MONO};">
      <span style="width: 8px; height: 8px; border-radius: 999px; background: var(--fx-info);"></span>3
    </span>
  </header>

  <div style="position: relative; flex: 1; min-height: 0; padding: 16px; display: flex; flex-direction: column; gap: 14px; background: var(--fx-bg-canvas);">
    ${marbimFab(DARK, 52)}
    <div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">
      ${floorRow({ status: 'at-risk', primary: 'Shanghai Textile', secondary: 'PO-IMP-0311 · 12,400 m · bonded' })}
      ${floorRow({ status: 'on-track', primary: 'Ha-Meem Accessories', secondary: 'PO-BF-0982 · 84 cartons · local' })}
      ${floorRow({ status: 'done', primary: 'Padma Poly Bags', secondary: 'PO-BF-1004 · received 11:04' })}
    </div>
    <div style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
      Tapping a truck opens the same drawer the desk gets — as a bottom sheet, with the same footer.
    </div>
    <div style="margin-top: auto;">${btn('primary', 'Start a receipt', { size: 'lg', tap: 48, full: true })}</div>
  </div>

  ${tabBar(['Receive', 'Issue'], 0)}
  <div style="padding: 14px 16px 18px; background: var(--fx-bg-canvas); border-top: 1px solid var(--fx-border-subtle); display: flex; flex-direction: column; gap: 10px;">
    ${eyebrow('Three tabs is the ceiling', 10)}
    <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">${tabBar(['What’s wrong', 'Approve', 'Figures'], 0)}</div>
    <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">${tabBar(['This hour', 'Endline', 'Stoppages'], 0)}</div>
    <div style="font: 400 11.5px/1.5 ${MONO}; color: var(--fx-text-tertiary);">Pulse (owner, admin) · Hour (production). No skin for viewer or member.</div>
  </div>`,
}))

/* ── 5 · the drawer as a bottom sheet ─────────────────────────────────────── */

emit('PhoneSheet.dc.html', board({
  w: 390, h: 844, mode: 'dark', bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="flex: 1; min-height: 0; opacity: .34; filter: saturate(.55); display: flex; flex-direction: column; overflow: hidden;">
    <header style="border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); padding: 12px 16px; min-height: 64px; display: flex; align-items: center;">
      <span style="font: 600 18px/1.2 ${SANS};">Receiving</span>
    </header>
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
      ${floorRow({ status: 'at-risk', primary: 'Shanghai Textile', secondary: 'PO-IMP-0311 · 12,400 m' })}
    </div>
  </div>

  <div style="flex-shrink: 0; background: var(--fx-bg-surface); border-top: 1px solid var(--fx-border-subtle); border-radius: 14px 14px 0 0; box-shadow: var(--fx-sh3); display: flex; flex-direction: column; max-height: 640px; overflow: hidden;">
    <div style="display: flex; justify-content: center; padding: 10px 0 4px;">
      <span style="width: 44px; height: 4px; border-radius: 999px; background: var(--fx-border-strong);"></span>
    </div>
    <div style="display: flex; align-items: stretch;">
      <div style="width: 3px; flex-shrink: 0; background: var(--fx-warning);"></div>
      <div style="flex: 1; min-width: 0; padding: 14px 18px 16px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
            ${mono('ROLL-11482', { size: 14 })}<span style="font: 400 13px/1.3 ${SANS}; color: var(--fx-text-secondary);">40s poplin · shade B</span>
          </div>
          ${statusLabel('at-risk', 'quarantined')}
        </div>
        <div style="background: var(--fx-bg-sunken); border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px;">
          ${eyebrow('On this roll', 10)}
          <div style="display: flex; align-items: baseline; gap: 6px;">
            <span data-numeric style="font: 600 26px/1.05 ${SANS}; letter-spacing: -.02em;">218.4</span>
            <span style="font: 400 13px/1 ${MONO}; color: var(--fx-text-tertiary);">m</span>
          </div>
          <div style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-secondary);">of 240 m received · 21.6 m cut away at the 4-point check</div>
        </div>
      </div>
    </div>
    <div style="display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--fx-border-subtle);">
      <span style="padding: 12px 10px; font: 600 13px/1 ${SANS}; border-bottom: 2px solid var(--fx-text-primary); margin-bottom: -1px;">Details</span>
      <span style="padding: 12px 10px; font: 500 13px/1 ${SANS}; color: var(--fx-text-tertiary);">History</span>
    </div>
    <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
      ${fact('Received on', 'GRN-2291 · 28 Nov 2026')}
      ${fact('Bonded against', 'UD-2026-118')}
      ${fact('4-point score', '19 points / 100 m — passes')}
      ${fact('Shade group', 'B — do not mix with A on one lay')}
    </div>
    <div style="padding: 14px 18px 20px; border-top: 1px solid var(--fx-border-subtle); display: flex; gap: 10px; justify-content: flex-end;">
      ${btn('ghost', 'Move shelf', { tap: 44 })}${btn('primary', 'Issue to cutting', { tap: 44 })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   5b · Shell · overlays — the ? sheet, the mark's states, the role phrase
   ══════════════════════════════════════════════════════════════════════════ */

/** shortcuts-sheet.tsx, verbatim. Only bindings that actually exist are listed:
    a sheet with aspirations on it teaches people the sheet lies. */
const SHORTCUTS = [
  ['Anywhere', [
    [['Ctrl', 'K'], 'ask MARBIM about the screen you are on', '⌘K on a Mac'],
    [['?'], 'this sheet', ''],
  ]],
  ['Order book', [
    [['j'], 'next order', '/orders'],
    [['k'], 'previous order', '/orders'],
    [['↵'], 'open the focused order', '/orders'],
    [['i'], 'inputs readiness', '/orders'],
  ]],
  ['Approve inbox', [
    [['j'], 'next draft', '/approve'],
    [['k'], 'previous draft', '/approve'],
    [['a'], 'approve the focused draft — with your corrections', '/approve'],
    [['r'], 'reject — asks for a reason', '/approve'],
    [['x'], 'select for a batch', '/approve'],
  ]],
]

const shortcutsSheet = () =>
  `<div class="fx-cut" style="width: 520px; background: var(--fx-bg-raised); border: 1px solid var(--fx-border-subtle); border-radius: 14px; box-shadow: var(--fx-sh3); padding: 28px; display: flex; flex-direction: column; gap: 20px;">
    <span style="font: 600 18px/1.2 ${SANS};">Keyboard</span>
    ${SHORTCUTS.map(([title, keys]) => `<div style="display: flex; flex-direction: column; gap: 2px;">
      <span style="font: 500 11px/1 ${MONO}; letter-spacing: .08em; text-transform: uppercase; color: var(--fx-text-tertiary); padding-bottom: 8px;">${title}</span>
      ${keys.map(([combo, what, where]) => `<div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--fx-border-subtle);">
        <span style="display: inline-flex; gap: 5px; min-width: 92px;">${combo.map(kbdCap).join('')}</span>
        <span style="font: 400 13.5px/1.4 ${SANS}; color: var(--fx-text-secondary);">${what}</span>
        ${where ? `<span style="margin-left: auto; font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary); white-space: nowrap;">${where}</span>` : ''}
      </div>`).join('')}
    </div>`).join('')}
    <span style="font: 400 12px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
      Nothing here is destructive without a confirm — approve and reject always show what changes first.
    </span>
  </div>`

const markCell = (state, when) =>
  `<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; width: 120px;">
    <div style="width: 72px; height: 72px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); display: flex; align-items: center; justify-content: center;">
      ${mark(48, LIGHT, { state })}
    </div>
    <span style="font: 500 11.5px/1 ${MONO}; color: var(--fx-text-primary);">${state}</span>
    <span style="font: 400 11.5px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-align: center; text-wrap: pretty;">${when}</span>
  </div>`

/** describeRoles — the conjunction is copy, not punctuation: Bangla joins with ও. */
const phraseChip = (text, sub, bangla = false) =>
  `<div style="display: flex; flex-direction: column; gap: 6px;">
    <span style="display: inline-flex; align-items: center; align-self: flex-start; gap: 8px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
      <span style="font: ${bangla ? `500 12.5px/1.5 ${BANGLA}` : `500 11px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase`}; color: var(--fx-text-tertiary); white-space: nowrap;">${text}</span>
      ${avatar('SB', 24)}
    </span>
    <span style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary);">${sub}</span>
  </div>`

emit('ShellOverlays.dc.html', board({
  w: 1240, h: 1080, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('Shell · what the top bar opens')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">The mark, the sheet, and the phrase</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 84ch; text-wrap: pretty;">
      Three pieces of chrome that belong to no module. Locked here so no later canvas redraws them.
    </div>
  </div>

  <div style="display: flex; gap: 48px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px; flex-shrink: 0;">
      ${caption('? — anywhere, and it is the whole keyboard')}
      ${shortcutsSheet()}
      ${note('Only bindings that exist are listed. A sheet with aspirations on it teaches people the sheet lies, and then nobody opens it again.')}
    </div>

    <div style="display: flex; flex-direction: column; gap: 34px; min-width: 0;">
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${caption('the mark — the product’s only loading affordance')}
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          ${markCell('rest', 'the mark at anchor')}
          ${markCell('awake', 'the panel opens')}
          ${markCell('listening', 'the top bar, always')}
          ${markCell('thinking', 'a screen is loading')}
          ${markCell('streaming', 'an answer is arriving')}
          ${markCell('blocked', 'refused, or no access')}
        </div>
        <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 62ch; text-wrap: pretty;">
          Eight strokes, transform and opacity only. Colour is never animated and the strokes are never
          recoloured — the ink set serves light surfaces, the white set dark ones, and the theme scope picks.
          There is no circular spinner anywhere in this product.
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${caption('the role phrase — describeRoles, in the reader’s language')}
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px;">
          ${phraseChip('Storekeeper', "['store']")}
          ${phraseChip('স্টোরকিপার', "['store'] · bn")}
          ${phraseChip('Merchandiser and Planner', "['merchandiser', 'planner']")}
          ${phraseChip('মার্চেন্ডাইজার ও প্ল্যানার', "['merchandiser', 'planner'] · bn", true)}
          ${phraseChip('No role', '[] — signed in, no desk yet')}
          ${phraseChip('কোনো রোল নেই', '[] · bn', true)}
        </div>
        <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 62ch; text-wrap: pretty;">
          The conjunction is copy, not punctuation: Bangla joins with ও, not with “and”, so the last join
          comes out of the catalogue rather than a template literal. A person holding two desks reads one
          phrase, not two chips — and “No role” is a real state a new account sits in until an admin grants one.
        </div>
      </div>
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   6 · Drawer · anatomy  (the shape every later canvas inherits)
   ══════════════════════════════════════════════════════════════════════════ */

const anatomyLegend = [
  ['1', 'Header', 'Selvage rim in the row’s status colour, then the identity line — code in mono, then the human name — the StatusLabel, and the close. The rim and the label say the same thing twice on purpose: colour never carries state alone.'],
  ['2', 'The one number', 'Whatever this job came for, as a FigureTile with its basis under it. A drawer that makes somebody hunt for the quantity has already failed.'],
  ['3', 'Tabs', 'Only when the record has more than one face, and the names are nouns: Details · Timeline · Documents · History. The default tab is what this role acts on, not what the record starts with.'],
  ['4', 'Body', 'Facts as label-left/value-right pairs, codes in mono. A linked record is a row that navigates — never a second drawer. It opens the target’s page with that row’s drawer already open (?open=…), so a push notification lands in the same place.'],
  ['5', 'Gate strip', 'The live state of every gate the next action would hit, drawn BEFORE the button. The refusal afterwards is the same sentence.'],
  ['6', 'Footer', 'The actions this role may take on this record in this state. Amber is the one the state machine expects next; ghosts are secondary; destructive is red and goes through a confirm. Never more than three.'],
]

emit('DrawerAnatomy.dc.html', board({
  w: 1160, h: 1080, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('Drawer · anatomy')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 10px;">Lists on the page, details in the drawer</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 82ch; text-wrap: pretty;">
      560px is the default; 720px when the body is a grid. Escape closes. Full-page detail is reserved for
      the three records too big for a drawer — an order, an LC, a sample — and is always a second click,
      from the drawer’s own “Open full page”.
    </div>
  </div>

  <div style="display: flex; gap: 74px; align-items: flex-start;">
    <div style="width: 440px; flex-shrink: 0; display: flex; flex-direction: column; gap: 20px;">
      ${anatomyLegend.map(([n, title, text]) => `<div style="display: flex; gap: 14px;">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 999px; background: var(--fx-text-primary); color: var(--fx-text-inverse); font: 600 12px/1 ${MONO};">${n}</span>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <span style="font: 600 15px/1.3 ${SANS};">${title}</span>
          <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${text}</span>
        </div>
      </div>`).join('')}
    </div>

    <div style="flex: 1; display: flex; justify-content: flex-end; padding-left: 40px;">
      ${drawer({
        part: true, width: 560, status: 'late', critical: true,
        code: 'PO-IMP-0311', who: 'Shanghai Textile Co.', statusText: 'delivery overdue',
        figure: { label: 'Still to arrive', value: '12,400', unit: 'm', basis: '40s poplin for ST-2610 · nothing received yet · promised 24 Nov 2026', tone: 'var(--fx-danger)' },
        tabs: ['Details', 'Documents', 'History'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Ordered', '12,400 m @ $1.94 / m')}
          ${fact('Order value', '$24,056.00')}
          ${fact('Landed cost', '৳31,52,336 <span style="color: var(--fx-text-tertiary); font-weight: 400;">at 118.60 ৳/$</span>')}
          ${fact('Promised', '24 Nov 2026 — 9 days ago')}
          ${fact('Needed by', '6 Dec 2026, for the ST-2610 lay')}
          ${fact('Payment', 'BTB against LC-BF-7781')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Connected')}
          ${linkRow('BTB-2026-0093', 'back-to-back LC', 'opens the LC register with this row already open')}
          ${linkRow('REQ-0771', 'requisition raised by the store', 'Karim Uddin · 6 Nov 2026')}
        </div>`,
        gate: `${gateChip('pass', 'BTB headroom 12%')}${gateChip('fail', 'UD not attached')}${gateChip('idle', 'EXP n/a — import')}`,
        footer: `${btn('ghost', 'Chase supplier')}${btn('secondary', 'Amend dates')}${btn('primary', 'Receive against this PO')}`,
      })}
    </div>
  </div>
  ${note('A drawer never opens a second drawer. Everything a footer would need beyond three buttons goes behind “More”. The scrim behind is the weave at 5% over rgba(24,29,41,.45) — feedback.tsx, unchanged.')}
`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   7 · Drawer · record — three widths
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL']
const BREAKDOWN = [
  ['Black', [980, 2340, 3120, 2860, 1420, 480]],
  ['Ecru', [720, 1980, 2640, 2410, 1180, 390]],
  ['Deep navy', [860, 2210, 2950, 2700, 1330, 430]],
]

const breakdownGrid = () => {
  const colTotals = SIZES.map((_, i) => BREAKDOWN.reduce((n, [, r]) => n + r[i], 0))
  const grand = colTotals.reduce((a, b) => a + b, 0)
  const cell = (v, { head = false, total = false } = {}) =>
    `<div style="padding: 9px 10px; text-align: ${head ? 'left' : 'right'}; border-bottom: 1px solid var(--fx-border-subtle); font: ${total ? '600' : head ? '500' : '400'} 13px/1.3 ${head ? SANS : MONO}; color: ${total ? 'var(--fx-text-primary)' : head ? 'var(--fx-text-primary)' : 'var(--fx-text-secondary)'};">${typeof v === 'number' ? v.toLocaleString('en-US') : v}</div>`
  return `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden; background: var(--fx-bg-surface);">
    <div style="display: grid; grid-template-columns: 108px repeat(6, minmax(0, 1fr)) 76px;">
      <div style="padding: 9px 10px; border-bottom: 1px solid var(--fx-border-default); font: 500 11px/1.3 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary);">Colour</div>
      ${SIZES.map((s) => `<div style="padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--fx-border-default); font: 500 11px/1.3 ${MONO}; letter-spacing: .06em; color: var(--fx-text-tertiary);">${s}</div>`).join('')}
      <div style="padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--fx-border-default); font: 500 11px/1.3 ${MONO}; letter-spacing: .06em; color: var(--fx-text-tertiary);">Total</div>
      ${BREAKDOWN.map(([name, r]) => `${cell(name, { head: true })}${r.map((v) => cell(v)).join('')}${cell(r.reduce((a, b) => a + b, 0), { total: true })}`).join('')}
      ${cell('All colours', { head: true })}${colTotals.map((v) => cell(v, { total: true })).join('')}${cell(grand, { total: true })}
    </div>
  </div>`
}

emit('DrawerRecord.dc.html', board({
  w: 1980, h: 1080, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · record — one family, three widths')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 96ch;">
      560 is the default. 720 is for a body that is a grid and nothing else — the moment a drawer needs a third width, it wanted a page.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('560 · maintenance ticket')}
      ${drawer({
        width: 560, height: 800, status: 'late', critical: true,
        code: 'TKT-0442', who: 'Line 4 · flatlock #7', statusText: 'line down',
        figure: { label: 'Stopped for', value: '42', unit: 'min', basis: 'raised 13:18 by Shilpi Begum · 68 operators idle on L4', tone: 'var(--fx-danger)' },
        tabs: ['Details', 'History'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Machine', 'FL-07 · Juki MF-7923 · 2019')}
          ${fact('Symptom', 'Looper timing slipped — skipped stitches')}
          ${fact('Claimed by', 'Sabbir Khan, 13:24')}
          ${fact('Last PM', '14 Oct 2026 — 49 days ago')}
          ${fact('Spare needed', 'Looper set · 2 in the store')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Costing the stoppage')}
          ${linkRow('PO-BF-2044', 'H&M · ST-2610', 'L4 is 38% of today’s plan for this order')}
        </div>`,
        footer: `${btn('ghost', 'Reassign')}${btn('primary', 'Resolve')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('560 · fabric roll')}
      ${drawer({
        width: 560, height: 800, status: 'at-risk',
        code: 'ROLL-11482', who: '40s poplin · shade B', statusText: 'quarantined',
        figure: { label: 'On this roll', value: '218.4', unit: 'm', basis: 'of 240 m received · 21.6 m cut away at the 4-point check', tone: 'var(--fx-warning)' },
        tabs: ['Details', 'History'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Received on', 'GRN-2291 · 28 Nov 2026')}
          ${fact('Bonded against', 'UD-2026-118')}
          ${fact('4-point score', '19 points / 100 m — passes')}
          ${fact('Shelf', 'A-12 · bonded bay')}
          ${fact('Shade group', 'B — never on one lay with A')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Connected')}
          ${linkRow('GRN-2291', 'goods receipt', '26 rolls, this is roll 14')}
        </div>`,
        gate: `${gateChip('pass', 'UD balance 1,240 m')}${gateChip('warn', 'shade B — check the lay')}`,
        footer: `${btn('ghost', 'Move shelf')}${btn('primary', 'Issue to cutting')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('720 · the body is a grid')}
      ${drawer({
        width: 720, height: 800, status: 'late', critical: true,
        code: 'PO-BF-2044', who: 'H&M · ST-2610', statusText: 'cutting not started',
        figure: { label: 'Ordered', value: '42,000', unit: 'pcs', basis: '3 colours × 6 sizes · ex-factory 18 Dec 2026 · $4.85 FOB' },
        tabs: ['Breakdown', 'Details', 'TNA', 'History'], active: 0,
        body: `${breakdownGrid()}
        <div style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          Tolerance is ±3% per colour, agreed with H&M on the PO. Over-cutting one colour to cover another is a buyer conversation, not a floor decision.
        </div>`,
        footer: `${btn('ghost', 'Open full page')}${btn('secondary', 'Export for the meeting')}${btn('primary', 'Plan the lay')}`,
      })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   8–10 · Drawer · draft  (AI never writes — every output is a draft)
   ══════════════════════════════════════════════════════════════════════════ */

/** One drafted field: value, per-field confidence from a measurement, click-to-source. */
const draftField = ({ label, value, conf, low = false, source }) =>
  `<div style="border: 1px solid ${low ? 'var(--fx-warning)' : 'var(--fx-border-subtle)'}; border-radius: 8px; padding: 12px 14px; background: var(--fx-bg-surface); display: flex; flex-direction: column; gap: 8px;">
    <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px;">
      <span style="font: 400 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
      ${source ? `<span style="font: 400 11px/1.3 ${MONO}; color: var(--fx-text-tertiary); text-decoration: underline; text-underline-offset: 3px;">${source}</span>` : ''}
    </div>
    <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
      <span style="font: 500 15px/1.3 ${SANS}; color: var(--fx-text-primary);">${value}</span>
      ${confidence(conf)}
    </div>
    ${low ? `<div style="font: 400 12px/1.5 ${SANS}; color: var(--fx-warning); text-wrap: pretty;">Lowest on this draft — read it first. The challan’s quantity column is over a fold.</div>` : ''}
  </div>`

const DRAFT_FIELDS = [
  { label: 'Supplier', value: 'Shanghai Textile Co.', conf: 0.97, source: 'page 1 · header' },
  { label: 'Challan number', value: 'STC/2026/4471', conf: 0.94, source: 'page 1 · top right' },
  { label: 'Received on', value: '28 Nov 2026', conf: 0.91, source: 'page 1 · gate stamp' },
  { label: 'Item', value: '40s poplin, 58 inch', conf: 0.96, source: 'page 1 · line 1' },
  { label: 'Quantity', value: '12,180 m', conf: 0.82, low: true, source: 'page 1 · line 1' },
  { label: 'Rolls', value: '26', conf: 0.93, source: 'page 1 · line 1' },
  { label: 'Bonded against', value: 'UD-2026-118', conf: 0.98, source: 'page 2 · customs block' },
]

const draftBanner = (text) =>
  `<div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 12px 14px; display: flex; gap: 11px; align-items: flex-start;">
    ${mark(20, LIGHT)}
    <span style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty;">${text}</span>
  </div>`

emit('DrawerDraft.dc.html', board({
  w: 640, h: 1540, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `${caption('Drawer · draft · the approver’s view')}
  ${drawer({
    width: 560, status: 'at-risk',
    code: 'GRN-2291', who: 'read from a challan photo', statusText: 'waiting on you',
    figure: { label: 'Short against the order', value: '−220', unit: 'm', basis: '12,180 m read on the challan, 12,400 m ordered on PO-IMP-0311', tone: 'var(--fx-warning)' },
    tabs: ['Fields', 'Source', 'Trail'], active: 0,
    body: `${draftBanner('MARBIM read this from Karim Uddin’s photo of the challan and drafted a goods receipt. Nothing has been written. Approving it creates GRN-2291 and 26 rolls under your name.')}
    <div style="display: flex; flex-direction: column; gap: 9px;">
      ${eyebrow('7 fields · one below 0.90')}
      ${DRAFT_FIELDS.map(draftField).join('')}
    </div>`,
    gate: `${gateChip('pass', 'UD-2026-118 · 1,240 m left')}${gateChip('warn', 'quantity short by 220 m')}`,
    footer: `${btn('ghost', 'Reject')}${btn('secondary', 'Edit and approve')}${btn('primary', 'Approve')}`,
  })}
  ${note('Confidence is per field and comes from a measurement, never a constant — a lint rule bans invented numbers. Every value is click-to-source: the label on the right jumps to the region of the document it was read from.')}
`,
}))

/* ── 9 · the Source tab ───────────────────────────────────────────────────── */

const challanFacsimile = () => `
  <div style="border: 1px solid var(--fx-border-default); border-radius: 8px; background: var(--fx-bg-surface); overflow: hidden;">
    <div style="padding: 14px 16px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; justify-content: space-between; align-items: baseline; gap: 12px;">
      <span style="font: 600 14px/1.3 ${SANS};">SHANGHAI TEXTILE CO., LTD</span>
      <span style="font: 400 11px/1.3 ${MONO}; color: var(--fx-text-secondary);">STC/2026/4471</span>
    </div>
    <div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 11px;">
      <div style="display: flex; justify-content: space-between; font: 400 11.5px/1.4 ${MONO}; color: var(--fx-text-tertiary);">
        <span>DELIVERY CHALLAN</span><span>28 NOV 2026</span>
      </div>
      <div style="height: 1px; background: var(--fx-border-subtle);"></div>
      <div style="display: grid; grid-template-columns: 1fr 92px 62px; gap: 8px; font: 400 11.5px/1.4 ${MONO}; color: var(--fx-text-tertiary);">
        <span>DESCRIPTION</span><span style="text-align: right;">QTY</span><span style="text-align: right;">ROLLS</span>
      </div>
      <div style="position: relative; display: grid; grid-template-columns: 1fr 92px 62px; gap: 8px; align-items: center; font: 400 12.5px/1.4 ${MONO}; color: var(--fx-text-primary); padding: 8px 0;">
        <span>40s POPLIN 58"</span>
        <span style="text-align: right; position: relative; outline: 2px solid var(--fx-accent); outline-offset: 5px; border-radius: 4px;">12,180 M</span>
        <span style="text-align: right;">26</span>
      </div>
      <div style="height: 1px; background: var(--fx-border-subtle);"></div>
      <div style="display: flex; justify-content: space-between; font: 400 11.5px/1.4 ${MONO}; color: var(--fx-text-tertiary); padding-top: 4px;">
        <span>BOND / UD REF</span><span style="color: var(--fx-text-primary);">UD-2026-118</span>
      </div>
      <div style="margin-top: 10px; padding-top: 12px; border-top: 1px dashed var(--fx-border-default); font: 400 11px/1.5 ${MONO}; color: var(--fx-text-tertiary); text-wrap: pretty;">
        The fold runs through the quantity column — which is why that field scored 0.82 and nothing else did.
      </div>
    </div>
  </div>`

emit('DrawerDraftSource.dc.html', board({
  w: 640, h: 1180, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `${caption('Drawer · draft · Source — the field’s own region, outlined')}
  ${drawer({
    width: 560, status: 'at-risk',
    code: 'GRN-2291', who: 'read from a challan photo', statusText: 'waiting on you',
    figure: { label: 'Reading', value: 'Quantity', basis: '12,180 m · confidence 0.82 · the lowest field on this draft', tone: 'var(--fx-warning)' },
    tabs: ['Fields', 'Source', 'Trail'], active: 1,
    body: `<div style="display: flex; flex-direction: column; gap: 11px;">
      ${eyebrow('Page 1 of 2 · photographed at the gate, 28 Nov 11:04')}
      ${challanFacsimile()}
    </div>
    <div style="display: flex; gap: 10px; align-items: center;">
      ${badge('neutral', 'page 1')}${badge('neutral', 'page 2')}
      <span style="margin-left: auto; font: 400 12px/1.4 ${MONO}; color: var(--fx-text-tertiary);">tap a field to jump here</span>
    </div>`,
    gate: `${gateChip('pass', 'UD-2026-118 · 1,240 m left')}${gateChip('warn', 'quantity short by 220 m')}`,
    footer: `${btn('ghost', 'Reject')}${btn('secondary', 'Edit and approve')}${btn('primary', 'Approve')}`,
  })}`,
}))

/* ── 10 · the raiser’s own view, and a draft with no confidence at all ────── */

emit('DrawerDraftStates.dc.html', board({
  w: 1260, h: 1180, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · draft · two more states')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 92ch; text-wrap: pretty;">
      The same record, different chairs. The person who raised a draft confirms or discards their own reading — they do not approve it.
      And a draft a model composed in conversation carries no confidence at all, because there was no extractor to measure.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('the raiser · Karim Uddin, store')}
      ${drawer({
        width: 560, height: 800, status: 'at-risk',
        code: 'GRN-2291', who: 'your reading', statusText: 'sent for approval',
        figure: { label: 'With', value: 'Owner', basis: 'routed by the approval rule for bonded receipts · sent 2 h ago', tone: 'var(--fx-text-primary)' },
        tabs: ['Fields', 'Source', 'Trail'], active: 0,
        body: `${draftBanner('This is your reading of the challan, not a receipt. You can correct it or throw it away until somebody approves it.')}
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('7 fields · one below 0.90')}
          ${draftField(DRAFT_FIELDS[4])}
          ${draftField(DRAFT_FIELDS[6])}
          <div style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary);">…and five more, all above 0.90.</div>
        </div>`,
        footer: `${btn('ghost', 'Discard')}${btn('primary', 'Confirm the reading')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('ai_chat · a model composed this in conversation')}
      ${drawer({
        width: 560, height: 800, status: 'at-risk',
        code: 'REQ-0783', who: 'drafted in a MARBIM conversation', statusText: 'waiting on you',
        figure: { label: 'Requisition for', value: '900', unit: 'm', basis: 'to cover the 220 m short on PO-IMP-0311 plus the 4-point cut-away', tone: 'var(--fx-text-primary)' },
        tabs: ['Fields', 'Trail'], active: 0,
        body: `${draftBanner('MARBIM built this from what you asked in the conversation, not from a document. There is nothing here that was measured, so no field carries a confidence — and a draft with no score never approves itself.')}
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('4 fields · unscored')}
          ${draftField({ label: 'Item', value: '40s poplin, 58 inch', conf: null })}
          ${draftField({ label: 'Quantity', value: '900 m', conf: null })}
          ${draftField({ label: 'Needed by', value: '6 Dec 2026', conf: null })}
          ${draftField({ label: 'Against', value: 'PO-BF-2044 · ST-2610', conf: null })}
        </div>`,
        footer: `${btn('ghost', 'Reject')}${btn('secondary', 'Edit and approve')}${btn('primary', 'Approve')}`,
      })}
    </div>
  </div>
  ${note('A source with nothing to measure carries NO confidence and is refused if it offers one. Unscored never auto-approves — it waits for a person, always.')}
`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   11 · Drawer · exception  (what happened · why · who)
   ══════════════════════════════════════════════════════════════════════════ */

const chainStep = ({ state, name, detail, last = false }) => {
  const tone = { done: 'var(--fx-success)', blocked: 'var(--fx-danger)', waiting: 'var(--fx-warning)', ahead: 'var(--fx-text-tertiary)' }[state]
  const glyph = { done: '✓', blocked: '✕', waiting: '!', ahead: '·' }[state]
  return `<div style="display: flex; gap: 14px;">
    <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; border: 1.5px solid ${tone}; color: ${tone}; font: 500 11px/1 ${MONO};">${glyph}</span>
      ${last ? '' : `<span style="width: 1.5px; flex: 1; min-height: 26px; background: var(--fx-border-subtle);"></span>`}
    </div>
    <div style="display: flex; flex-direction: column; gap: 3px; padding-bottom: ${last ? '0' : '18px'};">
      <span style="font: 600 14px/1.3 ${SANS}; color: var(--fx-text-primary);">${name}</span>
      <span style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${detail}</span>
    </div>
  </div>`
}

const exceptionDrawer = (tab) => drawer({
  width: 560, height: 820, status: 'late', critical: true,
  code: 'PO-BF-2044', who: 'H&M · ST-2610', statusText: 'will miss ex-factory',
  figure: { label: 'Late by', value: '4', unit: 'days', basis: 'ex-factory 18 Dec 2026 · earliest achievable 22 Dec at today’s plan', tone: 'var(--fx-danger)' },
  tabs: ['What happened', 'Why', 'Who'], active: tab,
  body: tab === 0
    ? `<div style="font: 400 16px/1.6 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty;">
        PO-BF-2044 will miss ex-factory by 4 days: cutting has not started because the PP sample for ST-2610 is still with H&amp;M.
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        ${fact('True since', '24 Nov 2026 — 8 days')}
        ${fact('Order', '42,000 pcs · $203,700 FOB')}
        ${fact('Fabric', 'in the store, 12,180 m, bonded')}
        ${fact('Line plan', 'L1–L4 held open from 6 Dec')}
      </div>
      <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
        Nothing on the floor can clear this. The PP verdict is the buyer’s, and cutting is gated on it server-side.
      </div>`
    : `<div style="display: flex; flex-direction: column; gap: 0;">
        ${chainStep({ state: 'waiting', name: 'PP sample sent 21 Nov, no verdict', detail: 'Sent to H&M Dhaka liaison. Chased twice — 25 Nov and 1 Dec, both by Rashida Akter.' })}
        ${chainStep({ state: 'blocked', name: 'Cutting cannot start', detail: 'The PP-approval gate refuses a lay against a style whose sample is still out. Server-side, and it has refused three attempts.' })}
        ${chainStep({ state: 'ahead', name: 'Sewing has no input', detail: '4 lines held open from 6 Dec. Every idle day is roughly 2,400 pcs of capacity.' })}
        ${chainStep({ state: 'ahead', name: 'Ex-factory 18 Dec', detail: 'Reachable only if the verdict lands by 4 Dec. After that the date moves, and LC-BF-7781’s latest shipment moves with it.', last: true })}
      </div>`,
  footer: `${btn('ghost', 'Ask MARBIM about this')}${btn('primary', 'Open the order')}`,
})

emit('DrawerException.dc.html', board({
  w: 1260, h: 1140, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · exception')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 92ch; text-wrap: pretty;">
      Opened from the owner’s home and from Alerts. The first tab is a sentence a person can read aloud in a meeting; the second is the chain that produced it.
      “Open the order” navigates to <code style="font: 500 13px/1 ${MONO};">/orders?open=PO-BF-2044&amp;tab=tna</code> — the target’s page with that row’s drawer already open.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">${caption('What happened')}${exceptionDrawer(0)}</div>
    <div style="display: flex; flex-direction: column; gap: 12px;">${caption('Why · the cause chain')}${exceptionDrawer(1)}</div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   12 · Drawer · gate  (the refusal, and the same drawer read by another role)
   ══════════════════════════════════════════════════════════════════════════ */

const balanceBar = () => `
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <div style="display: flex; justify-content: space-between; font: 400 12px/1 ${MONO}; color: var(--fx-text-tertiary);">
      <span>UD-2026-118 · drawn against the declaration</span><span data-numeric>1,240 m left of 14,000 m</span>
    </div>
    <div style="display: flex; gap: 5px; height: 20px; align-items: center; overflow: hidden;">
      ${Array.from({ length: 28 }, (_, i) => `<span style="width: 2px; height: 16px; flex-shrink: 0; transform: skewX(-34deg); background: ${i < 25 ? 'var(--fx-border-strong)' : i < 28 ? 'var(--fx-success)' : 'var(--fx-border-default)'};"></span>`).join('')}
    </div>
    <div style="display: flex; gap: 5px; height: 20px; align-items: center; overflow: hidden;">
      ${Array.from({ length: 28 }, (_, i) => `<span style="width: 2px; height: 16px; flex-shrink: 0; transform: skewX(-34deg); background: ${i < 28 ? 'var(--fx-danger)' : 'var(--fx-border-default)'};"></span>`).join('')}
    </div>
    <div style="display: flex; justify-content: space-between; font: 400 12px/1 ${MONO}; color: var(--fx-danger);">
      <span>this issue would draw 1,400 m</span><span data-numeric>160 m over</span>
    </div>
  </div>`

const gateDrawer = ({ role, readOnly, footer }) => drawer({
  width: 560, height: 840, status: 'late',
  code: 'UD-2026-118', who: 'bonded declaration · 40s poplin', statusText: 'issue refused',
  figure: { label: 'Balance', value: '1,240', unit: 'm', basis: 'you asked to issue 1,400 m — 160 m more than the declaration allows', tone: 'var(--fx-danger)' },
  tabs: ['The gate', 'What would clear it'], active: 0,
  readOnly,
  body: `<div style="font: 400 16px/1.6 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty;">
      Can’t issue 1,400 m against UD-2026-118: the balance is 1,240 m.
    </div>
    ${balanceBar()}
    <div style="display: flex; flex-direction: column; gap: 2px;">
      ${fact('Declared', '14,000 m · 12 Sep 2026')}
      ${fact('Issued so far', '12,760 m across 31 issues')}
      ${fact('Asked for', '1,400 m — lay 4, ST-2610')}
      ${fact('Short by', '<span style="color: var(--fx-danger);">160 m</span>')}
    </div>
    <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
      Drawing more bonded fabric than the declaration covers is a customs exposure, not a paperwork slip — so the block is in the service, not the screen, and it refuses the same way from the tablet, the API and the offline queue.
    </div>`,
  gate: `${gateChip('fail', 'UD balance 1,240 m < 1,400 m')}${gateChip('pass', 'shade B lay is clean')}`,
  footer,
})

emit('DrawerGate.dc.html', board({
  w: 1260, h: 1220, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · gate')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 92ch; text-wrap: pretty;">
      Same record, same sentence, two roles. The store can ask for an overdraw because the store owns the issue; production is reading somebody else’s refusal and gets no footer at all — not a greyed one.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('storekeeper · may ask')}
      ${gateDrawer({ role: 'store', footer: `${btn('ghost', 'Issue 1,240 m instead')}${btn('primary', 'Request overdraw approval')}` })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('production · reads the same drawer')}
      ${gateDrawer({ role: 'production', readOnly: 'the UD workbench', footer: null })}
    </div>
  </div>
  ${note('Gates in this family: PP approval before cutting · UD balance before a bonded issue · BTB headroom before an import PO · EXP number before bank docs · LC latest-shipment conflict. Each shows its live value before the button and repeats the same sentence after.')}
`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   13 · Drawer · person, and Drawer · document
   ══════════════════════════════════════════════════════════════════════════ */

const roleChip = (label, held) =>
  `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 999px; border: 1px solid ${held ? 'var(--fx-border-default)' : 'var(--fx-border-subtle)'}; background: ${held ? 'var(--fx-bg-sunken)' : 'transparent'}; font: 500 12.5px/1 ${SANS}; color: ${held ? 'var(--fx-text-primary)' : 'var(--fx-text-disabled)'};">
    ${held ? '<span style="color: var(--fx-success);">✓</span>' : ''}${label}</span>`

emit('DrawerPersonDoc.dc.html', board({
  w: 1260, h: 1140, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · person  ·  Drawer · document')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 92ch; text-wrap: pretty;">
      The last two families. A person opens from setup, workforce or any avatar; a document from any Files tab.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('person · opened by an owner')}
      ${drawer({
        width: 560, height: 830, status: 'done',
        code: 'shilpi.begum', who: 'Shilpi Begum', statusText: 'active · signed in 06:52',
        figure: { label: 'Writes today', value: '148', basis: 'hourly outputs on L1 and L2 · 3 of them from the offline queue' },
        tabs: ['Roles', 'Line scope', 'Activity'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 10px;">
          ${eyebrow('Holds')}
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${roleChip('Production', true)}${roleChip('Quality', false)}${roleChip('Cutting', false)}${roleChip('Maintenance', false)}${roleChip('Planner', false)}
          </div>
          <div style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
            Production opens 13 screens and can change 5. Adding a second role adds screens; it never takes any away.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Lines', 'L1, L2')}
          ${fact('Shift', 'A · 08:00–17:00')}
          ${fact('Device', 'Floor tablet 3 — shared')}
          ${fact('Granted by', 'Admin, 14 Aug 2026')}
        </div>
        <div style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          Every write this person makes is recorded against this name for as long as the audit log lives. On a shared tablet that is the whole reason sign-out exists.
        </div>`,
        footer: `${btn('ghost', 'Revoke production')}${btn('primary', 'Grant a role')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('document · in any Files tab')}
      ${drawer({
        width: 560, height: 830, status: 'done',
        code: 'STC/2026/4471', who: 'delivery challan · 2 pages', statusText: 'read by MARBIM',
        figure: { label: 'Raised', value: '1', unit: 'draft', basis: 'GRN-2291 · 7 fields · waiting on the owner since 11:06' },
        tabs: ['Preview', 'Extracted fields', 'Versions'], active: 0,
        body: `${challanFacsimile()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Uploaded by', 'Karim Uddin · 28 Nov 2026, 11:04')}
          ${fact('Attached to', 'PO-IMP-0311')}
          ${fact('Kept', '7 years — customs')}
        </div>`,
        footer: `${btn('ghost', 'Download')}${btn('primary', 'Read into a form')}`,
      })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   14–23 · The five screens every role shares
   ══════════════════════════════════════════════════════════════════════════ */

/** topbar + rail + page body, for a screen drawn at desk width. */
const screen = ({ w = 1280, h, role = 'owner', phrase = 'Owner', who = 'MR', active, collapsed = ['commercial', 'floor', 'oversight', 'system'], badges = {}, inner, bangla = false, factory = 'Barakah Fashions Ltd', initials = 'BF', markState = 'rest' }) =>
  board({
    w, h, bangla,
    body: `${topBar(LIGHT, { phrase, who, mark: mark(20, LIGHT, { state: markState }), bangla, factory, initials, search: bangla ? 'মডিউল, অর্ডার, বায়ার খুঁজুন…' : undefined })}
<div style="flex: 1; display: flex; min-height: 0;">
  ${rail(role, { active, collapsed, badges, bangla })}
  ${body(inner)}
</div>`,
  })

const keyLegend = () =>
  `<div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 11px 16px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface);">
    ${[['j', 'next'], ['k', 'previous'], ['a', 'approve — with your corrections'], ['r', 'reject, with a reason'], ['x', 'select for a batch']]
      .map(([k, what]) => `<span style="display: inline-flex; align-items: center; gap: 7px; font: 400 12.5px/1 ${SANS}; color: var(--fx-text-secondary);">${kbd(k)}${what}</span>`).join('')}
  </div>`

const draftRow = ({ code, who, what, fields, conf, age, kind, ageTone = 'var(--fx-text-tertiary)' }) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: grid; grid-template-columns: minmax(0, 1fr) 190px 74px 178px; align-items: center; gap: 18px; padding: 13px 18px; min-height: 44px;">
    <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
        ${mono(code, { size: 12.5 })}
        <span style="font: 400 14px/1.4 ${SANS}; color: var(--fx-text-primary);">${what}</span>
        ${badge('accent', kind)}
      </div>
      <span style="font: 400 12.5px/1.4 ${SANS}; color: var(--fx-text-tertiary);">raised by ${who} · ${fields}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 5px;">
      ${eyebrow('Weakest field')}
      ${confidence(conf)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      ${eyebrow('Age')}
      <span data-numeric style="font: 500 13px/1.2 ${MONO}; color: ${ageTone};">${age}</span>
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">
      ${btn('ghost', 'Reject', { size: 'sm' })}${btn('secondary', 'Approve', { size: 'sm' })}
    </div>
  </div>`

/* ── /approve · populated ─────────────────────────────────────────────────── */

emit('Approve.dc.html', screen({
  h: 940, active: 'approve', badges: { approve: 7 },
  inner: `${pageHeader({ eyebrow: 'Waiting on you', title: 'Approve inbox', meta: '7 drafts · 2 ageing' })}
    <div style="display: flex; flex-direction: column; gap: 18px;">
      ${keyLegend()}
      ${card(`
        ${draftRow({ code: 'ST-2610', who: 'Rashida Akter', what: 'style measurements read from the tech pack', fields: '23 fields · 3 below 0.90', conf: 0.74, age: '26 h', kind: 'at risk', ageTone: 'var(--fx-danger)' })}
        ${draftRow({ code: 'GRN-2291', who: 'Karim Uddin', what: 'goods receipt read from a challan photo', fields: '7 fields · one below 0.90', conf: 0.82, age: '2 h', kind: 'store' })}
        ${draftRow({ code: 'PO-IMP-0327', who: 'Procurement Officer', what: 'purchase order read from a pro-forma', fields: '11 fields', conf: 0.96, age: '5 h', kind: 'procurement' })}
        ${draftRow({ code: 'REQ-0783', who: 'MARBIM, in conversation', what: 'requisition for 900 m of 40s poplin', fields: '4 fields · unscored', conf: null, age: '25 h', kind: 'ai chat', ageTone: 'var(--fx-warning)' })}
        ${draftRow({ code: 'LC-BF-7781', who: 'Tanvir Ahmed', what: 'amendment read from the bank’s advice', fields: '9 fields', conf: 0.93, age: '3 h', kind: 'commercial' })}
      `)}
      <div style="display: flex; align-items: center; gap: 14px;">
        ${btn('secondary', 'Approve 3 selected')}
        <span style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-tertiary);">A batch approves each draft on its own terms — one refusal does not roll the others back.</span>
      </div>
    </div>`,
}))

/* ── /approve · empty — the state that teaches ────────────────────────────── */

const doorRow = (what, where, how) =>
  `<div style="display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--fx-border-subtle); text-align: left;">
    <span style="width: 2px; height: 34px; flex-shrink: 0; transform: skewX(-34deg); background: var(--fx-accent);"></span>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <span style="font: 600 14px/1.35 ${SANS}; color: var(--fx-text-primary);">${what}</span>
      <span style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${how}</span>
      <span style="font: 400 12px/1.4 ${MONO}; color: var(--fx-text-tertiary);">${where}</span>
    </div>
  </div>`

emit('ApproveEmpty.dc.html', screen({
  h: 860, role: 'store', phrase: 'Storekeeper', who: 'KU', active: 'approve',
  collapsed: [],
  inner: `${pageHeader({ eyebrow: 'Waiting on you', title: 'Approve inbox', meta: 'nothing yet' })}
    <div class="fx-weave" style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 34px 32px; display: flex; flex-direction: column; align-items: center; gap: 18px; background-color: var(--fx-bg-surface);">
      ${mark(48, LIGHT)}
      <div style="font: 600 17px/1.25 ${SANS}; text-align: center;">Nothing is waiting on you</div>
      <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); max-width: 60ch; text-align: center; text-wrap: pretty;">
        Two kinds of draft route to a storekeeper. Here is what raises each, so an empty inbox reads as “nothing yet” rather than “nothing ever”.
      </div>
      <div style="width: 100%; max-width: 620px;">
        ${doorRow('A goods receipt read from a challan', 'Store → Receive → photograph the challan', 'Photograph the paper at the gate. MARBIM reads it into a receipt and sends it here for you to confirm.')}
        ${doorRow('A requisition MARBIM drafted in conversation', 'Store → Issue, or ask MARBIM anywhere', 'Ask for material against an order and the draft lands here unscored — a model composed it, so there is nothing to measure.')}
      </div>
      <div style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary); max-width: 60ch; text-align: center; text-wrap: pretty;">
        Your own unsent work stays in the store until you send it. Alerts from jobs live in the bell, not here.
      </div>
    </div>`,
}))

/* ── /alerts ──────────────────────────────────────────────────────────────── */

const alertRow = ({ status, when, text, sub, kind }) => row({
  status, text, sub, meta: when,
  right: `<span style="display: flex; align-items: center; gap: 10px;">${badge('neutral', kind)}${statusLabel(status, status === 'late' ? 'act now' : status === 'at-risk' ? 'watch' : 'info')}</span>`,
})

emit('Alerts.dc.html', screen({
  h: 880, active: undefined, badges: { approve: 7 },
  inner: `${pageHeader({ eyebrow: 'From the jobs that watch the factory', title: 'Alerts', meta: '6 open · 2 today' })}
    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      ${['All 6', 'Money 2', 'Floor 3', 'Compliance 1'].map((f, i) => `<span style="display: inline-flex; align-items: center; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-border-default); font: 500 12.5px/1 ${SANS}; background: ${i === 0 ? 'var(--fx-bg-selected)' : 'transparent'}; color: var(--fx-text-${i === 0 ? 'primary' : 'secondary'});">${f}</span>`).join('')}
    </div>
    ${card(`
      ${alertRow({ status: 'late', when: '11:20', text: 'Karim Uddin asked to draw 1,400 m against UD-2026-118 — 160 m over the balance', sub: 'the issue was refused; an overdraw approval is waiting', kind: 'UD' })}
      ${alertRow({ status: 'late', when: '09:04', text: 'LC-BF-7781’s latest shipment (21 Dec) now falls before PO-BF-2044’s ex-factory', sub: 'raise an amendment or move the ship date — both are buyer conversations', kind: 'LC' })}
      ${alertRow({ status: 'at-risk', when: '08:30', text: 'L4 run rate is 22% behind the day plan — flatlock #7 has been down 42 minutes', sub: 'TKT-0442 claimed by Sabbir Khan at 13:24', kind: 'line' })}
      ${alertRow({ status: 'at-risk', when: 'yesterday', text: 'ST-2610’s measurement draft has been waiting 26 hours', sub: 'drafts older than 24 hours stop being drafts and start being a queue', kind: 'draft' })}
      ${alertRow({ status: 'done', when: 'yesterday', text: 'Fire drill logged for December — next one due 4 Jan 2027', sub: 'Rumi Chowdhury · compliance', kind: 'audit' })}
    `)}
    ${note('Alerts are what a job noticed. Drafts are what a person must decide. They never share a list, and the shell keeps their counters apart.')}`,
}))

emit('AlertsEmpty.dc.html', screen({
  h: 720, active: undefined,
  inner: `${pageHeader({ eyebrow: 'From the jobs that watch the factory', title: 'Alerts', meta: 'nothing open' })}
    ${emptyState('Nothing is alerting', 'The watchers are running — LC dates, UD balances, run rates, ageing drafts, compliance due dates. When one of them finds something it lands here, with the sentence that says what and why.', btn('secondary', 'What is watched'))}`,
}))

/* ── /refused ─────────────────────────────────────────────────────────────── */

emit('Refused.dc.html', screen({
  h: 860, role: 'store', phrase: 'Storekeeper', who: 'KU', active: 'refused', collapsed: [],
  inner: `${pageHeader({ eyebrow: 'Your own refusals, last 7 days', title: 'Refused writes', meta: '3 refusals' })}
    ${readOnlyNote('the refusal report')}
    ${card(`
      ${row({ status: 'late', code: 'today 11:20', text: 'Issue 1,400 m against UD-2026-118 — the balance is 1,240 m', sub: 'the gate: UD balance · your request for an overdraw is with the owner', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
      ${row({ status: 'late', code: 'Mon 15:41', text: 'Receive against PO-IMP-0344 — the order has no back-to-back LC', sub: 'the gate: BTB headroom · commercial has to open one first', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
      ${row({ status: 'done', code: 'Sun 10:02', text: 'Issue roll ROLL-11482 to lay 3 — shade B on an A lay', sub: 'the gate: shade mix · the lay was rebuilt with B rolls and went through', right: statusLabel('done', 'cleared') })}
    `)}
    ${note('Refused writes are not errors. They are the factory’s rules working — so the report shows the gate by name, its value at the time, and whether it has since cleared. A refusal a person cannot see becomes a person who stops trusting the tablet.')}`,
}))

emit('RefusedEmpty.dc.html', screen({
  h: 700, role: 'store', phrase: 'Storekeeper', who: 'KU', active: 'refused', collapsed: [],
  inner: `${pageHeader({ eyebrow: 'Your own refusals, last 7 days', title: 'Refused writes' })}
    ${emptyState('Nothing of yours was refused', 'Five gates can refuse a storekeeper: the UD balance on a bonded issue, a bonded receipt with no UD, the BTB headroom on an import, a shade mix on a lay, and a failed 4-point roll. When one of them stops you, it lands here with its value at the time.', btn('secondary', 'Read the five gates'))}`,
}))

/* ── /factory — what the top-bar chip opens ───────────────────────────────── */

const factRow = (label, value, mono_ = false) =>
  `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 11px 0; border-bottom: 1px solid var(--fx-border-subtle);">
    <span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
    <span style="font: ${mono_ ? `500 13px/1.4 ${MONO}` : `500 14px/1.4 ${SANS}`}; color: var(--fx-text-primary); text-align: right;">${value}</span>
  </div>`

emit('Factory.dc.html', screen({
  h: 960, role: 'store', phrase: 'Storekeeper', who: 'KU', active: undefined, collapsed: [],
  inner: `${pageHeader({ eyebrow: 'The unit you are signed in to', title: 'Barakah Fashions Ltd', meta: 'read-only' })}
    ${readOnlyNote('the factory profile')}
    <div style="display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 24px; align-items: start;">
      ${card(`<div style="padding: 22px 24px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
          <span style="width: 52px; height: 52px; border-radius: 4px; background: var(--fx-text-primary); color: var(--fx-text-inverse); display: inline-flex; align-items: center; justify-content: center; font: 700 18px/1 ${SANS}; letter-spacing: .04em;">BF</span>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font: 600 18px/1.25 ${SANS};">Barakah Fashions Ltd</span>
            <span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">Woven unit · Gazipur, Dhaka</span>
          </div>
        </div>
        ${factRow('Registered address', 'Plot 44, Bhabanipur, Gazipur 1740')}
        ${factRow('BIN', '004821936-0202', true)}
        ${factRow('TIN', '618294037142', true)}
        ${factRow('Bond licence', 'BL/DHK/2019/0442', true)}
        ${factRow('Buyers on the book', 'H&M · Bestseller A/S · Primark · C&A')}
      </div>`)}
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${figureTile({ label: 'Sewing lines', value: '8', basis: 'L1–L8 · 486 machines · 1,240 operators on the roll' })}
        ${figureTile({ label: 'Open orders', value: '19', basis: '412,000 pcs · $1.94m FOB across four buyers' })}
        ${figureTile({ label: 'People with a desk', value: '21', basis: 'across 17 roles · 3 shared floor tablets' })}
      </div>
    </div>
    ${note('Nobody edits the factory here — writeRoles is empty on this entry, for every role. The legal name, the bond licence and the factory type are changed in Settings by an owner or admin, and every change is audited.')}`,
}))

emit('FactoryEmpty.dc.html', screen({
  h: 720, active: undefined,
  inner: `${pageHeader({ eyebrow: 'The unit you are signed in to', title: 'This factory' })}
    ${emptyState('This factory has not been described yet', 'The legal name, address, BIN, TIN and bond licence go on every export document this software produces. Until they are set, bank submission and UD paperwork have nothing to print.', btn('secondary', 'Open Settings → Identity'))}`,
}))

/* ── /settings ────────────────────────────────────────────────────────────── */

const ANCHORS = ['Identity', 'What it makes', 'Money & documents', 'Floor & planning', 'Quality',
                 'Desks', 'Oversight', 'Platform', 'People', 'Approval routing', 'Audit trail']

const jumpStrip = () =>
  `<nav style="display: flex; flex-wrap: wrap; gap: 8px;">
    ${ANCHORS.map((a, i) => `<span style="display: inline-flex; align-items: center; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-${i === 0 ? 'primary' : 'secondary'}); border: 1px solid var(--fx-border-default); border-radius: 4px; padding: 8px 12px; min-height: 36px; background: ${i === 0 ? 'var(--fx-bg-selected)' : 'transparent'};">${a}</span>`).join('')}
  </nav>`

const settingField = (label, value, hint) =>
  `<div style="display: flex; flex-direction: column; gap: 6px;">
    <span style="font: 500 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
    <div style="display: flex; align-items: center; min-height: 40px; padding: 10px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; background: var(--fx-bg-surface); font: 400 14px/1.3 ${SANS}; color: var(--fx-text-primary);">${value}</div>
    ${hint ? `<span style="font: 400 12px/1.45 ${SANS}; color: var(--fx-text-tertiary);">${hint}</span>` : ''}
  </div>`

emit('Settings.dc.html', screen({
  h: 1220, active: 'settings',
  inner: `${pageHeader({ eyebrow: 'Settings', title: 'Barakah Fashions Ltd', ownsAmber: false })}
    <div style="display: flex; flex-direction: column; gap: 34px;">
      ${jumpStrip()}
      <div>
        ${sectionHeading('Identity')}
        ${card(`<div style="padding: 22px 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px;">
          ${settingField('Legal name', 'Barakah Fashions Ltd', 'Printed on every export document.')}
          ${settingField('Country', 'Bangladesh')}
          ${settingField('BIN', '004821936-0202')}
          ${settingField('TIN', '618294037142')}
          ${settingField('Bond licence', 'BL/DHK/2019/0442', 'Without it, bonded receipts have nothing to reference.')}
          ${settingField('Registered address', 'Plot 44, Bhabanipur, Gazipur 1740')}
        </div>
        <div style="padding: 0 24px 22px; display: flex; gap: 10px; justify-content: flex-end;">${btn('ghost', 'Discard')}${btn('primary', 'Save identity')}</div>`)}
      </div>
      <div>
        ${sectionHeading('Your profile', 'yours alone')}
        ${card(`<div style="padding: 22px 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px;">
          ${settingField('Name', 'Mr. Rahman')}
          ${settingField('Email', 'owner@barakah-fashions.example')}
          ${settingField('Language', 'English  ·  বাংলা', 'The floor runs in Bangla. Identifiers, money and metrics stay Latin in both.')}
          ${settingField('Roles you hold', 'Owner', 'Granted at signup — this factory is yours.')}
        </div>`)}
      </div>
    </div>
    ${note('Fifty-eight inputs on one page is fine for a once-a-quarter visit only if “cut tolerance” is reachable without scrolling past payroll. Hence eleven anchors, not eleven routes: everything the factory is configured by stays reviewable in one scroll.')}`,
}))

emit('SettingsReadOnly.dc.html', screen({
  h: 920, role: 'production', phrase: 'Production', who: 'SB', active: 'settings', collapsed: [],
  inner: `${pageHeader({ eyebrow: 'Settings', title: 'Your profile', meta: 'read-only' })}
    <div style="display: flex; flex-direction: column; gap: 26px;">
      ${card(`<div style="padding: 22px 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px;">
        ${settingField('Name', 'Shilpi Begum')}
        ${settingField('Email', 'production@barakah-fashions.example')}
        ${settingField('Language', 'বাংলা')}
        ${settingField('Roles you hold', 'Production', 'Opens 13 screens · may change 5.')}
        ${settingField('Lines', 'L1, L2')}
      </div>
      <div style="padding: 0 24px 22px; display: flex; gap: 10px; justify-content: flex-end;">${btn('primary', 'Save language')}</div>`)}
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${eyebrow('The rest of Settings')}
        <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 34px; display: flex; align-items: center; gap: 16px; background: var(--fx-bg-surface);">
          ${mark(32, LIGHT, { state: 'blocked' })}
          <div>
            <div style="font: 600 16px/1.3 ${SANS};">You don’t have access to the factory’s settings</div>
            <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); margin-top: 4px;">Ask an owner or admin if you need it.</div>
          </div>
        </div>
      </div>
    </div>
    ${note('No empty state is drawn for /settings: a profile always exists, so the second state is this one — the same route, the same rail entry, with the eleven factory anchors absent rather than greyed. Absent, because a control you can see and cannot use still teaches that it exists.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   24–27 · Auth — the weave wash, and the same card at two widths
   ══════════════════════════════════════════════════════════════════════════ */

const authField = (label, value, { hint, ghost = false } = {}) =>
  `<div style="display: flex; flex-direction: column; gap: 6px;">
    <span style="font: 500 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
    <div style="display: flex; align-items: center; min-height: 44px; padding: 11px 13px; border: 1px solid var(--fx-border-default); border-radius: 4px; background: var(--fx-bg-surface); font: 400 14px/1.3 ${SANS}; color: var(--fx-text-${ghost ? 'disabled' : 'primary'});">${value}</div>
    ${hint ? `<span style="font: 400 12px/1.45 ${SANS}; color: var(--fx-text-tertiary);">${hint}</span>` : ''}
  </div>`

const authCard = (inner) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 14px; box-shadow: var(--fx-sh2); padding: 28px; display: flex; flex-direction: column; gap: 20px;">${inner}</div>`

const authTitle = (title, tagline) =>
  `<div style="display: flex; flex-direction: column; gap: 8px;">
    <span style="font: 700 24px/1.2 ${SANS}; letter-spacing: -.015em;">${title}</span>
    ${tagline ? `<span style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${tagline}</span>` : ''}
  </div>`

const authLink = (before, link) =>
  `<div style="font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary); text-align: center;">${before} <a href="#" style="color: var(--fx-text-primary);">${link}</a></div>`

/** The wash + lockup + a 420px column, at whichever width. */
const authFrame = (w, h, inner) =>
  `<div class="fx-weave" style="width: ${w}px; height: ${h}px; background-color: var(--fx-bg-sunken); display: flex; align-items: center; justify-content: center; padding: 24px; overflow: hidden;">
    <div style="width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 28px;">
      <img src="${LIGHT.lockup}" alt="FabricX AI" style="height: 34px; width: auto; align-self: flex-start;" />
      ${inner}
    </div>
  </div>`

const authBoard = (name, { h, deskH, label, desk, phone, tail }) =>
  emit(name, board({
    w: 1260, h, pad: 40, bg: 'var(--fx-bg-canvas)',
    body: `${caption(label)}
    <div style="display: flex; gap: 40px; align-items: flex-start;">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${caption('desk · 1280 wide')}
        <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">${authFrame(760, deskH, desk)}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${caption('phone · 390')}
        <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">${authFrame(390, deskH, phone ?? desk)}</div>
      </div>
    </div>
    ${tail ?? ''}`,
  }))

authBoard('Login.dc.html', {
  h: 820, deskH: 580, label: '/login',
  desk: authCard(`${authTitle('Sign in', 'Your factory, your orders, your floor.')}
    ${authField('Email', 'karim.uddin@barakah-fashions.example')}
    ${authField('Password', '••••••••••')}
    ${btn('primary', 'Sign in', { size: 'lg', tap: 44, full: true })}
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${authLink('', 'Forgotten your password?')}
      ${authLink('New factory?', 'Create an account')}
    </div>`),
  tail: note('The two refusals this screen has to say well: “That email and password did not match.” and “That account still needs its email confirmed. Check your inbox.” Neither names which half was wrong; the second one does, because it is not a guess a stranger can use.'),
})

authBoard('Signup.dc.html', {
  h: 900, deskH: 700, label: '/signup',
  desk: authCard(`${authTitle('Create an account', 'This also creates your factory. You will be its owner.')}
    ${authField('Your name', 'Mr. Rahman')}
    ${authField('Factory name', 'Barakah Fashions Ltd', { hint: 'The legal name can be set later in Settings.' })}
    ${authField('Email', 'owner@barakah-fashions.example')}
    ${authField('Password', '••••••••••', { hint: 'At least 12 characters.' })}
    ${btn('primary', 'Create account', { size: 'lg', tap: 44, full: true })}
    ${authLink('Already have one?', 'Sign in')}`),
})

authBoard('Forgot.dc.html', {
  h: 1220, deskH: 1000, label: '/forgot-password  ·  /reset-password',
  desk: `${authCard(`${authTitle('Reset your password', 'Give the address the account was created with and a link comes back.')}
    ${authField('Email', 'karim.uddin@barakah-fashions.example')}
    ${btn('primary', 'Send the link', { size: 'lg', tap: 44, full: true })}
    ${authLink('Remembered it?', 'Back to sign in')}`)}
    <div style="height: 4px;"></div>
    ${authCard(`${authTitle('Set a new password')}
    <div style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty; margin-top: -8px;">At least 12 characters. Every other session stays signed in — sign out of shared devices yourself.</div>
    ${authField('New password', '••••••••••••')}
    ${authField('New password again', '••••••••••••')}
    ${btn('primary', 'Save password', { size: 'lg', tap: 44, full: true })}`)}`,
  phone: authCard(`${authTitle('Reset your password', 'Give the address the account was created with and a link comes back.')}
    ${authField('Email', 'karim.uddin@…')}
    ${btn('primary', 'Send the link', { size: 'lg', tap: 44, full: true })}
    ${authLink('Remembered it?', 'Back to sign in')}`),
  tail: note('A reset link lasts one hour and works once. The dead-link screen says exactly that rather than “invalid token”, and offers to send another.'),
})

authBoard('Confirm.dc.html', {
  h: 820, deskH: 600, label: 'email confirmation — the landing after signup',
  desk: `${authCard(`<div style="display: flex; flex-direction: column; align-items: flex-start; gap: 18px;">
      ${mark(48, LIGHT)}
      ${authTitle('Confirm your email', 'We sent a link to owner@barakah-fashions.example. It expires in 24 hours, and you cannot sign in until it is used.')}
      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
        ${btn('secondary', 'Use a different address', { size: 'lg', tap: 44, full: true })}
        <div style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">Nothing arrived? Check the spam folder, and confirm the address is the one the account was created with.</div>
      </div>
    </div>`)}`,
})

/* ══════════════════════════════════════════════════════════════════════════
   28 · The five states, as a strip every later canvas points at
   ══════════════════════════════════════════════════════════════════════════ */

const stateCell = (title, body_, w = 340) =>
  `<div style="width: ${w}px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px;">
    ${caption(title)}
    <div style="flex: 1; display: flex; flex-direction: column;">${body_}</div>
  </div>`

emit('States.dc.html', board({
  w: 1900, h: 800, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('Every artboard, in five states')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 96ch; text-wrap: pretty;">
      Populated with real Bangladeshi data, empty with an instruction and a door, loading as the weave — never a circular spinner, there is not one in the system —
      error as a bordered alert with the mark held and desaturated, and, on the floor only, offline-queued.
    </div>
  </div>
  <div style="display: flex; gap: 32px; align-items: stretch;">
    ${stateCell('populated', card(`
      ${row({ status: 'at-risk', code: 'GRN-2291', text: '12,180 m of 40s poplin', sub: '26 rolls · bonded against UD-2026-118' })}
      ${row({ status: 'on-track', code: 'GRN-2290', text: '84 cartons of trims', sub: 'Ha-Meem Accessories · inspected' })}
      ${row({ status: 'done', code: 'GRN-2288', text: '40,000 poly bags', sub: 'Padma Poly Bags · closed' })}
    `))}
    ${stateCell('empty — an instruction and a door', emptyState('No receipt yet today', 'The first truck of the day starts here. Photograph the challan at the gate and MARBIM reads it into a receipt for you to confirm.', btn('secondary', 'Start a receipt')))}
    ${stateCell('loading — the weave, never a spinner', `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 48px;">
      ${mark(48, LIGHT, { state: 'thinking' })}
      <span style="font: 400 13px/1 ${MONO}; color: var(--fx-text-tertiary);">Reading the store…</span>
    </div>`)}
    ${stateCell('error — what failed, and a way back', `<div style="border: 1px solid var(--fx-danger); border-radius: 8px; padding: 28px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; background: var(--fx-bg-surface); flex: 1;">
      ${mark(32, LIGHT, { state: 'blocked' })}
      <div style="font: 600 17px/1.25 ${SANS};">That did not load</div>
      <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">The store’s receipts could not be read just now. Nothing you entered has been lost.</div>
      ${btn('secondary', 'Try again')}
    </div>`)}
    ${stateCell('offline / queued — floor only', `<div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
      <div style="border: 1px solid var(--fx-warning); border-radius: 999px; padding: 10px 16px; display: inline-flex; align-items: center; gap: 10px; font: 500 14px/1 ${MONO}; align-self: flex-start; background: var(--fx-bg-surface);">
        <span style="width: 9px; height: 9px; border-radius: 999px; background: var(--fx-warning);"></span>offline · 2 saved here
      </div>
      ${card(`
        ${row({ status: 'done', code: '11:42', text: 'Receipt for PO-BF-0982 — saved on this tablet', sub: 'it will send itself when the network comes back' })}
        ${row({ status: 'done', code: '11:51', text: 'Issue of 620 m to lay 3 — saved on this tablet' })}
      `)}
      <div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font: 600 15px/1.3 ${SANS};">1 entry was refused</div>
        <div style="font: 400 13.5px/1.5 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">issue stock — a bonded issue needs a UD reference</div>
      </div>
      <div style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary); text-wrap: pretty;">Queued will send itself. Refused never will — somebody has to look at it.</div>
    </div>`, 400)}
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   29–31 · The Bengali pass
   Anek Bangla at the same px, one line-height step looser. Three hard rules:
   no negative tracking (matra clusters break), no 700 (its 600 carries
   Jakarta's 700), no uppercase transform (Bengali has no case).
   Identifiers, money and metrics stay Latin mono in BOTH languages:
   PO-88203 never becomes পিও-৮৮২০৩.
   ══════════════════════════════════════════════════════════════════════════ */

const bnHeading = (text, right) =>
  `<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
    ${slashes(LIGHT, { accent: true, h: 15 })}
    <h2 style="font: 600 26px/1.35 ${BANGLA}; letter-spacing: 0; margin: 0; color: var(--fx-text-primary);">${text}</h2>
    ${right ? `<span style="margin-left: auto; font: 400 12.5px/1.4 ${BANGLA}; color: var(--fx-text-tertiary);">${right}</span>` : ''}
  </div>`

const bnRow = ({ status, critical = false, code, text, sub, meta, right }) =>
  `<div class="fx-selvage" data-status="${status}" ${critical ? 'data-critical="true"' : ''} style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 13px 18px; min-height: 44px;">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
          ${code ? mono(code, { size: 12.5 }) : ''}
          <span style="font: 400 14.5px/1.7 ${BANGLA}; color: var(--fx-text-primary); text-wrap: pretty;">${text}</span>
        </div>
        ${sub ? `<span style="font: 400 13px/1.7 ${BANGLA}; color: var(--fx-text-tertiary);">${sub}</span>` : ''}
      </div>
      ${meta ? `<span style="font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-tertiary); flex-shrink: 0;">${meta}</span>` : ''}
      ${right ?? ''}
    </div>
  </div>`

const bnBtn = (variant, text, opts = {}) =>
  btn(variant, text, opts).replace(`font: 600 ${BTN_FONT_FIX(opts)}px/1 ${SANS}`, `font: 600 ${BTN_FONT_FIX(opts)}px/1.4 ${BANGLA}`)
function BTN_FONT_FIX(o) { return ({ sm: 13, md: 14, lg: 15 })[o.size ?? 'md'] }

const bnFigureTile = ({ label, value, unit, basis }) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; min-width: 0;">
    <div style="font: 500 12.5px/1.5 ${BANGLA}; letter-spacing: 0; color: var(--fx-text-tertiary);">${label}</div>
    <div style="display: flex; align-items: baseline; gap: 6px;">
      <span data-numeric style="font: 600 34px/1.05 ${SANS}; letter-spacing: -.02em; color: var(--fx-text-primary);">${value}</span>
      ${unit ? `<span style="font: 400 14px/1 ${MONO}; color: var(--fx-text-tertiary);">${unit}</span>` : ''}
    </div>
    <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-secondary); text-wrap: pretty;">${basis}</div>
  </div>`

emit('BengaliShell.dc.html', screen({
  w: 1440, h: 1140, bangla: true, active: 'home', badges: { approve: 7 },
  phrase: 'ওনার', who: 'MR', markState: 'listening',
  inner: `${pageHeader({
    eyebrow: 'বুধবার, ২ ডিসেম্বর ২০২৬',
    title: 'আপনার কাজ',
    meta: 'Barakah Fashions Ltd · woven',
    bangla: true,
  })}
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px;">
    ${bnFigureTile({ label: 'এই মাসে যেগুলো যাবে', value: '11', basis: 'বইয়ে খোলা ১৯টি অর্ডারের মধ্যে' })}
    ${bnFigureTile({ label: 'মানুষের সিদ্ধান্তের অপেক্ষায় খসড়া', value: '7', basis: 'তার দুটি চব্বিশ ঘণ্টার বেশি পুরনো হয়ে গেছে' })}
    ${bnFigureTile({ label: 'আজ যতগুলো লেখা আটকানো হয়েছে', value: '3', basis: 'স্টোর ২টি · কাটিং ১টি — সবই সার্ভারের নিয়মে' })}
  </div>
  ${bnHeading('এখনই আপনার দরকার', '৪টি খোলা')}
  ${card(`
    ${bnRow({ status: 'late', critical: true, code: 'PO-BF-2044', text: 'নির্ধারিত এক্স-ফ্যাক্টরির চেয়ে ৪ দিন দেরি হয়ে যাবে — কাটিং এখনও শুরু করা যায়নি', sub: 'H&M · ST-2610 · 42,000 pcs · এক্স-ফ্যাক্টরি 18 Dec 2026', meta: '9 days', right: statusLabel('late', 'দেরি') })}
    ${bnRow({ status: 'at-risk', code: 'LC-BF-7781', text: 'শেষ শিপমেন্টের তারিখ 21 Dec, সেটা নতুন এক্স-ফ্যাক্টরির আগেই পড়ে যাচ্ছে', sub: 'Bestseller A/S · $486,200 · সংশোধনী এখনও তোলা হয়নি', meta: '2 days', right: statusLabel('at-risk', 'ঝুঁকিতে') })}
    ${bnRow({ status: 'at-risk', code: 'UD-2026-118', text: 'ছয়টি খোলা বন্ডেড ইস্যুর বিপরীতে ব্যালান্স নেমে 1,240 m-এ এসেছে', sub: 'করিম উদ্দিন সকাল ১১:২০-এ ওভারড্র-এর অনুমতি চেয়েছেন', meta: '4 h', right: statusLabel('at-risk', 'ঝুঁকিতে') })}
  `)}
  <div style="height: 28px;"></div>
  ${bnHeading('আপনার অনুমোদনের অপেক্ষায়', '৭টি খসড়া')}
  ${card(`
    ${bnRow({ status: 'done', code: 'GRN-2291', text: 'চালানের ছবি থেকে পড়া মালামাল বুঝে নেওয়ার খসড়া', sub: 'তুলেছেন করিম উদ্দিন · স্টোর · ৭টি ঘর · একটি ০.৯০-এর নিচে', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.82)}${badge('accent', '2 h')}</span>` })}
    ${bnRow({ status: 'done', code: 'ST-2610', text: 'বায়ারের টেক প্যাক থেকে পড়া মাপের তালিকা', sub: 'তুলেছেন রশিদা আক্তার · ২৩টি ঘর · তিনটি ০.৯০-এর নিচে', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.74)}${badge('accent', '26 h')}</span>` })}
  `)}
  ${note('Bengali runs 30–40% longer than the English it replaces — the rows above are the same rows, at the length the floor actually reads. Identifiers, money and quantities stay Latin mono in both languages: PO-BF-2044 never becomes পিও-বিএফ-২০৪৪, because the paper on the desk says the Latin one.')}`,
}))

emit('BengaliApprove.dc.html', screen({
  w: 1280, h: 900, bangla: true, role: 'store', phrase: 'স্টোরকিপার', who: 'KU',
  active: 'approve', collapsed: [],
  inner: `${pageHeader({ eyebrow: 'আপনার কাছে আটকে আছে', title: 'অ্যাপ্রুভ ইনবক্স', meta: '2 drafts', bangla: true })}
    <div style="display: flex; flex-direction: column; gap: 18px;">
      <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 11px 16px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface);">
        ${[['j', 'পরেরটা'], ['k', 'আগেরটা'], ['a', 'আপনার সংশোধনসহ অনুমোদন'], ['r', 'কারণ লিখে বাতিল'], ['x', 'একসাথে করার জন্য বাছুন']]
          .map(([k, what]) => `<span style="display: inline-flex; align-items: center; gap: 7px; font: 400 13px/1.6 ${BANGLA}; color: var(--fx-text-secondary);">${kbd(k)}${what}</span>`).join('')}
      </div>
      ${card(`
        ${bnRow({ status: 'done', code: 'GRN-2291', text: 'চালানের ছবি থেকে পড়া মালামাল বুঝে নেওয়ার খসড়া', sub: 'তুলেছেন করিম উদ্দিন · ৭টি ঘর · একটি ঘর ০.৯০-এর নিচে', right: `<span style="display: flex; align-items: center; gap: 10px;">${confidence(0.82)}${bnBtn('ghost', 'বাতিল', { size: 'sm' })}${bnBtn('secondary', 'অনুমোদন', { size: 'sm' })}</span>` })}
        ${bnRow({ status: 'done', code: 'REQ-0783', text: 'MARBIM-এর সাথে কথা বলার সময় তৈরি করা রিকুইজিশন', sub: 'চারটি ঘর · কোনো স্কোর নেই — যন্ত্র লিখেছে, মাপার কিছু ছিল না', right: `<span style="display: flex; align-items: center; gap: 10px;">${confidence(null)}${bnBtn('ghost', 'বাতিল', { size: 'sm' })}${bnBtn('secondary', 'অনুমোদন', { size: 'sm' })}</span>` })}
      `)}
      <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-tertiary); max-width: 76ch; text-wrap: pretty;">
        আপনার নিজের যে কাজ এখনও পাঠানো হয়নি সেটা স্টোরেই থাকে। কাজগুলো যে নিয়মে আপনার কাছে আসে সেটা মালিক ঠিক করে দেন — সেটিংস → অ্যাপ্রুভাল রাউটিং।
      </div>
    </div>`,
}))

emit('BengaliDraft.dc.html', board({
  w: 640, h: 1620, pad: 40, bangla: true, bg: 'var(--fx-bg-sunken)',
  body: `${caption('drawer · draft · bn')}
  ${drawer({
    width: 560, status: 'at-risk',
    code: 'GRN-2291', who: 'চালানের ছবি থেকে পড়া', statusText: 'আপনার কাছে আটকে আছে',
    figure: { label: 'অর্ডারের চেয়ে কম', value: '−220', unit: 'm', basis: 'চালানে পড়া গেছে 12,180 m, PO-IMP-0311-এ অর্ডার ছিল 12,400 m', tone: 'var(--fx-warning)' },
    tabs: ['ঘরগুলো', 'কাগজ', 'ইতিহাস'], active: 0,
    body: `<div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 12px 14px; display: flex; gap: 11px; align-items: flex-start;">
      ${mark(20, LIGHT)}
      <span style="font: 400 13.5px/1.75 ${BANGLA}; color: var(--fx-text-primary); text-wrap: pretty;">করিম উদ্দিনের তোলা চালানের ছবি থেকে MARBIM এই খসড়াটা বানিয়েছে। এখনও কিছুই লেখা হয়নি — আপনি অনুমোদন দিলে তবেই GRN-2291 আর ২৬টি রোল আপনার নামে তৈরি হবে।</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 9px;">
      <div style="font: 500 12.5px/1.5 ${BANGLA}; color: var(--fx-text-tertiary);">৭টি ঘর · একটি ০.৯০-এর নিচে</div>
      ${[
        ['সরবরাহকারী', 'Shanghai Textile Co.', 0.97, false],
        ['চালান নম্বর', 'STC/2026/4471', 0.94, false],
        ['বুঝে নেওয়ার তারিখ', '28 Nov 2026', 0.91, false],
        ['পণ্য', '40s poplin, 58 inch', 0.96, false],
        ['পরিমাণ', '12,180 m', 0.82, true],
        ['রোল', '26', 0.93, false],
        ['যে UD-এর বিপরীতে', 'UD-2026-118', 0.98, false],
      ].map(([label, value, conf, low]) => `<div style="border: 1px solid ${low ? 'var(--fx-warning)' : 'var(--fx-border-subtle)'}; border-radius: 8px; padding: 12px 14px; background: var(--fx-bg-surface); display: flex; flex-direction: column; gap: 8px;">
        <span style="font: 400 13px/1.6 ${BANGLA}; color: var(--fx-text-secondary);">${label}</span>
        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <span style="font: 500 15px/1.4 ${SANS}; color: var(--fx-text-primary);">${value}</span>
          ${confidence(conf)}
        </div>
        ${low ? `<div style="font: 400 12.5px/1.7 ${BANGLA}; color: var(--fx-warning); text-wrap: pretty;">এই খসড়ার সবচেয়ে দুর্বল ঘর — আগে এটাই দেখুন। চালানের পরিমাণের ঘরটা ভাঁজের উপরে পড়েছে।</div>` : ''}
      </div>`).join('')}
    </div>`,
    gate: `${gateChip('pass', 'UD-2026-118 · 1,240 m বাকি')}${gateChip('warn', '220 m কম এসেছে')}`,
    footer: `${bnBtn('ghost', 'বাতিল')}${bnBtn('secondary', 'ঠিক করে অনুমোদন')}${bnBtn('primary', 'অনুমোদন')}`,
  })}
  ${note('Confidence stays a Latin numeral and ten slashes in both languages — it is a measurement, not prose. The tab names are nouns in Bengali too.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   canvas.json — five pages, laid out so a walk reads left to right
   ══════════════════════════════════════════════════════════════════════════ */

const A = (file, x, y, w, h, page, title) => ({ file, x, y, w, h, page, title })

const canvas = {
  pages: [
    { id: 'shell', name: 'Shell' },
    { id: 'drawers', name: 'Drawers' },
    { id: 'shared', name: 'Shared screens' },
    { id: 'auth', name: 'Auth & states' },
    { id: 'bengali', name: 'Bengali' },
  ],
  artboards: [
    // ── Shell ──
    A('Main.dc.html', 0, 0, 1440, 1060, 'shell', '/home · shell · desk · owner · populated'),
    A('Rails.dc.html', 1560, 0, 1180, 1300, 'shell', 'shell · rail · owner 25 | merchandiser 13 | production 7 + More'),
    A('ShellFloor.dc.html', 0, 1500, 768, 1024, 'shell', '/store/receive · shell · floor · dark'),
    A('ShellPhone.dc.html', 900, 1500, 390, 920, 'shell', 'shell · phone · tab bar'),
    A('PhoneSheet.dc.html', 1390, 1500, 390, 844, 'shell', 'shell · phone · drawer as bottom sheet'),
    A('ShellOverlays.dc.html', 1880, 1500, 1240, 1080, 'shell', 'shell · the ? sheet, the mark’s states, the role phrase'),

    // ── Drawers ──
    A('DrawerAnatomy.dc.html', 0, 0, 1160, 1080, 'drawers', 'drawer · anatomy · PO-IMP-0311'),
    A('DrawerRecord.dc.html', 1280, 0, 1980, 1080, 'drawers', 'drawer · record · 560 | 560 | 720'),
    A('DrawerDraft.dc.html', 0, 1280, 640, 1540, 'drawers', 'drawer · draft · GRN from a challan · Fields'),
    A('DrawerDraftSource.dc.html', 760, 1280, 640, 1180, 'drawers', 'drawer · draft · Source'),
    A('DrawerDraftStates.dc.html', 1520, 1280, 1260, 1180, 'drawers', 'drawer · draft · raiser | ai_chat'),
    A('DrawerException.dc.html', 0, 2960, 1260, 1140, 'drawers', 'drawer · exception · PO-BF-2044'),
    A('DrawerGate.dc.html', 1380, 2960, 1260, 1220, 'drawers', 'drawer · gate · UD overdraw · store | production'),
    A('DrawerPersonDoc.dc.html', 2760, 2960, 1260, 1140, 'drawers', 'drawer · person | drawer · document'),

    // ── Shared screens ──
    A('Approve.dc.html', 0, 0, 1280, 940, 'shared', '/approve · populated'),
    A('ApproveEmpty.dc.html', 1400, 0, 1280, 860, 'shared', '/approve · empty'),
    A('Alerts.dc.html', 0, 1120, 1280, 880, 'shared', '/alerts · populated'),
    A('AlertsEmpty.dc.html', 1400, 1120, 1280, 720, 'shared', '/alerts · empty'),
    A('Refused.dc.html', 0, 2120, 1280, 860, 'shared', '/refused · populated'),
    A('RefusedEmpty.dc.html', 1400, 2120, 1280, 700, 'shared', '/refused · empty'),
    A('Factory.dc.html', 0, 3100, 1280, 960, 'shared', '/factory · populated'),
    A('FactoryEmpty.dc.html', 1400, 3100, 1280, 720, 'shared', '/factory · empty'),
    A('Settings.dc.html', 0, 4180, 1280, 1220, 'shared', '/settings · populated · owner'),
    A('SettingsReadOnly.dc.html', 1400, 4180, 1280, 920, 'shared', '/settings · read-only profile'),

    // ── Auth & states ──
    A('Login.dc.html', 0, 0, 1260, 820, 'auth', '/login · desk + phone'),
    A('Signup.dc.html', 1360, 0, 1260, 900, 'auth', '/signup · desk + phone'),
    A('Confirm.dc.html', 2720, 0, 1260, 820, 'auth', 'email confirmation · desk + phone'),
    A('Forgot.dc.html', 4080, 0, 1260, 1220, 'auth', '/forgot-password · /reset-password · desk + phone'),
    A('States.dc.html', 0, 1400, 1900, 800, 'auth', 'the five states strip'),

    // ── Bengali ──
    A('BengaliShell.dc.html', 0, 0, 1440, 1140, 'bengali', '/home · shell · desk · bn'),
    A('BengaliApprove.dc.html', 1560, 0, 1280, 900, 'bengali', '/approve · bn'),
    A('BengaliDraft.dc.html', 2960, 0, 640, 1620, 'bengali', 'drawer · draft · bn'),
  ],
  annotations: [
    { id: 'brief-shell', page: 'shell', x: 0, y: -220, w: 620,
      text: 'S0 — Shell, drawer system, shared surfaces.\n\nEverything S1–S15 draws is composed from these five pages. The rail, the top bar, the six drawer families and the five shared screens are locked here so no later canvas has to invent them.\n\nThe rail is the access rule made visible: a role with no access has no entry, not a disabled one.' },
    { id: 'brief-drawers', page: 'drawers', x: 0, y: -260, w: 660,
      text: 'The side-drawer contract.\n\nLists on the page, details in the drawer. 560px default, 720px when the body is a grid. A drawer never opens a second drawer — a link inside one navigates to the target’s page with that row’s drawer already open (?open=…), so a push notification and an approve-inbox source link land in the same place.\n\nSix families: record · draft · exception · gate · person · document.' },
    { id: 'brief-shared', page: 'shared', x: 0, y: -240, w: 640,
      text: 'The five screens every role shares, each populated and empty.\n\nThe empty states are the work here. An empty approve inbox that says “nothing routed to you” teaches a storekeeper that the screen is not for them; one that names the two draft kinds a storekeeper raises, and the door that raises each, teaches them the opposite.' },
    { id: 'brief-auth', page: 'auth', x: 0, y: -200, w: 620,
      text: 'Auth, and the five states every later artboard points back at.\n\nThe weave wash is one of its four sanctioned uses, and the only place it covers this much of the viewport. Loading is the mark, never a circular spinner — there is not one anywhere in this system.' },
    { id: 'brief-bengali', page: 'bengali', x: 0, y: -220, w: 620,
      text: 'The Bengali pass, at the length the floor actually reads.\n\nAnek Bangla at the same px, one step looser. No negative tracking (matra clusters break), no 700 weight, no uppercase transform. Identifiers, money and quantities stay Latin mono in both languages: the paper on the desk says PO-BF-2044, so the screen does too.' },
  ],
  launch: { view: 'canvas', page: 'shell' },
}

writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2))
made.push('canvas.json')

writeFileSync(join(OUT, '.made'), made.join('\n'))
console.log('emitted', made.length + ':', made.join(' '))
