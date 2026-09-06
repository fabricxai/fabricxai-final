/** Emits every S1 artboard plus canvas.json. Run: node _build.mjs */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIGHT, DARK, SANS, MONO, BANGLA, board, mark, slashes, thread, statusLabel, eyebrow,
  mono, badge, btn, kbd, avatar, fact, confidence } from '../shell-and-drawers/_kit.mjs'
import { rail, topBar, pageHeader } from '../shell-and-drawers/_shell.mjs'
import { drawer, gateChip, history, linkRow, readOnlyNote, withheld } from '../shell-and-drawers/_drawer.mjs'
import { screen, bodyCol, sectionHeading, card, row, figureTile, emptyState, note, caption,
  refusalNote, step, arrow, deskCard, miniRow } from './_page.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const made = []
const emit = (name, src) => { made.push(name); writeFileSync(join(OUT, name), src) }

/* ── The exceptions, as sentences. Severity is the selvage AND the label. ──── */

const EXCEPTIONS = [
  { status: 'late', critical: true, code: 'PO-BF-2044',
    text: 'will miss ex-factory by 4 days — cutting has not started because the PP sample for ST-2610 is still with H&M',
    sub: '42,000 pcs · $203,700 FOB · ex-factory 18 Dec 2026', meta: '9 days' },
  { status: 'late', code: 'LC-BF-7781',
    text: 'latest shipment 21 Dec now falls before PO-BF-2044’s revised ex-factory',
    sub: 'Bestseller A/S · $486,200 · no amendment raised', meta: '2 days' },
  { status: 'at-risk', code: 'UD-2026-118',
    text: 'balance is 1,240 m against six open bonded issues — Karim Uddin has asked to overdraw by 160 m',
    sub: 'refused at the counter at 11:20; the request is yours to decide', meta: '4 h' },
  { status: 'at-risk', code: 'PO-IMP-0311',
    text: '9 days past the promised delivery and the lay needs it on 6 Dec — chase Shanghai Textile',
    sub: '12,400 m of 40s poplin · BTB-2026-0093', meta: '9 days' },
]

const DRAFTS_BY_DESK = [
  ['Store', 3, 'GRN readings from challan photos', 0.82, '26 h', 'late'],
  ['Merchandising', 2, 'style measurements and one new order', 0.74, '26 h', 'late'],
  ['Procurement', 1, 'a purchase order off a pro-forma', 0.96, '5 h', 'done'],
  ['Commercial', 1, 'an LC amendment off the bank’s advice', 0.93, '3 h', 'done'],
]

const DESKS = [
  ['Store', '/store/receive', 'Karim Uddin', '3 trucks at the gate · 1 GRN uninspected', 'at-risk'],
  ['Production', '/lines/hourly', 'Shilpi Begum, Rina Das', 'L4 behind plan by 22% · 42 min of downtime', 'late'],
  ['Quality', '/quality/inline', 'Mitu Rani', '2 lots finished and never inspected', 'at-risk'],
  ['Cutting', '/cutting', 'Rafiq Islam', 'queue clear — PP holds ST-2610', 'on-track'],
  ['Maintenance', '/maintenance', 'Sabbir Khan', '1 line-down ticket, claimed 13:24', 'late'],
  ['Shipment', '/shipment', 'Jahid Hasan', '1 shipment with no EXP number', 'at-risk'],
  ['Planning', '/planning', 'Nazmul Karim', '4 lines held open from 6 Dec', 'at-risk'],
  ['Procurement', '/procurement', 'Procurement Officer', '2 POs past their delivery date', 'at-risk'],
  ['Commercial', '/lcs', 'Tanvir Ahmed', '1 LC date conflict · 1 discrepant presentation', 'late'],
  ['Finance', '/finance', 'Salma Khatun', 'nothing waiting', 'on-track'],
  ['Compliance', '/compliance', 'Rumi Chowdhury', 'fire drill logged · next due 4 Jan', 'on-track'],
  ['Workforce', '/workforce', 'Farzana Yasmin', 'November run computed, awaiting your approval', 'at-risk'],
]

const exceptionRows = () => EXCEPTIONS.map((e) => row({
  ...e, right: statusLabel(e.status, e.status === 'late' ? 'late' : 'at risk'),
})).join('')

const draftRows = () => DRAFTS_BY_DESK.map(([desk, n, what, conf, age, tone]) => row({
  status: 'done', code: desk, text: `${n} draft${n === 1 ? '' : 's'} — ${what}`,
  sub: `oldest ${age} · weakest field ${conf.toFixed(2)}`,
  right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(conf)}${badge('accent', age)}</span>`,
})).join('')

const deskRows = (override = {}) => DESKS.map(([desk, landing, who, queue, status]) => row({
  ...(override[desk] ? { status: override[desk][1] } : {}),
  status, code: landing, text: `<strong style="font-weight: 600;">${desk}</strong> — ${override[desk]?.[0] ?? queue}`,
  sub: who, right: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5.5 2.5L11 8l-5.5 5.5" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/></svg>`,
})).join('')

const FIGURES = [
  { label: 'Order book', value: '19', unit: 'orders', basis: '412,000 pieces across 5 statuses', source: 'counted from the order book', asOf: 'just now' },
  { label: 'On-time delivery', value: '91', unit: '%', basis: '31 of 34 shipments left on the ex-factory date', source: 'minimum 8 shipments before a percentage is stated', asOf: 'yesterday' },
  { label: 'Efficiency', value: '68', unit: '%', basis: '142 line-days of hourly output', source: 'earned minutes over available minutes, as one ratio for the period', asOf: 'yesterday', tone: 'var(--fx-success)' },
  { label: 'DHU', value: '4.2', basis: '26 days of inline checks', source: 'defects per hundred units', asOf: 'yesterday', tone: 'var(--fx-warning)' },
  { label: 'Cash position · USD', value: '173,260', basis: '$486,200 in against $312,940 out', source: 'one currency only — USD receivables against USD payables', asOf: 'today, 06:00' },
]

const PAYROLL_TILE = { label: 'Payroll · November', value: '৳1,04,82,640', basis: '2,412 workers · computed by Farzana Yasmin, awaiting your approval', source: 'gazette v2026-1 · 208-hour basic divisor', asOf: '2 Dec, 09:14', tone: 'var(--fx-warning)' }

const homeInner = ({ payrollTile, deskOverride = {} }) => `
  ${pageHeader({ eyebrow: 'What needs you', title: 'Your work', meta: 'Wednesday, 2 December 2026 · Barakah Fashions Ltd' })}

  ${sectionHeading('What is wrong', `${EXCEPTIONS.length} open`)}
  ${card(exceptionRows())}
  <div style="height: 30px;"></div>

  ${sectionHeading('Decide now', '7 drafts, 2 ageing')}
  ${card(draftRows())}
  <div style="height: 30px;"></div>

  ${sectionHeading('The numbers', '2026-11-02 → 2026-12-02')}
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
    ${FIGURES.map(figureTile).join('')}
    ${payrollTile}
  </div>
  <div style="height: 30px;"></div>

  ${sectionHeading('Desks that need a person', `${DESKS.length} desks`)}
  ${card(deskRows(deskOverride))}
`

/* ══════════════════════════════════════════════════════════════════════════
   1 · /home — the owner's morning
   ══════════════════════════════════════════════════════════════════════════ */

emit('Main.dc.html', screen({
  h: 2160, active: 'home', badges: { approve: 7 }, markState: 'listening',
  inner: `${homeInner({ payrollTile: figureTile(PAYROLL_TILE) })}
  ${note('Order is the argument: what is wrong, then what to decide, then the numbers, then the desks. Plan 2.1 settled that home wins over /dashboard because queues are actionable and figures are context — an owner acts first and reads second. Every row here opens a drawer; nothing on this screen is a dead end. The payroll tile is a PROPOSAL — the strip in owner-figures.tsx today is order book, OTD, efficiency, DHU and cash, with no payroll figure at all.')}`,
}))

/* ── 2 · the same page as the admin ──────────────────────────────────────── */

emit('HomeAdmin.dc.html', screen({
  h: 2160, phrase: 'Admin', who: 'AD', active: 'home', badges: { approve: 7 },
  inner: `${homeInner({ deskOverride: { Workforce: ['the roster, without the wage figures — payroll is HR’s and the owner’s', 'done'] }, payrollTile: `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; min-width: 0;">
      ${eyebrow('Payroll · November')}
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        ${mark(24, LIGHT, { state: 'blocked' })}
        <div style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
          Payroll is HR’s and the owner’s. You can see the roster in Workforce — headcount, sections and lines are ordinary factory data — but nothing carrying a wage figure.
        </div>
      </div>
    </div>` })}
  ${note('The admin is the owner’s twin everywhere but here. Two things make this the only difference worth drawing: the payroll gate is `hr` and `owner` — admin is NOT in it — and it throws a 403 carrying nothing at all, deliberately, so a screen that showed a button and then said nothing would be indistinguishable from a broken one. The Workforce desk row below reads the same way for an admin.')}`,
}))

/* ── 3 · /home empty — two of them, because day one is not a calm day ────── */

emit('HomeEmpty.dc.html', screen({
  h: 1180, active: 'home',
  inner: `${pageHeader({ eyebrow: 'What needs you', title: 'Your work', meta: 'Wednesday, 2 December 2026' })}
  <div style="display: flex; flex-direction: column; gap: 34px;">
    <div>
      ${caption('calm — a factory that is running')}
      ${emptyState('Nothing waiting on you',
        'When a draft, exception or overdue desk item lands, it shows up here. Until then the factory pulse and the order book are a good place to look.',
        `<div style="display: flex; gap: 10px;">${btn('secondary', 'The numbers')}${btn('secondary', 'Order book')}</div>`)}
      <div style="height: 18px;"></div>
      ${sectionHeading('The numbers', 'still here')}
      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
        ${figureTile(FIGURES[0])}${figureTile(FIGURES[1])}${figureTile(FIGURES[2])}
      </div>
    </div>
    <div>
      ${caption('day one — a factory with nothing in it yet')}
      ${emptyState('Your factory has no orders yet',
        'Nothing here can fill until somebody books an order or the store receives something. Start with what the factory is made of — items, locations, lines and workers — then book the first order.',
        `<div style="display: flex; gap: 10px;">${btn('primary', 'Set up the factory')}${btn('secondary', 'Book an order')}</div>`)}
      ${note('Two empties, not one. The calm state says “look around”; on a factory with no orders there is nothing to look at, and offering the pulse to somebody with no data is the shape of a screen that has not met its first day.')}
    </div>
  </div>`,
}))

/* ── 4 · /home loading and error ─────────────────────────────────────────── */

emit('HomeStates.dc.html', screen({
  h: 1080, active: 'home',
  inner: `${pageHeader({ eyebrow: 'What needs you', title: 'Your work' })}
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; align-items: start;">
    <div>
      ${caption('loading — the weave, never a spinner')}
      <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 64px 24px;">
        ${mark(48, LIGHT, { state: 'thinking' })}
        <span style="font: 400 13px/1 ${MONO}; color: var(--fx-text-tertiary);">Reading the factory…</span>
      </div>
      ${note('The sections stream independently — a slow analytics query must not hold the exceptions back, so the queues paint first and the figures fill in under them.')}
    </div>
    <div>
      ${caption('error — one panel fails, the page does not')}
      ${card(exceptionRows())}
      <div style="height: 18px;"></div>
      ${sectionHeading('The numbers')}
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">
        ${figureTile(FIGURES[0])}
        ${figureTile({ label: 'On-time delivery', unavailable: 'only 5 shipments in this window; the policy asks for 8 before a percentage is stated', basis: '5 of 34 shipments have left', source: 'minimum 8 shipments before a percentage is stated' })}
      </div>
      <div style="height: 16px;"></div>
      <div style="border: 1px solid var(--fx-danger); border-radius: 8px; padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; background: var(--fx-bg-surface);">
        ${mark(32, LIGHT, { state: 'blocked' })}
        <div style="font: 600 17px/1.25 ${SANS};">The desk summaries did not load</div>
        <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">Everything above is current. The desk queues could not be read just now — nothing has changed on any desk because of it.</div>
        ${btn('secondary', 'Try again')}
      </div>
      ${note('Two different absences and they must not look alike. “Unavailable — only 5 shipments” is a figure REFUSING to state itself, which is a correct answer; the red panel is a failure. A zero in either place would be a number somebody acts on.')}
    </div>
  </div>`,
}))

/* ── 5 · phone — the three Pulse tabs ────────────────────────────────────── */

const phoneFrame = (title, tab, inner) => `
  <div style="width: 390px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
    ${caption(title)}
    <div style="width: 390px; height: 700px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; background: var(--fx-bg-canvas);">
      <div style="flex-shrink: 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); padding: 12px 16px; min-height: 60px; display: flex; align-items: center; gap: 10px;">
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
          <span style="font: 600 17px/1.2 ${SANS};">${['What’s wrong', 'Approve', 'Figures'][tab]}</span>
          <span style="font: 500 10.5px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary);">Owner · Barakah Fashions</span>
        </div>
        ${mark(22, LIGHT, { state: 'listening' })}
      </div>
      <div style="flex: 1; min-height: 0; padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: hidden;">${inner}</div>
      <div style="display: flex; background: var(--fx-bg-surface); border-top: 1px solid var(--fx-border-default);">
        ${['What’s wrong', 'Approve', 'Figures'].map((t, i) => `<span style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 56px; padding: 8px 4px; color: var(--fx-text-${i === tab ? 'primary' : 'tertiary'});">
          <span style="display: block; width: 2px; height: 12px; transform: skewX(-34deg); background: ${i === tab ? 'var(--fx-accent)' : 'transparent'};"></span>
          <span style="font: ${i === tab ? '600' : '500'} 12px/1.2 ${SANS};">${t}</span>
        </span>`).join('')}
      </div>
    </div>
  </div>`

emit('HomePhone.dc.html', board({
  w: 1400, h: 900, pad: 40,
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Pulse — the owner and admin skin')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 92ch; text-wrap: pretty;">
      Three tabs, and the only write is approve or reject. Everything that changes the rules of the factory — roles, policies, approval routing, payroll computation — is deliberately absent: that is desk work.
    </div>
  </div>
  <div style="display: flex; gap: 32px; align-items: flex-start;">
    ${phoneFrame('1 · what’s wrong', 0, EXCEPTIONS.slice(0, 3).map((e) => `<div class="fx-selvage" data-status="${e.status}" style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">
        <div style="flex: 1; min-width: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px;">
          <div style="display: flex; align-items: baseline; gap: 8px;">${mono(e.code, { size: 12 })}${statusLabel(e.status, e.status === 'late' ? 'late' : 'at risk')}</div>
          <span style="font: 400 13.5px/1.5 ${SANS}; text-wrap: pretty;">${e.text}</span>
        </div>
      </div>`).join(''))}
    ${phoneFrame('2 · approve', 1, `${DRAFTS_BY_DESK.slice(0, 3).map(([desk, n, what, conf, age]) => `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); padding: 12px 14px; display: flex; flex-direction: column; gap: 9px;">
        <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">${mono(desk, { size: 12 })}${badge('accent', age)}</div>
        <span style="font: 400 13.5px/1.5 ${SANS}; text-wrap: pretty;">${n} draft${n === 1 ? '' : 's'} — ${what}</span>
        ${confidence(conf)}
        <div style="display: flex; gap: 8px;">${btn('ghost', 'Reject', { size: 'sm', tap: 44 })}${btn('secondary', 'Approve', { size: 'sm', tap: 44 })}</div>
      </div>`).join('')}`)}
    ${phoneFrame('3 · figures', 2, FIGURES.slice(0, 3).map((f) => figureTile(f)).join(''))}
  </div>
  ${note('The tab bar is the navigation — the rail is hidden entirely below 640px rather than duplicated behind a hamburger. A drawer opened from any of these becomes a bottom sheet with the same footer.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   6–9 · The owner's inbox, alerts and refusals — every desk at once
   ══════════════════════════════════════════════════════════════════════════ */

const chip = (label, { on = false, count } = {}) =>
  `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-border-${on ? 'default' : 'subtle'}); background: ${on ? 'var(--fx-bg-selected)' : 'transparent'}; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-${on ? 'primary' : 'secondary'});">
    ${label}${count !== undefined ? `<span data-numeric style="font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary);">${count}</span>` : ''}</span>`

const checkbox = (on = false) =>
  `<span style="width: 17px; height: 17px; flex-shrink: 0; border-radius: 4px; border: 1px solid var(--fx-border-${on ? 'strong' : 'default'}); background: ${on ? 'var(--fx-text-primary)' : 'var(--fx-bg-surface)'}; display: inline-flex; align-items: center; justify-content: center;">
    ${on ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.6 2.6L10 3" stroke="var(--fx-text-inverse)" stroke-width="1.8"/></svg>' : ''}</span>`

const inboxRow = ({ sel, code, desk, what, who, fields, conf, age, ageTone = 'var(--fx-text-tertiary)', kind }) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: grid; grid-template-columns: 26px minmax(0, 1fr) 180px 78px 170px; align-items: center; gap: 16px; padding: 13px 18px; min-height: 44px;">
    ${checkbox(sel)}
    <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
        ${mono(code, { size: 12.5 })}
        <span style="font: 400 14px/1.4 ${SANS};">${what}</span>
        ${badge('neutral', desk)}${badge('accent', kind)}
      </div>
      <span style="font: 400 12.5px/1.4 ${SANS}; color: var(--fx-text-tertiary);">raised by ${who} · ${fields}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 5px;">${eyebrow('Weakest field')}${confidence(conf)}</div>
    <div style="display: flex; flex-direction: column; gap: 4px;">${eyebrow('Age')}<span data-numeric style="font: 500 13px/1.2 ${MONO}; color: ${ageTone};">${age}</span></div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">${btn('ghost', 'Reject', { size: 'sm' })}${btn('secondary', 'Approve', { size: 'sm' })}</div>
  </div>`

emit('Approve.dc.html', screen({
  h: 1160, active: 'approve', badges: { approve: 7 },
  inner: `${pageHeader({ eyebrow: 'Every desk, in one place', title: 'Approve inbox', meta: '7 drafts · 2 older than 2 days' })}
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${eyebrow('By desk')}
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${chip('All desks', { on: true, count: 7 })}${chip('Store', { count: 3 })}${chip('Merchandising', { count: 2 })}${chip('Procurement', { count: 1 })}${chip('Commercial', { count: 1 })}
      </div>
      ${eyebrow('By kind')}
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${chip('All kinds', { on: true })}${chip('Read from a document', { count: 5 })}${chip('Composed in conversation', { count: 1 })}${chip('Typed by a person', { count: 1 })}
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
      <span style="display: inline-flex; gap: 0; border: 1px solid var(--fx-border-default); border-radius: 4px; overflow: hidden;">
        <span style="padding: 8px 13px; min-height: 36px; display: inline-flex; align-items: center; font: 600 12.5px/1 ${SANS}; background: var(--fx-bg-selected);">Oldest first</span>
        <span style="padding: 8px 13px; min-height: 36px; display: inline-flex; align-items: center; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-secondary); border-left: 1px solid var(--fx-border-default);">Lowest confidence</span>
        <span style="padding: 8px 13px; min-height: 36px; display: inline-flex; align-items: center; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-secondary); border-left: 1px solid var(--fx-border-default);">By desk</span>
      </span>
      <span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary);">Ageing over two days sorts to the top and stays there — an old draft is the one nobody owns.</span>
      <span style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
        ${btn('secondary', 'Approve 2 selected')}
        <span style="display: inline-flex; gap: 7px;">${kbd('j')}${kbd('k')}${kbd('a')}${kbd('r')}${kbd('x')}</span>
      </span>
    </div>

    ${card(`
      ${inboxRow({ sel: true, code: 'ST-2610', desk: 'Merchandising', kind: 'from a document', what: 'style measurements read from the tech pack', who: 'Rashida Akter', fields: '23 fields · 3 below 0.90', conf: 0.74, age: '26 h', ageTone: 'var(--fx-danger)' })}
      ${inboxRow({ sel: true, code: 'REQ-0783', desk: 'Store', kind: 'in conversation', what: 'requisition for 900 m of 40s poplin', who: 'MARBIM, in conversation', fields: '4 fields · unscored', conf: null, age: '25 h', ageTone: 'var(--fx-warning)' })}
      ${inboxRow({ code: 'GRN-2291', desk: 'Store', kind: 'from a document', what: 'goods receipt read from a challan photo', who: 'Karim Uddin', fields: '7 fields · one below 0.90', conf: 0.82, age: '2 h' })}
      ${inboxRow({ code: 'LC-BF-7781', desk: 'Commercial', kind: 'from a document', what: 'amendment read from the bank’s advice', who: 'Tanvir Ahmed', fields: '9 fields', conf: 0.93, age: '3 h' })}
      ${inboxRow({ code: 'PO-IMP-0327', desk: 'Procurement', kind: 'from a document', what: 'purchase order read from a pro-forma', who: 'Procurement Officer', fields: '11 fields', conf: 0.96, age: '5 h' })}
      ${inboxRow({ code: 'GRN-2288', desk: 'Store', kind: 'typed', what: 'goods receipt entered by hand', who: 'Karim Uddin', fields: '7 fields · typed by a person', conf: null, age: '6 h' })}
    `)}
    ${note('A batch approves each draft on its own terms — one refusal does not roll the others back, and the outcome list says which went through. Two of these carry no confidence for opposite reasons: REQ-0783 because a model composed it in conversation with nothing to measure, GRN-2288 because a person typed it. The inbox says which, because “unscored” and “human edit” are not the same fact.')}
  </div>`,
}))

emit('ApproveEmpty.dc.html', screen({
  h: 900, active: 'approve',
  inner: `${pageHeader({ eyebrow: 'Every desk, in one place', title: 'Approve inbox', meta: 'nothing waiting' })}
  <div class="fx-weave" style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 34px 32px; display: flex; flex-direction: column; align-items: center; gap: 18px; background-color: var(--fx-bg-surface);">
    ${mark(48, LIGHT)}
    <div style="font: 600 17px/1.25 ${SANS};">Every desk is clear</div>
    <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); max-width: 62ch; text-align: center; text-wrap: pretty;">
      As owner you are the last approver for every kind of draft in the factory, and the routing rules decide which ones reach you first. Four kinds route here today:
    </div>
    <div style="width: 100%; max-width: 660px;">
      ${[['Bonded goods receipts', 'Store → Receive', 'Anything drawn against a UD needs an owner, because the exposure is customs, not stock.'],
         ['Payroll runs', 'Workforce → the monthly run', 'HR computes it; signing off what 2,412 people are paid is yours alone.'],
         ['UD overdraw requests', 'refused at the store counter', 'A storekeeper cannot clear their own refusal.'],
         ['Anything a rule sends you', 'Settings → Approval rules', 'You wrote the rules; you can change which of these lands here.']]
        .map(([what, where, why]) => `<div style="display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--fx-border-subtle);">
          <span style="width: 2px; height: 34px; flex-shrink: 0; transform: skewX(-34deg); background: var(--fx-accent);"></span>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font: 600 14px/1.35 ${SANS};">${what}</span>
            <span style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${why}</span>
            <span style="font: 400 12px/1.4 ${MONO}; color: var(--fx-text-tertiary);">${where}</span>
          </div>
        </div>`).join('')}
    </div>
  </div>
  ${note('S0 locked the teaching empty state; the owner’s version differs in one way — it names the rules screen, because the owner is the only person who can change what arrives here.')}`,
}))

emit('Alerts.dc.html', screen({
  h: 940, active: undefined,
  inner: `${pageHeader({ eyebrow: 'From the jobs that watch the factory', title: 'Alerts', meta: '6 open across 12 desks' })}
  <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
    ${chip('All', { on: true, count: 6 })}${chip('Money', { count: 2 })}${chip('Floor', { count: 3 })}${chip('Compliance', { count: 1 })}
  </div>
  ${card(`
    ${row({ status: 'late', code: '11:20', text: 'Karim Uddin asked to draw 1,400 m against UD-2026-118 — 160 m over the balance', sub: 'refused at the counter; the overdraw request is waiting on you', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'UD')}${statusLabel('late', 'act now')}</span>` })}
    ${row({ status: 'late', code: '09:04', text: 'LC-BF-7781’s latest shipment (21 Dec) now falls before PO-BF-2044’s ex-factory', sub: 'raise an amendment or move the ship date — both are buyer conversations', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'LC')}${statusLabel('late', 'act now')}</span>` })}
    ${row({ status: 'at-risk', code: '08:30', text: 'L4 run rate is 22% behind the day plan — flatlock #7 has been down 42 minutes', sub: 'TKT-0442 claimed by Sabbir Khan at 13:24', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'line')}${statusLabel('at-risk', 'watch')}</span>` })}
    ${row({ status: 'at-risk', code: 'yesterday', text: 'Two drafts have been waiting more than 24 hours', sub: 'ST-2610 measurements (26 h) and REQ-0783 (25 h)', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'draft')}${statusLabel('at-risk', 'watch')}</span>` })}
    ${row({ status: 'at-risk', code: 'yesterday', text: 'November payroll is computed and waiting on your approval', sub: '2,412 workers · ৳1,04,82,640 · Farzana Yasmin', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'payroll')}${statusLabel('at-risk', 'watch')}</span>` })}
    ${row({ status: 'done', code: 'Mon', text: 'Fire drill logged for December — next one due 4 Jan 2027', sub: 'Rumi Chowdhury · compliance', right: `<span style="display: flex; gap: 10px; align-items: center;">${badge('neutral', 'audit')}${statusLabel('done', 'info')}</span>` })}
  `)}
  ${note('The payroll alert reaches the owner and NOT the admin — it is the one row on this screen whose visibility differs between the twins, and it differs because the gate underneath it does.')}`,
}))

emit('Refused.dc.html', screen({
  h: 940, active: 'refused',
  inner: `${pageHeader({ eyebrow: 'Every desk, last 7 days', title: 'Refused writes', meta: '9 refusals across 5 desks' })}
  ${readOnlyNote('the refusal report')}
  <div style="display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap;">
    ${chip('All desks', { on: true, count: 9 })}${chip('Store', { count: 4 })}${chip('Cutting', { count: 2 })}${chip('Production', { count: 2 })}${chip('Shipment', { count: 1 })}
  </div>
  ${card(`
    ${row({ status: 'late', code: 'today 11:20', text: 'Karim Uddin · issue 1,400 m against UD-2026-118 — the balance is 1,240 m', sub: 'gate: UD balance · the overdraw request is with you', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
    ${row({ status: 'late', code: 'today 09:52', text: 'Rafiq Islam · start a lay for ST-2610 — the PP sample is still with H&M', sub: 'gate: PP approval · three attempts, all refused', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
    ${row({ status: 'late', code: 'Mon 15:41', text: 'Karim Uddin · receive against PO-IMP-0344 — the order has no back-to-back LC', sub: 'gate: BTB headroom · commercial has to open one first', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
    ${row({ status: 'at-risk', code: 'Mon 14:10', text: 'Jahid Hasan · submit bank documents for SHP-0912 — no EXP number yet', sub: 'gate: EXP number · commercial files it', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
    ${row({ status: 'done', code: 'Sun 10:02', text: 'Karim Uddin · issue ROLL-11482 to lay 3 — shade B on an A lay', sub: 'gate: shade mix · the lay was rebuilt with B rolls and went through', right: statusLabel('done', 'cleared') })}
  `)}
  ${note('The owner reads this as a map of where the factory is pushing against its own rules. Four of the five here are one order — PO-BF-2044 — which is the argument for reading refusals in a list rather than one desk at a time.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   10–11 · What the owner sees of everybody else's work
   Later sessions reference this grid rather than re-deciding it.
   ══════════════════════════════════════════════════════════════════════════ */

const miniHead = (text) => `<div style="padding: 10px 12px 8px; border-bottom: 1px solid var(--fx-border-subtle);">${eyebrow(text, 10)}</div>`

const asOwner = (text) =>
  `<div style="border-top: 1px solid var(--fx-accent); background: var(--fx-accent-subtle); padding: 9px 12px; display: flex; align-items: center; gap: 8px;">
    <span style="width: 2px; height: 13px; transform: skewX(-34deg); background: var(--fx-accent-on); flex-shrink: 0;"></span>
    <span style="font: 500 11.5px/1.4 ${SANS}; color: var(--fx-accent-on); text-wrap: pretty;">${text}</span>
  </div>`

const deskGrid = (name, h, intro, cards) => emit(name, board({
  w: 1560, h, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('The owner covering a desk')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">${intro.title}</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">${intro.body}</div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px 26px;">${cards}</div>
  ${note(intro.note)}`,
}))

deskGrid('DesksFloor.dc.html', 1080, {
  title: 'The floor desks, as the owner opens them',
  body: 'An owner covering a shift gets the desk’s own screen — same density, same offline queue, same gates. `requireRole` admits owner and admin to every action as supervisory roles, so nothing here is a second implementation; the only additions are the two approvals that are the owner’s alone.',
  note: 'Floor screens stay at floor density even when an owner opens them on a desk monitor: the storekeeper standing next to them is reading the same screen, and two layouts for one screen is how a shared tablet becomes an argument.',
}, [
  deskCard({ desk: 'Store', route: '/store/receive', landing: 'Karim Uddin’s landing.',
    inner: `${miniHead('At the gate — 3 trucks')}${miniRow('at-risk', 'Shanghai Textile — 12,400 m · bonded', '26 rolls')}${miniRow('on-track', 'Ha-Meem Accessories — 84 cartons', '84 ctn')}${miniRow('done', 'Padma Poly Bags — received 11:04', '')}` }),
  deskCard({ desk: 'Production', route: '/lines/hourly', landing: 'Shilpi Begum’s landing — her lines only; the owner sees all eight.',
    inner: `${miniHead('This hour — 14:00 to 15:00')}${miniRow('late', 'L4 · 312 of 400 · flatlock down 42 min', '−22%')}${miniRow('on-track', 'L1 · 408 of 400', '+2%')}${miniRow('on-track', 'L2 · 396 of 400', '−1%')}` }),
  deskCard({ desk: 'Quality', route: '/quality/inline', landing: 'Mitu Rani’s landing.',
    inner: `${miniHead('Finished and never inspected — 2 lots')}${miniRow('at-risk', 'PO-BF-2041 · 8,400 of 12,000 finished', 'DHU 4.8')}${miniRow('at-risk', 'PO-BF-2039 · 12,000 of 12,000', 'DHU 3.1')}${miniRow('done', 'PO-BF-2038 · passed 11 Nov', '')}` }),
  deskCard({ desk: 'Cutting', route: '/cutting', landing: 'Rafiq Islam’s landing.',
    inner: `${miniHead('Queue — 1 held')}${miniRow('late', 'ST-2610 · PP still with H&M — cannot start', 'held')}${miniRow('on-track', 'ST-2588 · lay 7 ready', '1,240 m')}${miniRow('done', 'ST-2571 · cut report filed', '')}` }),
  deskCard({ desk: 'Maintenance', route: '/maintenance', landing: 'Sabbir Khan’s landing.',
    inner: `${miniHead('Tickets — 1 line down')}${miniRow('late', 'TKT-0442 · L4 flatlock #7 · claimed 13:24', '42 min')}${miniRow('at-risk', 'PM overdue · FL-07 last serviced 49 days ago', '')}${miniRow('done', 'TKT-0440 · resolved 09:12', '')}` }),
  deskCard({ desk: 'Shipment', route: '/shipment', landing: 'Jahid Hasan’s landing.',
    inner: `${miniHead('Pipeline — pack → ex-factory → EXP → docs → bank')}${miniRow('at-risk', 'SHP-0912 · packed, no EXP number', 'blocked')}${miniRow('on-track', 'SHP-0908 · documents with the bank', '')}${miniRow('done', 'SHP-0901 · realised 28 Nov', '$96,400')}` }),
].join(''))

deskGrid('DesksOffice.dc.html', 1140, {
  title: 'The office desks, as the owner opens them',
  body: 'Same rule, and two exceptions that matter. The payroll run and the cost sheet carry an approval only an owner can give, so those two screens gain a strip the desk role never sees. Everything else is the desk’s own screen unchanged.',
  note: 'The amber strip is the only “as owner” affordance in the product, and it appears exactly twice. Adding a third would mean the owner has a parallel product, which is the thing this grid exists to prevent.',
}, [
  deskCard({ desk: 'Planning', route: '/planning', landing: 'Nazmul Karim’s landing.',
    inner: `${miniHead('The board — 8 lines, 4 weeks')}${miniRow('at-risk', 'L1–L4 held open from 6 Dec for ST-2610', '4 lines')}${miniRow('on-track', 'L5–L6 · ST-2588 through 19 Dec', '')}${miniRow('on-track', 'L7–L8 · ST-2571 finishing', '')}` }),
  deskCard({ desk: 'Procurement', route: '/procurement', landing: 'The requisition and PO board.',
    inner: `${miniHead('Needed within a week — 2')}${miniRow('late', 'PO-IMP-0311 · 9 days past promised delivery', '12,400 m')}${miniRow('at-risk', 'REQ-0783 · 900 m, needed 6 Dec', 'unordered')}${miniRow('done', 'PO-BF-0982 · received in full', '')}` }),
  deskCard({ desk: 'Commercial', route: '/lcs', landing: 'Tanvir Ahmed’s landing.',
    inner: `${miniHead('LC register — 1 conflict')}${miniRow('late', 'LC-BF-7781 · latest shipment before ex-factory', '$486,200')}${miniRow('at-risk', 'BTB-2026-0093 · 12% headroom left', '')}${miniRow('on-track', 'LC-BF-7774 · clean', '$203,700')}` }),
  deskCard({ desk: 'Finance', route: '/finance', landing: 'Salma Khatun’s landing. Owner and admin both write here.',
    inner: `${miniHead('Cash · USD')}${miniRow('on-track', 'Receivables $486,200 against payables $312,940', 'net $173,260')}${miniRow('at-risk', '1 discrepant presentation ageing', '11 days')}${miniRow('done', 'SHP-0901 realised 28 Nov', '$96,400')}`,
    extra: 'Owner and admin both have full write on /finance and /lcs — the audit’s one explicit statement about the twins outside payroll.' }),
  deskCard({ desk: 'Compliance', route: '/compliance', landing: 'Rumi Chowdhury’s landing.',
    inner: `${miniHead('Due dates — nothing overdue')}${miniRow('on-track', 'Fire drill logged · next 4 Jan 2027', '')}${miniRow('on-track', 'Accord inspection · 14 Feb 2027', '')}${miniRow('at-risk', '1 corrective action assigned to you', 'CAP-0031')}` }),
  deskCard({ desk: 'Workforce', route: '/workforce', landing: 'Farzana Yasmin’s landing.',
    inner: `${miniHead('November run — computed')}${miniRow('at-risk', '2,412 workers · ৳1,04,82,640 · awaiting approval', '')}${miniRow('on-track', 'Roster · 2,412 active across 8 lines', '')}${asOwner('Approve this run — yours alone. HR computes it; you sign it.')}` }),
  deskCard({ desk: 'Costing', route: '/costing', landing: 'The sheet list; the studio sits behind a door.',
    inner: `${miniHead('Cost sheets — 1 awaiting sign-off')}${miniRow('at-risk', 'ST-2610 · $4.85 FOB · margin 11.4%', 'draft')}${miniRow('on-track', 'ST-2588 · $5.20 FOB signed 24 Nov', '')}${asOwner('Approve this sheet — a quoted price is a promise only you make.')}` }),
  deskCard({ desk: 'Orders', route: '/orders', landing: 'The book, and where the viewer lands too.',
    inner: `${miniHead('Order book — 19 open')}${miniRow('late', 'PO-BF-2044 · H&M · ex-factory 18 Dec', '42,000')}${miniRow('at-risk', 'PO-BF-2041 · Primark · in finishing', '12,000')}${miniRow('on-track', 'PO-BF-2038 · C&A · shipped', '8,000')}` }),
  deskCard({ desk: 'Sampling', route: '/sampling', landing: 'Rashida Akter writes; quality and production read.',
    inner: `${miniHead('Samples out — 1 blocking a cut')}${miniRow('late', 'ST-2610 PP · with H&M since 21 Nov', '11 days')}${miniRow('on-track', 'ST-2588 fit · approved 18 Nov', '')}${miniRow('done', 'ST-2571 shipment sample · closed', '')}` }),
].join(''))

/* ══════════════════════════════════════════════════════════════════════════
   12–14 · /setup — what the factory is made of
   ══════════════════════════════════════════════════════════════════════════ */

const setupSection = ({ id, title, action, blurb, rows, cta, proposed }) =>
  `<div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 16px;">
      ${slashes(LIGHT, { accent: true, h: 15 })}
      <h2 style="font: 600 20px/1.2 ${SANS}; margin: 0;">${title}</h2>
      ${proposed ? badge('neutral', 'not on /setup today') : ''}
      <span style="margin-left: auto; font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary);">${action}</span>
    </div>
    <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 84ch; text-wrap: pretty;">${blurb}</div>
    ${card(rows)}
    <div style="display: flex; justify-content: flex-end;">${cta}</div>
  </div>`

const setupRow = (code, name, detail, right) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: flex; align-items: center; gap: 16px; padding: 11px 18px; min-height: 44px;">
    <span style="width: 118px; flex-shrink: 0;">${mono(code, { size: 12.5 })}</span>
    <span style="flex: 1; min-width: 0; font: 400 14px/1.4 ${SANS};">${name}</span>
    <span style="font: 400 12.5px/1.4 ${SANS}; color: var(--fx-text-tertiary);">${detail}</span>
    ${right ?? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;"><path d="M5.5 2.5L11 8l-5.5 5.5" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/></svg>'}
  </div>`

emit('Setup.dc.html', screen({
  h: 2560, active: 'setup',
  inner: `${pageHeader({ eyebrow: 'Setup', title: 'What your factory is made of', meta: 'Items, locations, lines, people and workers', ownsAmber: false })}
  <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 88ch; margin-bottom: 30px; text-wrap: pretty;">
    Everything downstream — receiving, issuing, cutting, the board, attendance, payroll — needs these to exist first. Each row opens its record drawer; each section owns exactly one action, and the action is named beside it so it is obvious which module actually writes the row.
  </div>
  <div style="display: flex; flex-direction: column; gap: 40px;">
    ${setupSection({ title: 'Company profile', action: 'saveCompanyProfile · owner, admin', proposed: true,
      blurb: 'The legal name, address, BIN, TIN and bond licence that print on every export document. Changing the factory type from here re-renders the whole shell, because it decides which modules exist.',
      rows: `${setupRow('LEGAL', 'Barakah Fashions Ltd', 'Plot 44, Bhabanipur, Gazipur 1740')}${setupRow('BIN', '004821936-0202', 'business identification')}${setupRow('TIN', '618294037142', 'tax')}${setupRow('BOND', 'BL/DHK/2019/0442', 'bonded warehouse licence')}`,
      cta: btn('secondary', 'Edit the profile') })}

    ${setupSection({ title: 'People', action: 'grantUserRole · setUserLineScope · revokeUserRole — owner, admin', proposed: true,
      blurb: 'Seventeen roles, and a person may hold several. A role decides which screens exist for them; line scope narrows what a floor role sees inside those screens. An empty line scope means the whole floor.',
      rows: `${setupRow('KU', 'Karim Uddin', 'Storekeeper · whole floor')}${setupRow('SB', 'Shilpi Begum', 'Production · L1, L2')}${setupRow('RD', 'Rina Das', 'Production · L7, L8')}${setupRow('FY', 'Farzana Yasmin', 'HR')}${setupRow('GM', 'General Member', 'no desk yet', badge('accent', 'needs a role'))}`,
      cta: `<div style="display: flex; gap: 10px;">${btn('secondary', 'Invite somebody')}${btn('secondary', 'Grant a role')}</div>` })}

    ${setupSection({ title: 'Lines and calendars', action: 'saveLine · setLineCalendar — planning',
      blurb: 'The eight sewing lines and the days each one works. The planning board, the hourly sheet and every efficiency figure are computed against these calendars, so a wrong holiday is a wrong efficiency for the month.',
      rows: `${setupRow('L1', 'Line 1', '68 operators · Fri off')}${setupRow('L2', 'Line 2', '68 operators · Fri off')}${setupRow('L4', 'Line 4', '72 operators · Fri off')}${setupRow('L8', 'Line 8', '64 operators · Fri off')}`,
      cta: btn('secondary', 'Add a line') })}

    ${setupSection({ title: 'Locations and items', action: 'saveLocation · saveItem — store',
      blurb: 'Where things are kept and what they are. A bonded bay is not a policy on a shelf — it is a location kind, and receiving refuses a bonded GRN into a location that is not one.',
      rows: `${setupRow('A-12', 'Bonded bay A', 'location · bonded')}${setupRow('B-04', 'General store', 'location · general')}${setupRow('FAB-40P', '40s poplin, 58 inch', 'item · fabric · metre')}${setupRow('TRM-BTN', 'Button, 4-hole 18L', 'item · trim · piece')}`,
      cta: `<div style="display: flex; gap: 10px;">${btn('secondary', 'Add a location')}${btn('secondary', 'Add an item')}</div>` })}

    ${setupSection({ title: 'Suppliers', action: 'createSupplier — procurement', proposed: true,
      blurb: 'Who the factory buys from. A purchase order needs one to exist, and a bonded import needs the supplier’s country, because that is what the UD paperwork asks for.',
      rows: `${setupRow('STC', 'Shanghai Textile Co.', 'China · fabric')}${setupRow('HMA', 'Ha-Meem Accessories', 'Bangladesh · trims')}${setupRow('PPB', 'Padma Poly Bags', 'Bangladesh · packaging')}`,
      cta: btn('secondary', 'Add a supplier') })}

    ${setupSection({ title: 'Workers', action: 'saveWorker — hr, owner, admin',
      blurb: 'The roster: employee number, grade and line. Ordinary factory data, not payroll — headcount and sections are readable by anybody with a desk. Anything carrying a wage figure lives behind HR’s own door on /workforce.',
      rows: `${setupRow('W-00412', 'Rokeya Begum', 'grade 4 · L1 · sewing operator')}${setupRow('W-00418', 'Nasima Khatun', 'grade 3 · L1 · helper')}${setupRow('W-01044', 'Jashim Uddin', 'grade 6 · L4 · line chief')}`,
      cta: `<div style="display: flex; gap: 10px; align-items: center;"><span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary);">HR has its own door on /workforce — this is the same roster, not a second one.</span>${btn('secondary', 'Register a worker')}</div>` })}
  </div>
  ${note('Three of these six are marked because they are NOT on /setup today: the page renders Items, Store locations, Sewing lines and Workers only. The company profile lives at /settings#identity and People at /settings#people, and Suppliers has an action (createSupplier) with no setup section at all. Drawing them here is a proposal — it is also the argument for it, since “what the factory is made of” is exactly what those three are.')}`,
}))

emit('SetupEmpty.dc.html', screen({
  h: 1080, active: 'setup',
  inner: `${pageHeader({ eyebrow: 'Setup', title: 'What your factory is made of', ownsAmber: false })}
  ${emptyState('Nothing is set up yet',
    'Receiving needs items and locations. The board needs lines. Attendance and payroll need workers. Nothing downstream can happen until these exist, so this is the first screen of the first day — and the order below is the order they depend on each other in.',
    '')}
  <div style="height: 24px;"></div>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
    ${[['1 · Company profile', 'The legal name and the bond licence, because every export document prints them.', 'Edit the profile'],
       ['2 · Locations and items', 'A bonded bay and the fabric that goes in it. Receiving refuses a bonded GRN without both.', 'Add a location'],
       ['3 · Lines and calendars', 'Eight lines and the days they work. Every efficiency figure is computed against these.', 'Add a line'],
       ['4 · Suppliers', 'Who you buy from. A purchase order needs one to exist.', 'Add a supplier'],
       ['5 · Workers', 'Employee number, grade and line. Attendance and payroll read this roster.', 'Register a worker'],
       ['6 · People', 'Give your storekeeper the store. Until somebody holds a role, they sign in to a copilot over an empty world.', 'Invite somebody']]
      .map(([t, b, c]) => `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); padding: 18px 20px; display: flex; flex-direction: column; gap: 10px;">
        <span style="font: 600 14.5px/1.3 ${SANS};">${t}</span>
        <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); flex: 1; text-wrap: pretty;">${b}</span>
        ${btn('secondary', c, { size: 'sm' })}
      </div>`).join('')}
  </div>
  ${note('An empty setup page is the one place in this product where a numbered list is the right answer: these six genuinely depend on each other in this order, and a factory that adds workers before lines has to come back.')}`,
}))

/* ── 14 · the Person drawer: grant, scope, revoke, invite ────────────────── */

const rolePill = (label, held, scope) =>
  `<div style="display: flex; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid var(--fx-border-${held ? 'default' : 'subtle'}); border-radius: 8px; background: ${held ? 'var(--fx-bg-sunken)' : 'transparent'};">
    <span style="width: 17px; height: 17px; flex-shrink: 0; border-radius: 4px; border: 1px solid var(--fx-border-${held ? 'strong' : 'default'}); background: ${held ? 'var(--fx-text-primary)' : 'var(--fx-bg-surface)'}; display: inline-flex; align-items: center; justify-content: center;">
      ${held ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.6 2.6L10 3" stroke="var(--fx-text-inverse)" stroke-width="1.8"/></svg>' : ''}</span>
    <span style="flex: 1; min-width: 0; font: 500 13.5px/1.3 ${SANS}; color: var(--fx-text-${held ? 'primary' : 'tertiary'});">${label}</span>
    ${scope ? `<span style="font: 400 12px/1.3 ${MONO}; color: var(--fx-text-secondary);">${scope}</span>` : ''}
  </div>`

emit('SetupPerson.dc.html', board({
  w: 1300, h: 1120, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · person — the S0 family, with the owner’s footer')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; margin-top: 10px; text-wrap: pretty;">
      Opened from Setup → People, from Workforce, or from any avatar. Only owner and admin get the footer; everybody else sees the same three tabs with no actions.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('granting a role, and scoping it')}
      ${drawer({
        width: 560, height: 900, status: 'done',
        code: 'shilpi.begum', who: 'Shilpi Begum', statusText: 'active · signed in 06:52',
        figure: { label: 'Opens', value: '13', unit: 'screens', basis: 'may change 5 of them · production, scoped to L1 and L2' },
        tabs: ['Roles', 'Line scope', 'Activity'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Holds')}
          ${rolePill('Production', true, 'L1, L2')}
          ${rolePill('Quality', false)}
          ${rolePill('Cutting', false)}
          <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
            Adding a role adds screens; it never takes any away. Line scope narrows what a floor role sees INSIDE those screens — an empty scope means the whole floor, which is why it is a deliberate choice rather than a default.
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Shift', 'A · 08:00–17:00')}
          ${fact('Device', 'Floor tablet 3 — shared')}
          ${fact('Granted by', 'Admin, 14 Aug 2026')}
          ${fact('Writes today', '148 hourly outputs · 3 from the offline queue')}
        </div>`,
        footer: `${btn('ghost', 'Revoke production')}${btn('secondary', 'Change line scope')}${btn('primary', 'Grant a role')}`,
      })}
      ${note('Revoke is soft — the row stays with revoked_at set, because “who had permission to do that in March” is a question a deleted row cannot answer. The service refuses to revoke the last owner outright.')}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('the invite, and the person before they have a desk')}
      ${drawer({
        width: 560, height: 900, status: 'at-risk',
        code: 'general.member', who: 'General Member', statusText: 'signed in · no desk',
        figure: { label: 'Opens', value: '2', unit: 'screens', basis: 'MARBIM and Settings — everything else is hidden, not disabled', tone: 'var(--fx-warning)' },
        tabs: ['Roles', 'Line scope', 'Activity'], active: 0,
        body: `<div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 12px 14px; font: 400 13px/1.6 ${SANS}; text-wrap: pretty;">
          This person has confirmed their email and holds no role. Their landing says so in words — “You don’t have a desk yet, ask your admin to assign one” — rather than offering a copilot over an empty world.
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Grant a role')}
          ${rolePill('Storekeeper', false)}
          ${rolePill('Production', false)}
          ${rolePill('Quality', false)}
          <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary);">Seventeen to choose from; these three are the ones this factory grants most.</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Invited by', 'Admin, 1 Dec 2026')}
          ${fact('Email confirmed', '1 Dec 2026, 16:42')}
          ${fact('Roles', '<span style="color: var(--fx-text-tertiary);">none yet</span>')}
        </div>`,
        footer: `${btn('ghost', 'Remove from the factory')}${btn('primary', 'Grant a role')}`,
      })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   15–18 · /settings — policy, routing, the trail, and /factory
   ══════════════════════════════════════════════════════════════════════════ */

const ANCHORS = ['Identity', 'What it makes', 'Money & documents', 'Floor & planning', 'Quality',
                 'Desks', 'Oversight', 'Platform', 'People', 'Approval routing', 'Audit trail']

const jumpStrip = (active = 0) =>
  `<nav style="display: flex; flex-wrap: wrap; gap: 8px;">
    ${ANCHORS.map((a, i) => `<span style="display: inline-flex; align-items: center; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-${i === active ? 'primary' : 'secondary'}); border: 1px solid var(--fx-border-default); border-radius: 4px; padding: 8px 12px; min-height: 36px; background: ${i === active ? 'var(--fx-bg-selected)' : 'transparent'};">${a}</span>`).join('')}
  </nav>`

const policyRow = (label, value, hint) =>
  `<div style="display: grid; grid-template-columns: minmax(0, 1.3fr) 180px; gap: 20px; align-items: center; padding: 13px 0; border-bottom: 1px solid var(--fx-border-subtle);">
    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
      <span style="font: 500 13.5px/1.35 ${SANS};">${label}</span>
      ${hint ? `<span style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${hint}</span>` : ''}
    </div>
    <div style="display: flex; align-items: center; min-height: 40px; padding: 9px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; background: var(--fx-bg-surface); font: 500 13.5px/1.3 ${MONO}; justify-content: flex-end;">${value}</div>
  </div>`

emit('Settings.dc.html', screen({
  h: 1760, active: 'settings',
  inner: `${pageHeader({ eyebrow: 'Settings', title: 'Barakah Fashions Ltd', ownsAmber: false })}
  <div style="display: flex; flex-direction: column; gap: 34px;">
    ${jumpStrip(2)}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 88ch; text-wrap: pretty;">
      Fifty-eight inputs on one page is right for a once-a-quarter visit, but only if “cut tolerance” is reachable without scrolling past payroll. Eleven anchors, not eleven routes — everything the factory is configured by stays reviewable in one scroll.
    </div>

    <div>
      ${sectionHeading('Money & documents', 'saveModulePolicy · owner, admin')}
      <div style="display: flex; gap: 8px; margin-bottom: 10px;">${badge('info', '2 customised')}${badge('neutral', 'the rest are recommended defaults')}</div>
      ${card(`<div style="padding: 20px 24px;">
        ${policyRow('Back-to-back LC limit', '75%', 'The share of a master LC that may be committed to BTBs. An import PO past this is refused at the service, not the screen.')}
        ${policyRow('LC latest-shipment warning', '7 days', 'How far ahead the watcher starts calling a shipment date a conflict.')}
        ${policyRow('UD overdraw', 'owner approval', 'Never automatic. Drawing more bonded fabric than a declaration covers is customs exposure.')}
        ${policyRow('EXP before bank submission', 'required', 'Mandatory per export shipment. This is the law, not a preference — the switch exists so the screen can say so.')}
        <div style="display: grid; grid-template-columns: minmax(0, 1.3fr) 180px; gap: 20px; align-items: start; padding: 13px 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-sunken);">
          <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
            <span style="font: 500 13.5px/1.35 ${SANS};">Cut tolerance</span>
            <span style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">How far a cut report may differ from the lay before it needs an explanation. One field at a time: a policy screen that saved everything at once would let a mis-typed threshold ride in on somebody else's correction.</span>
            <div style="display: flex; gap: 8px; margin-top: 8px;">${btn('secondary', 'Save', { size: 'sm' })}${btn('ghost', 'Back to default', { size: 'sm' })}</div>
          </div>
          <div style="display: flex; align-items: center; min-height: 40px; padding: 9px 12px; border: 1px solid var(--fx-border-strong); border-radius: 4px; background: var(--fx-bg-surface); font: 500 13.5px/1.3 ${MONO}; justify-content: flex-end;">2%</div>
        </div>
      </div>`)}
    </div>

    <div>
      ${sectionHeading('Quality', 'saveModulePolicy')}
      <div style="display: flex; gap: 8px; margin-bottom: 10px;">${badge('neutral', 'recommended defaults')}</div>
      ${card(`<div style="padding: 20px 24px;">
        ${policyRow('4-point pass threshold', '20 points / 100 m', 'A roll over this is quarantined at receiving rather than shelved.')}
        ${policyRow('DHU alert level', '5.0', 'Defects per hundred units, per line-day.')}
        ${policyRow('Minimum shipments before an OTD %', '8', 'Below this the figure says “unavailable” and names the reason instead of stating a percentage from four shipments.')}
        
      </div>`)}
    </div>

    <div>
      ${sectionHeading('Your profile', 'yours alone')}
      ${card(`<div style="padding: 20px 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px;">
        <div style="display: flex; flex-direction: column; gap: 6px;"><span style="font: 500 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">Name</span><div style="display: flex; align-items: center; min-height: 40px; padding: 10px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; font: 400 14px/1.3 ${SANS};">Mr. Rahman</div></div>
        <div style="display: flex; flex-direction: column; gap: 6px;"><span style="font: 500 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">Language</span><div style="display: flex; align-items: center; min-height: 40px; padding: 10px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; font: 400 14px/1.3 ${SANS};">English · বাংলা</div></div>
      </div>`)}
    </div>
  </div>
  ${note('Policy is owner AND admin — the gate lives in the service (assertPolicyAdmin), not at the action, because editing a policy is the same privilege as the controls it governs and a check that only existed at the boundary would be missed by every other caller. A non-admin gets the sentence “Only an admin or owner changes that policy.”')}`,
}))

/* ── 16 · approval routing, and the one thing an admin cannot do ─────────── */

const ruleRow = (module, target, op, roles, n, priority, sentence, { sel = false } = {}) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); background: ${sel ? 'var(--fx-bg-selected)' : 'var(--fx-bg-surface)'}; padding: 14px 18px; display: flex; flex-direction: column; gap: 7px;">
    <div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;">
      ${mono(module, { size: 12.5 })}
      <span style="font: 400 13.5px/1.4 ${SANS}; color: var(--fx-text-secondary);">${target} · ${op}</span>
      <span style="margin-left: auto; display: flex; gap: 8px; align-items: center;">${badge('neutral', `${n} approval${n === 1 ? '' : 's'}`)}${badge('neutral', `priority ${priority}`)}</span>
    </div>
    <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty;">${sentence}</div>
    <div style="display: flex; gap: 6px; flex-wrap: wrap;">${roles.map((r) => badge('neutral', r)).join('')}</div>
  </div>`

emit('SettingsRules.dc.html', board({
  w: 1560, h: 1240, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('/settings#routing — approval routing')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">Who signs what</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      A rule is a draft kind and the roles that must approve it. The screen writes the sentence the inbox will show, live, as the rule is edited — because a routing rule nobody can read out loud is a rule nobody can check.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px;">
      ${caption('the rules, as sentences')}
      ${card(`
        ${ruleRow('store', 'goods_receipts', 'insert', ['owner'], 2, 10, 'A goods receipt against a bonded UD needs the owner — two approvals, and it sorts above everything else in the inbox.', { sel: true })}
        ${ruleRow('workforce', 'payroll_runs', 'update', ['owner', 'hr'], 1, 10, 'A payroll run needs the owner. HR computes it; the owner signs it.')}
        ${ruleRow('orders', 'order_styles', 'insert', ['merchandiser'], 1, 5, 'Style measurements read from a tech pack go to whoever holds merchandising.')}
        ${ruleRow('procurement', 'purchase_orders', 'insert', ['procurement', 'commercial'], 1, 5, 'A purchase order read from a pro-forma goes to procurement, or to commercial if nobody holds procurement.')}
      `)}
      ${note('There is no “condition” field anywhere on this screen, and there must not be: the matcher picks on module, target table and operation only. A form offering a condition the engine ignores is a rule that looks like a gate and is not one — the day-0 script’s own recorded trap.')}
    </div>

    <div style="width: 560px; flex-shrink: 0; display: flex; flex-direction: column; gap: 26px;">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${caption('editing one — owner')}
        <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); padding: 20px 22px; display: flex; flex-direction: column; gap: 16px;">
          ${policyRow('Module', 'store')}
          ${policyRow('Target table', 'goods_receipts', 'Optional. Left empty, the rule covers every table the module registers.')}
          ${policyRow('Operation', 'insert')}
          ${policyRow('Required roles', 'owner')}
          ${policyRow('Approvals needed', '2', 'One to five.')}
          ${policyRow('Priority', '10', 'Higher wins when two rules match the same draft.')}
          <div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 14px 16px; display: flex; flex-direction: column; gap: 7px;">
            ${eyebrow('The inbox will say')}
            <span style="font: 400 14px/1.6 ${SANS}; text-wrap: pretty;">“A goods receipt against a bonded UD needs the owner — two approvals, and it sorts above everything else in the inbox.”</span>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">${btn('ghost', 'Remove this rule')}${btn('primary', 'Save the rule')}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${caption('the same screen — admin')}
        ${card(`
          ${ruleRow('store', 'goods_receipts', 'insert', ['owner'], 2, 10, 'A goods receipt against a bonded UD needs the owner — two approvals, and it sorts above everything else in the inbox.')}
        `)}
        ${refusalNote('Reading, not editing', 'Only an owner changes who approves what. You can see every rule and the sentence it produces — an admin covering the desk needs to know why a draft landed where it did — but the Save and Remove actions are absent, not greyed.')}
      </div>
    </div>
  </div>
  ${note('This is the ONE thing an admin cannot do that an owner can, outside payroll. `requireRole(…, "owner")` admits an admin at the action boundary — owner and admin are supervisory roles on every action in the product — and then `upsertApprovalRule` refuses with a named sentence. That refusal is worth drawing, because a screen that offered the button and then said "Only an owner changes who approves what" would be a screen that lied first. The auto-approve threshold the brief asks for is NOT drawn: the service accepts autoApprove and minConfidence, the action’s schema does not expose them, so there is no door to draw yet.')}`,
}))

/* ── 17 · the audit trail, and the record drawer that reads a change ─────── */

const auditRow = (when, who, sentence, table, sel = false) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); background: ${sel ? 'var(--fx-bg-selected)' : 'var(--fx-bg-surface)'}; display: flex; align-items: center; gap: 16px; padding: 12px 18px; min-height: 44px;">
    <span style="width: 120px; flex-shrink: 0; font: 400 12px/1.4 ${MONO}; color: var(--fx-text-tertiary);">${when}</span>
    <span style="flex: 1; min-width: 0; font: 400 13.5px/1.5 ${SANS}; text-wrap: pretty;"><strong style="font-weight: 600;">${who}</strong> ${sentence}</span>
    ${badge('neutral', table)}
  </div>`

emit('SettingsAudit.dc.html', board({
  w: 1560, h: 1140, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('/settings#audit — the audit trail')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">Who changed that</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      Ten modules write to the audit log and, until this screen existed, nothing read it — the answer to “who changed that” was a table reachable only from psql. Owner and admin only, deliberately: the payroll reads it carries are exactly the rows that must not be browsable by the floor.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${chip('Everybody', { on: true })}${chip('Karim Uddin')}${chip('Tanvir Ahmed')}${chip('Farzana Yasmin')}
        <span style="width: 14px;"></span>
        ${chip('All tables', { on: true })}${chip('orders')}${chip('lcs')}${chip('payroll_runs')}${chip('user_roles')}
      </div>
      ${card(`
        ${auditRow('today 11:24', 'Karim Uddin', 'was refused an issue of 1,400 m against UD-2026-118 — the balance was 1,240 m', 'ud_declarations')}
        ${auditRow('today 09:41', 'Tanvir Ahmed', 'changed LC-BF-7781’s latest shipment date from 28 Dec to 21 Dec', 'lcs', true)}
        ${auditRow('today 09:14', 'Farzana Yasmin', 'computed the November payroll run for 2,412 workers', 'payroll_runs')}
        ${auditRow('yesterday 16:42', 'Admin', 'granted Shilpi Begum the production role, scoped to L1 and L2', 'user_roles')}
        ${auditRow('yesterday 14:08', 'Mr. Rahman', 'approved GRN-2288 with one field corrected', 'goods_receipts')}
        ${auditRow('1 Dec 10:20', 'Rashida Akter', 'moved PO-BF-2044’s ex-factory date from 14 Dec to 18 Dec', 'orders')}
      `)}
      ${note('Sentences, not rows. “Tanvir Ahmed changed LC-BF-7781’s latest shipment date from 28 Dec to 21 Dec” is the same information as a diff of two JSON blobs and it is the only form a factory owner will ever read — the standing rule against raw identifiers applies hardest on the screen whose whole job is accountability.')}
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('drawer · audit record — before and after')}
      ${drawer({
        width: 560, height: 860, status: 'at-risk',
        code: 'LC-BF-7781', who: 'Bestseller A/S · $486,200', statusText: 'changed today, 09:41',
        figure: { label: 'What moved', value: '−7', unit: 'days', basis: 'latest shipment 28 Dec → 21 Dec, which is what put PO-BF-2044 in conflict', tone: 'var(--fx-danger)' },
        tabs: ['The change', 'This record’s history'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Before')}
          <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 4px 14px; background: var(--fx-bg-sunken);">
            ${fact('Latest shipment', '28 Dec 2026')}
            ${fact('Expiry', '11 Jan 2027')}
          </div>
          ${eyebrow('After')}
          <div style="border: 1px solid var(--fx-warning); border-radius: 8px; padding: 4px 14px; background: var(--fx-bg-surface);">
            ${fact('Latest shipment', '<span style="color: var(--fx-warning);">21 Dec 2026</span>')}
            ${fact('Expiry', '11 Jan 2027')}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Changed by', 'Tanvir Ahmed · commercial')}
          ${fact('When', '2 Dec 2026, 09:41')}
          ${fact('Why', 'amendment advice from the bank, read into the form')}
          ${fact('Source', 'AMD-7781-02.pdf')}
        </div>
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          Only the fields that moved are shown as before/after. A drawer that printed every column of the row would bury the one line that matters under forty that did not change.
        </div>`,
        footer: `${btn('ghost', 'Open the LC')}${btn('secondary', 'Everything Tanvir changed today')}`,
      })}
    </div>
  </div>`,
}))

/* ── 18 · /factory — the tenant card, and what the type hides ────────────── */

const typeCard = (name, on, blurb, hides) =>
  `<div style="border: 1px solid var(--fx-border-${on ? 'strong' : 'subtle'}); border-radius: 8px; background: ${on ? 'var(--fx-bg-sunken)' : 'var(--fx-bg-surface)'}; padding: 16px 18px; display: flex; flex-direction: column; gap: 9px;">
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="width: 16px; height: 16px; border-radius: 999px; border: 1px solid var(--fx-border-strong); flex-shrink: 0; box-shadow: ${on ? 'inset 0 0 0 3px var(--fx-bg-surface), inset 0 0 0 9px var(--fx-text-primary)' : 'none'};"></span>
      <span style="font: 600 14.5px/1.3 ${SANS};">${name}</span>
      ${on ? badge('neutral', 'this factory') : ''}
    </div>
    <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${blurb}</span>
    <span style="font: 400 12.5px/1.6 ${SANS}; color: ${hides.startsWith('Hides') ? 'var(--fx-warning)' : 'var(--fx-text-tertiary)'}; text-wrap: pretty;">${hides}</span>
  </div>`

emit('Factory.dc.html', screen({
  h: 1180, active: undefined,
  inner: `${pageHeader({ eyebrow: 'The unit you are signed in to', title: 'Barakah Fashions Ltd', meta: 'woven' })}
  <div style="display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; align-items: start;">
    ${card(`<div style="padding: 22px 24px;">
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px;">
        <span style="width: 52px; height: 52px; border-radius: 4px; background: var(--fx-text-primary); color: var(--fx-text-inverse); display: inline-flex; align-items: center; justify-content: center; font: 700 18px/1 ${SANS}; letter-spacing: .04em;">BF</span>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font: 600 18px/1.25 ${SANS};">Barakah Fashions Ltd</span>
          <span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">Woven unit · Gazipur, Dhaka</span>
        </div>
      </div>
      ${fact('Registered address', 'Plot 44, Bhabanipur, Gazipur 1740')}
      ${fact('BIN', '004821936-0202')}
      ${fact('TIN', '618294037142')}
      ${fact('Bond licence', 'BL/DHK/2019/0442')}
      ${fact('Sewing lines', '8 · 486 machines · 2,412 on the roll')}
      ${fact('Buyers', 'H&M · Bestseller A/S · Primark · C&A')}
    </div>`)}
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${sectionHeading('What it makes')}
      <div style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
        The factory type is not a label — it decides which modules exist. Changing it re-renders the whole shell, so the screen says what disappears before anybody presses anything.
      </div>
      ${typeCard('Woven', true, 'Cut-and-sew from purchased fabric, mostly imported and mostly bonded.', 'Keeps the UD workbench — bonded fabric is the norm here.')}
      ${typeCard('Knit — composite', false, 'Knitting, dyeing and sewing under one roof.', 'Keeps the UD workbench: composite units import bonded yarn.')}
      ${typeCard('Knit', false, 'Sewing from fabric knitted elsewhere, typically bought locally.', 'Hides the UD workbench entirely — a pure knit unit has no bonded declarations to draw against, so the module is absent rather than empty.')}
      ${refusalNote('Changing this is an owner or admin decision', 'saveCompanyProfile writes it, and the shell re-renders for everybody in the factory on their next request. A storekeeper mid-receipt does not lose their entry — the offline queue holds it — but their rail changes under them, which is why this sits behind a confirm.')}
    </div>
  </div>
  ${note('Nobody edits the factory from this screen — writeRoles is empty on the /factory nav entry for every role, owner included. It is the card the top-bar chip opens; the edit lives at /settings#identity and is audited.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   19 · Drawer · figure — the new family this session adds
   One series, so no legend: the title names it. The line is INK, not amber —
   amber means a person must act, and a trend is not an instruction.
   ══════════════════════════════════════════════════════════════════════════ */

const OTD_WEEKS = [
  ['w 8 Sep', 88], ['w 15 Sep', 92], ['w 22 Sep', 86], ['w 29 Sep', 90],
  ['w 6 Oct', 94], ['w 13 Oct', 89], ['w 20 Oct', 93], ['w 27 Oct', 95],
  ['w 3 Nov', 90], ['w 10 Nov', 87], ['w 17 Nov', 92], ['w 24 Nov', 91],
]

const sparkline = ({ w = 476, h = 132, target = 95, hoverAt = 9 }) => {
  const pad = { l: 0, r: 0, t: 10, b: 22 }
  const lo = 80, hi = 100
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
  const x = (i) => pad.l + (i / (OTD_WEEKS.length - 1)) * iw
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih
  const pts = OTD_WEEKS.map(([, v], i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const [hLabel, hValue] = OTD_WEEKS[hoverAt]
  const last = OTD_WEEKS.length - 1
  return `<div style="position: relative;">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" style="display: block; overflow: visible;">
      <!-- recessive baseline and target; the grid never competes with the mark -->
      <line x1="0" y1="${y(lo).toFixed(1)}" x2="${w}" y2="${y(lo).toFixed(1)}" stroke="var(--fx-border-subtle)" stroke-width="1"/>
      <line x1="0" y1="${y(target).toFixed(1)}" x2="${w}" y2="${y(target).toFixed(1)}" stroke="var(--fx-border-default)" stroke-width="1" stroke-dasharray="3 4"/>
      <polyline points="${pts}" stroke="var(--fx-text-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- the crosshair, and a marker bigger than the line it sits on -->
      <line x1="${x(hoverAt).toFixed(1)}" y1="${pad.t}" x2="${x(hoverAt).toFixed(1)}" y2="${(h - pad.b).toFixed(1)}" stroke="var(--fx-border-default)" stroke-width="1"/>
      <circle cx="${x(hoverAt).toFixed(1)}" cy="${y(hValue).toFixed(1)}" r="5" fill="var(--fx-bg-surface)" stroke="var(--fx-text-primary)" stroke-width="2"/>
      <circle cx="${x(last).toFixed(1)}" cy="${y(OTD_WEEKS[last][1]).toFixed(1)}" r="4" fill="var(--fx-text-primary)"/>
    </svg>
    <div style="position: absolute; left: ${(x(hoverAt) + 10).toFixed(0)}px; top: 0; border: 1px solid var(--fx-border-default); border-radius: 4px; background: var(--fx-bg-surface); box-shadow: var(--fx-sh2); padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; pointer-events: none;">
      <span style="font: 400 11px/1 ${MONO}; color: var(--fx-text-tertiary);">${hLabel}</span>
      <span data-numeric style="font: 500 13px/1 ${MONO}; color: var(--fx-text-primary);">${hValue}% · 9 of 10 shipments</span>
    </div>
    <div style="display: flex; justify-content: space-between; font: 400 11px/1 ${MONO}; color: var(--fx-text-tertiary); margin-top: -14px;">
      <span>8 Sep</span><span>target 95%</span><span>24 Nov · 91%</span>
    </div>
  </div>`
}

const shipRow = (code, buyer, planned, actual, late) =>
  `<div style="border-top: 1px solid var(--fx-border-subtle); display: grid; grid-template-columns: minmax(0, 1fr) 84px 84px 58px; gap: 10px; align-items: center; padding: 9px 0;">
    <span style="min-width: 0; display: flex; align-items: baseline; gap: 8px;">${mono(code, { size: 12 })}<span style="font: 400 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${buyer}</span></span>
    <span data-numeric style="font: 400 12px/1.3 ${MONO}; color: var(--fx-text-tertiary); text-align: right;">${planned}</span>
    <span data-numeric style="font: 400 12px/1.3 ${MONO}; color: var(--fx-text-${late ? 'primary' : 'tertiary'}); text-align: right;">${actual}</span>
    <span style="text-align: right;">${late ? statusLabel('late', `+${late}d`) : statusLabel('on-track', 'on')}</span>
  </div>`

emit('DrawerFigure.dc.html', board({
  w: 1300, h: 1060, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · figure — new in S1')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; margin-top: 10px; text-wrap: pretty;">
      Every tile on the numbers strip opens one. A figure a person cannot argue with is a figure they will not trust, so the drawer holds the trend and then the denominator itself — the actual rows the percentage was computed from.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('on-time delivery — trend, then the rows')}
      ${drawer({
        width: 560, height: 880, status: 'on-track',
        code: 'On-time delivery', who: '2 Nov → 2 Dec 2026', statusText: 'above the floor',
        figure: { label: 'On-time delivery', value: '91', unit: '%', basis: '31 of 34 shipments left on the ex-factory date · as of yesterday', tone: 'var(--fx-success)' },
        tabs: ['Trend', 'The 34 shipments', 'How it is computed'], active: 0,
        body: `${sparkline({})}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Window', '12 weeks, to 24 Nov 2026')}
          ${fact('Floor', '8 shipments before a percentage is stated')}
          ${fact('Worst week', '86% — w 22 Sep, the Eid shutdown')}
          ${fact('Direction', 'flat — 91% against 90% four weeks ago')}
        </div>
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          One series, so no legend — the drawer’s own title names it. The dashed line is the target you set in Settings, not a computed value.
        </div>`,
        footer: `${btn('ghost', 'Export the rows')}${btn('secondary', 'Open the shipment board')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('the denominator, as rows — the tab that settles an argument')}
      ${drawer({
        width: 560, height: 880, status: 'on-track',
        code: 'On-time delivery', who: '2 Nov → 2 Dec 2026', statusText: 'above the floor',
        figure: { label: 'The three that were late', value: '3', unit: 'of 34', basis: 'every shipment in the window, and what moved each one', tone: 'var(--fx-danger)' },
        tabs: ['Trend', 'The 34 shipments', 'How it is computed'], active: 1,
        body: `<div style="display: flex; flex-direction: column; gap: 0;">
          <div style="display: grid; grid-template-columns: minmax(0, 1fr) 84px 84px 58px; gap: 10px; padding-bottom: 8px;">
            ${eyebrow('Shipment')}<span style="text-align: right;">${eyebrow('Planned')}</span><span style="text-align: right;">${eyebrow('Left')}</span><span></span>
          </div>
          ${shipRow('SHP-0912', 'H&M', '24 Nov', '—', null).replace('on-track', 'at-risk').replace('>on<', '>not yet<')}
          ${shipRow('SHP-0908', 'Bestseller', '18 Nov', '21 Nov', 3)}
          ${shipRow('SHP-0904', 'Primark', '11 Nov', '13 Nov', 2)}
          ${shipRow('SHP-0901', 'C&A', '4 Nov', '4 Nov', null)}
          ${shipRow('SHP-0898', 'H&M', '28 Oct', '28 Oct', null)}
          ${shipRow('SHP-0894', 'Primark', '21 Oct', '28 Oct', 7)}
          ${shipRow('SHP-0891', 'C&A', '14 Oct', '14 Oct', null)}
        </div>
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          …and 27 more that left on their date. The three late ones are together at the top because they are the reason the number is 91 and not 100 — sorting them under the twenty-seven that worked would hide the answer inside the evidence.
        </div>`,
        footer: `${btn('ghost', 'Export the rows')}${btn('secondary', 'Open the shipment board')}`,
      })}
    </div>
  </div>
  ${note('The line is ink, not amber. Amber in this product means a person must act, and a trend is context — using the accent for a data series would put the strongest colour on the screen’s least actionable element. Recessive baseline, dashed target, a marker only where the pointer is and on the last point, and no number printed on every point.')}`,
}))

/* ── 20 · the payroll gate, drawn as both roles see it ──────────────────── */

emit('Workforce.dc.html', board({
  w: 1560, h: 1440, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('/workforce — the one screen where the twins differ')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">Payroll is HR’s and the owner’s</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      The gate admits <code style="font: 500 13px/1 ${MONO};">hr</code> and <code style="font: 500 13px/1 ${MONO};">owner</code>, and refuses everybody else with a 403 carrying nothing at all — no message, no hint that what was refused is payroll. That emptiness is deliberate and it is exactly why this screen has to speak: an admin who meets a silent refusal concludes the software is broken.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px;">
      ${caption('owner — the run, and the signature')}
      ${card(`<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;">
          ${mono('RUN-2026-11', { size: 14 })}<span style="font: 400 14px/1.3 ${SANS}; color: var(--fx-text-secondary);">November 2026</span>${statusLabel('at-risk', 'awaiting approval')}
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;">
          ${figureTile({ label: 'Net payable', value: '৳1,04,82,640', basis: '2,412 workers · gazette v2026-1' })}
          ${figureTile({ label: 'Overtime', value: '৳9,41,220', basis: '18,640 OT hours at 2× basic ÷ 208' })}
          ${figureTile({ label: 'Parallel run', value: '0', unit: 'unexplained', basis: 'every net matched the factory’s own sheet for November', tone: 'var(--fx-success)' })}
        </div>
        <div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 14px 16px; font: 400 13.5px/1.6 ${SANS}; text-wrap: pretty;">
          Farzana Yasmin computed this at 09:14 today. Approving it is yours alone — HR computes, the owner signs. The parallel run against November’s own sheet reconciled to zero, and that report is committed.
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">${btn('ghost', 'Open the parallel run')}${btn('secondary', 'Send it back to HR')}${btn('primary', 'Approve the run')}</div>
      </div>`)}

      ${caption('HR’s own doors, which an owner may also open')}
      ${card(`<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;">
        <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
          These are Farzana Yasmin’s day-to-day, not the owner’s. They are here because an owner covering a desk must not be locked out of the operation they are covering — the same rule that admits an owner to every floor screen. An admin gets none of them: the payroll gate lists hr and owner only.
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${btn('secondary', 'Run the December payroll')}${btn('secondary', 'Import attendance')}${btn('secondary', 'Record a gazette')}${btn('secondary', 'Make a gazette active')}
        </div>
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          A gazette is law and is never edited — recorded as a draft because transcribing a government notification needs a second pair of eyes, then activated when it takes effect. Superseding one does not rewrite the months it governed: a completed run pins the gazette it was computed against.
        </div>
      </div>`)}
      ${note('Approve goes through a ConfirmDialog carrying the totals again — a decision about what 2,412 people are paid is the definition of a consequence that must not be missed.')}
    </div>

    <div style="width: 560px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px;">
      ${caption('admin — the roster, and the sentence instead')}
      ${card(`<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: baseline; gap: 12px;">
          <span style="font: 600 16px/1.3 ${SANS};">Roster</span>${badge('neutral', '2,412 active')}
        </div>
        ${miniRow('on-track', 'L1 · 68 operators, 4 helpers', '72')}
        ${miniRow('on-track', 'L2 · 68 operators, 4 helpers', '72')}
        ${miniRow('on-track', 'L4 · 72 operators, 5 helpers', '77')}
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          Headcount, sections and lines are ordinary factory data and are not behind the gate.
        </div>
      </div>`)}
      ${refusalNote('You don’t have access to payroll', 'Payroll is HR and the owner only — a wage figure is seen by the two roles accountable for it.')}
      <div style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">
        That is the shipped copy, from the LockedState this screen already renders — day-one finding D2, not a proposal. The roster above it is not behind the gate: headcount, sections and lines are ordinary factory data.
      </div>
      ${note('Absent, not disabled. A greyed “Approve the run” button would tell an admin the door exists and that they are one permission away from it, which is both untrue and the shape of a screen people file bugs against.')}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   21–25 · The five flows
   One artboard per flow: the whole sequence readable at once, which is what a
   flow is for. Each panel is the real screen at reduced size, not a wireframe.
   ══════════════════════════════════════════════════════════════════════════ */

const flowBoard = (name, { w, h, title, blurb, steps, tail }) => emit(name, board({
  w, h, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow(title.eyebrow)}
    <h1 style="font: 700 28px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">${title.text}</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 100ch; text-wrap: pretty;">${blurb}</div>
  </div>
  <div style="display: flex; align-items: stretch; gap: 0;">${steps}</div>
  ${tail ? note(tail) : ''}`,
}))

const panelHead = (route, title) =>
  `<div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
    ${mono(route, { size: 11.5, colour: 'var(--fx-text-tertiary)' })}
    <span style="font: 600 13px/1.3 ${SANS};">${title}</span>
  </div>`

const panelBody = (inner) => `<div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 9px;">${inner}</div>`
const panelText = (t) => `<div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${t}</div>`

flowBoard('F1.dc.html', {
  w: 1820, h: 820,
  title: { eyebrow: 'Flow 1', text: 'The morning' },
  blurb: 'Four screens, one decision. The whole point of the exception drawer is that the owner never has to reconstruct why something is wrong — the chain is in the drawer and the door out of it lands inside the record, not on a list of records.',
  steps: [
    step(1, '/home — what is wrong', `${panelHead('/home', 'Your work')}${[EXCEPTIONS[0], EXCEPTIONS[1]].map((e) => miniRow(e.status, `${e.code} — ${e.text.slice(0, 62)}…`, e.meta)).join('')}`, { note: 'The first row is the one that moves a ship date. Selvage at 5px marks the critical path.' }),
    arrow(),
    step(2, 'the exception drawer', `${panelHead('drawer · exception', 'PO-BF-2044')}${panelBody(`${panelText('“PO-BF-2044 will miss ex-factory by 4 days: cutting has not started because the PP sample for ST-2610 is still with H&M.”')}<div style="display: flex; gap: 6px;">${badge('neutral', 'What happened')}${badge('neutral', 'Why')}${badge('neutral', 'Who')}</div>${panelText('The <strong>Why</strong> tab holds the chain: PP → cutting → sewing → ex-factory, with the blocked link named.')}`)}`, { note: 'Nothing on the floor can clear this. The drawer says so, so the owner does not go hunting on the cutting screen.' }),
    arrow(),
    step(3, '/orders?open=…&tab=tna', `${panelHead('/orders?open=PO-BF-2044', 'Order desk & TNA')}${panelBody(`${panelText('The order book, with this order’s drawer already open on the TNA tab.')}${miniRow('late', 'PP sample · sent 21 Nov, no verdict', '11 d')}${miniRow('late', 'Cutting · gated on PP', 'held')}${miniRow('at-risk', 'Ex-factory 18 Dec', '−4 d')}`)}`, { note: 'One link, one landing. The drawer opens from the URL, so a push notification and a source link land in the same place.' }),
    arrow(),
    step(4, 'back to /home', `${panelHead('/home', 'Your work')}${panelBody(`${panelText('The exception is gone if the chase cleared it, or snoozed with a reason and a date if it did not.')}${miniRow('done', 'PO-BF-2044 · chased H&M, verdict promised 4 Dec', 'snoozed')}${panelText('A snooze carries the sentence and the date. An exception that can be dismissed without one comes back as a surprise.')}`)}`),
  ].join(''),
  tail: 'The route in step 3 is the S0 contract working: a link inside a drawer never opens a second drawer — it navigates to the target’s page with that row’s drawer pre-opened.',
})

flowBoard('F2.dc.html', {
  w: 2260, h: 840,
  title: { eyebrow: 'Flow 2', text: 'Approving with a correction' },
  blurb: 'The important step is the third one. An owner who can only approve or reject will approve things that are 90% right; one who can correct a field on the way through keeps the record true and leaves the correction visible to whoever raised it.',
  steps: [
    step(1, '/home — decide now', `${panelHead('/home', 'Decide now')}${DRAFTS_BY_DESK.slice(0, 3).map(([desk, n, what, , age]) => miniRow('done', `${desk} — ${n} draft${n === 1 ? '' : 's'}`, age)).join('')}`, { w: 340 }),
    arrow(),
    step(2, '/approve, filtered', `${panelHead('/approve', 'Store · oldest first')}${panelBody(`<div style="display: flex; gap: 6px; flex-wrap: wrap;">${chip('Store', { on: true, count: 3 })}${chip('Oldest first', { on: true })}</div>${miniRow('done', 'GRN-2291 · read from a challan photo', '0.82')}${miniRow('done', 'GRN-2288 · typed by hand', '—')}`)}`, { w: 340 }),
    arrow(),
    step(3, 'the draft drawer', `${panelHead('drawer · draft', 'GRN-2291')}${panelBody(`${panelText('Seven fields, each with the confidence it was measured at. Quantity is 0.82 — the lowest — because the challan’s fold runs through that column.')}<div style="border: 1px solid var(--fx-warning); border-radius: 8px; padding: 9px 11px; display: flex; flex-direction: column; gap: 6px;"><span style="font: 400 12px/1.3 ${SANS}; color: var(--fx-text-secondary);">Quantity</span><span style="font: 500 14px/1.3 ${SANS};">12,180 m</span>${confidence(0.82)}</div>`)}`, { w: 340 }),
    arrow(),
    step(4, 'edit and approve', `${panelHead('drawer · draft', 'corrected')}${panelBody(`<div style="border: 1px solid var(--fx-border-default); border-radius: 8px; padding: 9px 11px; display: flex; flex-direction: column; gap: 6px;"><span style="font: 400 12px/1.3 ${SANS}; color: var(--fx-text-secondary);">Quantity</span><span style="font: 500 14px/1.3 ${SANS};">12,160 m</span><span style="font: 400 11.5px/1.3 ${MONO}; color: var(--fx-text-tertiary);">corrected from 12,180</span></div>${panelText('The correction goes in with the approval, in one action — not as an edit and then an approve.')}<div style="display: flex; gap: 8px; justify-content: flex-end;">${btn('primary', 'Approve', { size: 'sm' })}</div>`)}`, { w: 340 }),
    arrow(),
    step(5, 'the trail, and the inbox', `${panelHead('drawer · draft · Trail', 'GRN-2291')}${panelBody(`${panelText('<strong>Mr. Rahman</strong> approved this with the quantity corrected from 12,180 m to 12,160 m — 2 Dec, 14:22.')}${panelText('Karim Uddin sees the correction against his own reading, which is the only way the next challan gets photographed better.')}${miniRow('done', 'The row has left the inbox · 6 remaining', '')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'A batch approve does the same thing per draft and reports each outcome separately: one refusal does not roll the others back.',
})

flowBoard('F3.dc.html', {
  w: 2260, h: 880,
  title: { eyebrow: 'Flow 3', text: 'An admin onboards a line supervisor' },
  blurb: 'The end of this flow is the part worth designing: the supervisor’s FIRST screen. A grant that lands somebody on an empty world is the same as no grant, and line scope is what makes /lines/hourly their screen rather than the factory’s.',
  steps: [
    step(1, '/setup — People', `${panelHead('/setup#people', 'People')}${miniRow('on-track', 'Karim Uddin · Storekeeper', 'whole floor')}${miniRow('on-track', 'Shilpi Begum · Production', 'L1, L2')}${miniRow('at-risk', 'Rina Das · invited, no desk', 'needs a role')}`, { w: 340 }),
    arrow(),
    step(2, 'invite', `${panelHead('modal · invite', 'Invite somebody')}${panelBody(`${panelText('An email address and nothing else. Roles come after they confirm — granting a desk to an address nobody has answered is how a factory ends up with orphan permissions.')}<div style="border: 1px solid var(--fx-border-default); border-radius: 4px; padding: 10px 12px; font: 400 13px/1.3 ${SANS};">rina.das@barakah-fashions.example</div>`)}`, { w: 340 }),
    arrow(),
    step(3, 'the person drawer', `${panelHead('drawer · person', 'Rina Das')}${panelBody(`${panelText('Seventeen roles to choose from. Adding one adds screens; it never takes any away.')}${rolePill('Production', true)}${panelText('Granting re-renders the shell for that person on their very next request.')}`)}`, { w: 340 }),
    arrow(),
    step(4, 'line scope', `${panelHead('drawer · person · Line scope', 'L7, L8')}${panelBody(`${panelText('Empty means the whole floor — so it is a deliberate choice, never a default. Rina runs L7 and L8.')}<div style="display: flex; gap: 6px; flex-wrap: wrap;">${badge('neutral', 'L7')}${badge('neutral', 'L8')}</div>${panelText('The service refuses a scope for a role the person does not hold, and refuses line codes that are not real lines.')}`)}`, { w: 340 }),
    arrow(),
    step(5, 'her first screen', `${panelHead('/lines/hourly', 'This hour · Rina Das')}${panelBody(`${panelText('She lands on the hourly sheet, not on “Your work” — the floor desk wins over the office one for a person who holds both.')}${miniRow('on-track', 'L7 · 402 of 400', '+1%')}${miniRow('on-track', 'L8 · 388 of 400', '−3%')}${panelText('L1–L6 are not hidden behind a filter she could clear. They are not on her screen.')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'Both grant and scope are owner-and-admin actions, and both are audited — “Admin granted Shilpi Begum the production role, scoped to L1 and L2” is a sentence in the trail, not a diff.',
})

flowBoard('F4.dc.html', {
  w: 2260, h: 900,
  title: { eyebrow: 'Flow 4', text: 'Changing an approval rule — and the one an admin cannot make' },
  blurb: 'The brief asked for the admin’s path through this. The code does not have one: `upsertApprovalRule` refuses anybody without the owner role, with a sentence. So the flow is drawn as it actually runs — the admin reaches the screen, reads every rule, and stops; the owner finishes it.',
  steps: [
    step(1, '/settings — routing', `${panelHead('/settings#routing', 'Approval routing')}${panelBody(`${panelText('The eleven-anchor jump nav puts this one click from the top of a page with fifty-eight inputs on it.')}${miniRow('done', 'store · goods_receipts · insert → owner', '2 approvals')}${miniRow('done', 'workforce · payroll_runs → owner', '1')}`)}`, { w: 340 }),
    arrow(),
    step(2, 'admin opens a rule', `${panelHead('drawer · rule', 'store · goods_receipts')}${panelBody(`${panelText('Every field readable — an admin covering the desk has to be able to explain why a draft landed where it did.')}${refusalNote('Reading, not editing', 'Only an owner changes who approves what.').replace(/padding: 18px 20px/, 'padding: 12px 14px')}`)}`, { w: 340, note: 'The Save and Remove actions are absent, not greyed — the screen never offers a door it will refuse.' }),
    arrow(),
    step(3, 'owner edits it', `${panelHead('drawer · rule', 'owner')}${panelBody(`${panelText('Approvals needed: 1 → 2.')}<div style="display: flex; gap: 10px; align-items: center;"><div style="border: 1px solid var(--fx-border-default); border-radius: 4px; padding: 8px 12px; font: 500 13px/1 ${MONO};">2</div><span style="font: 400 12px/1.4 ${SANS}; color: var(--fx-text-tertiary);">one to five</span></div>${panelText('No condition field, ever — the matcher picks on module, target and operation only.')}`)}`, { w: 340 }),
    arrow(),
    step(4, 'the sentence updates', `${panelHead('drawer · rule', 'preview')}${panelBody(`<div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 11px 13px; font: 400 13px/1.6 ${SANS}; text-wrap: pretty;">“A goods receipt against a bonded UD needs the owner — <strong>two approvals</strong>, and it sorts above everything else in the inbox.”</div>${panelText('Live, as the field changes. A routing rule nobody can read out loud is a rule nobody can check.')}`)}`, { w: 340 }),
    arrow(),
    step(5, '/approve says so', `${panelHead('/approve', 'empty state')}${panelBody(`${panelText('The inbox’s teaching empty state names the kinds that route here — so the rule change is visible on the screen it governs, not only on the screen that made it.')}${miniRow('done', 'Bonded goods receipts · needs you, twice', '')}${miniRow('done', 'Payroll runs · yours alone', '')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'Two different refusal shapes in one product, and the difference is deliberate. This one names itself — “Only an owner changes who approves what” — because knowing the rule exists is harmless. Payroll’s carries nothing at all, because naming it would confirm the endpoint and the role worth phishing.',
})

flowBoard('F5.dc.html', {
  w: 1820, h: 880,
  title: { eyebrow: 'Flow 5', text: 'The owner signs off payroll' },
  blurb: 'The one approval in the product that no rule can route elsewhere. HR computes; the owner signs. An admin cannot reach any step of this, and the screen says so at step 1 rather than at step 3.',
  steps: [
    step(1, '/workforce', `${panelHead('/workforce', 'November 2026')}${panelBody(`${miniRow('at-risk', 'RUN-2026-11 · computed 09:14 by Farzana Yasmin', 'awaiting')}${panelText('The run reaches “computed” when HR has run it. Only the owner moves it to “approved” — the state machine allows the transition, and the service checks who is asking.')}`)}`),
    arrow(),
    step(2, 'the run', `${panelHead('/workforce', 'the totals')}${panelBody(`${miniRow('on-track', 'Net payable · ৳1,04,82,640', '2,412')}${miniRow('on-track', 'Overtime · ৳9,41,220', '18,640 h')}${miniRow('on-track', 'Parallel run · 0 unexplained', '✓')}${panelText('Overtime is 2× basic on a 208-hour divisor; the gazette version the run was computed against is pinned to it, so a later gazette cannot rewrite this month.')}`)}`),
    arrow(),
    step(3, 'the confirm', `${panelHead('ConfirmDialog', 'Approve the November run?')}${panelBody(`${panelText('<strong>2,412 workers · ৳1,04,82,640 net.</strong> The parallel run against the factory’s own November sheet reconciled to zero unexplained differences.')}${panelText('This is the consequence that must not be missed, so the totals are repeated here rather than assumed read.')}<div style="display: flex; gap: 8px; justify-content: flex-end;">${btn('ghost', 'Cancel', { size: 'sm' })}${btn('primary', 'Approve', { size: 'sm' })}</div>`)}`),
    arrow(),
    step(4, 'approved', `${panelHead('/workforce', 'approved')}${panelBody(`${miniRow('done', 'RUN-2026-11 · approved by Mr. Rahman, 14:31', '✓')}${panelText('The audit trail carries the sentence and the totals. Payslips become available to HR; nothing on this screen can un-approve a run — a correction is a new run, because a payslip somebody has already been paid against is a record, not a draft.')}`)}`),
  ].join(''),
  tail: 'The parallel run is a go-live gate, not a feature: one month against the factory’s own sheet, every net to zero or explained, with the report committed. This screen shows its result because an owner signing a number should be able to see it reconciled.',
})

/* ══════════════════════════════════════════════════════════════════════════
   26–27 · The Bengali pass — /home and /setup
   ══════════════════════════════════════════════════════════════════════════ */

const bnHeading = (text, right) =>
  `<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
    ${slashes(LIGHT, { accent: true, h: 15 })}
    <h2 style="font: 600 26px/1.35 ${BANGLA}; letter-spacing: 0; margin: 0;">${text}</h2>
    ${right ? `<span style="margin-left: auto; font: 400 12.5px/1.5 ${BANGLA}; color: var(--fx-text-tertiary);">${right}</span>` : ''}
  </div>`

const bnFigure = ({ label, value, unit, basis }) =>
  `<div style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; box-shadow: var(--fx-sh1); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; min-width: 0;">
    <div style="font: 500 12.5px/1.5 ${BANGLA}; color: var(--fx-text-tertiary);">${label}</div>
    <div style="display: flex; align-items: baseline; gap: 6px;">
      <span data-numeric style="font: 600 34px/1.05 ${SANS}; letter-spacing: -.02em;">${value}</span>
      ${unit ? `<span style="font: 400 14px/1 ${MONO}; color: var(--fx-text-tertiary);">${unit}</span>` : ''}
    </div>
    <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-secondary); text-wrap: pretty;">${basis}</div>
  </div>`

emit('BengaliHome.dc.html', screen({
  w: 1440, h: 1720, bangla: true, active: 'home', badges: { approve: 7 },
  phrase: 'ওনার', who: 'MR', markState: 'listening',
  inner: `${pageHeader({ eyebrow: 'যা আপনার দরকার', title: 'আপনার কাজ', meta: 'বুধবার, ২ ডিসেম্বর ২০২৬', bangla: true })}

  ${bnHeading('কী ভুল হয়ে আছে', '৪টি খোলা')}
  ${card(`
    ${row({ bangla: true, status: 'late', critical: true, code: 'PO-BF-2044', text: 'নির্ধারিত এক্স-ফ্যাক্টরির চেয়ে ৪ দিন দেরি হয়ে যাবে — কাটিং শুরু করা যাচ্ছে না, কারণ ST-2610-এর PP স্যাম্পল এখনও H&M-এর কাছে', sub: '42,000 pcs · $203,700 FOB · এক্স-ফ্যাক্টরি 18 Dec 2026', meta: '9 days', right: statusLabel('late', 'দেরি') })}
    ${row({ bangla: true, status: 'late', code: 'LC-BF-7781', text: 'শেষ শিপমেন্টের তারিখ 21 Dec এখন নতুন এক্স-ফ্যাক্টরির আগে পড়ে যাচ্ছে', sub: 'Bestseller A/S · $486,200 · সংশোধনী এখনও তোলা হয়নি', meta: '2 days', right: statusLabel('late', 'দেরি') })}
    ${row({ bangla: true, status: 'at-risk', code: 'UD-2026-118', text: 'ছয়টি খোলা বন্ডেড ইস্যুর বিপরীতে ব্যালান্স 1,240 m — করিম উদ্দিন 160 m বেশি তোলার অনুমতি চেয়েছেন', sub: 'কাউন্টারে ১১:২০-এ আটকে গেছে; সিদ্ধান্তটা আপনার', meta: '4 h', right: statusLabel('at-risk', 'ঝুঁকিতে') })}
  `)}
  <div style="height: 30px;"></div>

  ${bnHeading('এখনই ঠিক করুন', '৭টি খসড়া, ২টি পুরনো')}
  ${card(`
    ${row({ bangla: true, status: 'done', code: 'স্টোর', text: '৩টি খসড়া — চালানের ছবি থেকে পড়া মালামাল বুঝে নেওয়ার হিসাব', sub: 'সবচেয়ে পুরনোটি ২৬ ঘণ্টা · সবচেয়ে দুর্বল ঘর ০.৮২', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.82)}${badge('accent', '26 h')}</span>` })}
    ${row({ bangla: true, status: 'done', code: 'মার্চেন্ডাইজিং', text: '২টি খসড়া — মাপের তালিকা আর একটি নতুন অর্ডার', sub: 'সবচেয়ে পুরনোটি ২৬ ঘণ্টা · সবচেয়ে দুর্বল ঘর ০.৭৪', right: `<span style="display: flex; align-items: center; gap: 12px;">${confidence(0.74)}${badge('accent', '26 h')}</span>` })}
  `)}
  <div style="height: 30px;"></div>

  ${bnHeading('হিসাবগুলো', '২ নভেম্বর → ২ ডিসেম্বর')}
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
    ${bnFigure({ label: 'অর্ডার বই', value: '19', unit: 'orders', basis: '৫টি ধাপ মিলিয়ে 412,000 পিস' })}
    ${bnFigure({ label: 'সময়মতো ডেলিভারি', value: '91', unit: '%', basis: '৩৪টি শিপমেন্টের মধ্যে ৩১টি নির্ধারিত এক্স-ফ্যাক্টরির দিনেই গেছে · গতকাল পর্যন্ত' })}
    ${bnFigure({ label: 'দক্ষতা', value: '68', unit: '%', basis: '১৪২ লাইন-দিনের ঘণ্টাভিত্তিক উৎপাদন থেকে' })}
    ${bnFigure({ label: 'DHU', value: '4.2', basis: '২৬ দিনের ইনলাইন চেক · প্রতি একশ পিসে ত্রুটি' })}
    ${bnFigure({ label: 'নগদ অবস্থা · USD', value: '173,260', basis: '$486,200 আসছে, $312,940 যাচ্ছে · এক মুদ্রাতেই হিসাব' })}
    ${bnFigure({ label: 'পে-রোল · নভেম্বর', value: '৳1,04,82,640', basis: '২,৪১২ জন কর্মী · ফারজানা ইয়াসমিন হিসাব করেছেন, আপনার অনুমোদনের অপেক্ষায়' })}
  </div>
  <div style="height: 30px;"></div>

  ${bnHeading('যে ডেস্কগুলোতে মানুষ দরকার', '১২টি ডেস্ক')}
  ${card(`
    ${row({ bangla: true, status: 'at-risk', code: '/store/receive', text: '<strong style="font-weight: 600;">স্টোর</strong> — গেটে ৩টি ট্রাক · ১টি GRN এখনও পরীক্ষা হয়নি', sub: 'করিম উদ্দিন' })}
    ${row({ bangla: true, status: 'late', code: '/lines/hourly', text: '<strong style="font-weight: 600;">প্রোডাকশন</strong> — L4 পরিকল্পনার চেয়ে ২২% পিছিয়ে · ৪২ মিনিট মেশিন বন্ধ', sub: 'শিল্পী বেগম, রিনা দাস' })}
    ${row({ bangla: true, status: 'at-risk', code: '/workforce', text: '<strong style="font-weight: 600;">কর্মী ও পে-রোল</strong> — নভেম্বরের হিসাব হয়ে গেছে, আপনার অনুমোদনের অপেক্ষায়', sub: 'ফারজানা ইয়াসমিন' })}
  `)}
  ${note('Bengali runs 30–40% longer, and the exception sentences are where that bites — they are the longest strings on the owner’s screen and they must not truncate. Identifiers, money and quantities stay Latin mono in both languages: PO-BF-2044, 12,400 m and $203,700 are what the paper on the desk says.')}`,
}))

emit('BengaliSetup.dc.html', screen({
  w: 1440, h: 1420, bangla: true, active: 'setup', phrase: 'অ্যাডমিন', who: 'AD',
  inner: `${pageHeader({ eyebrow: 'সেটআপ', title: 'আপনার কারখানা যা দিয়ে তৈরি', meta: 'আইটেম, লোকেশন, লাইন, মানুষ আর কর্মী', ownsAmber: false, bangla: true })}
  <div style="font: 400 14px/1.7 ${BANGLA}; color: var(--fx-text-secondary); max-width: 84ch; margin-bottom: 30px; text-wrap: pretty;">
    এর পরের সব কিছু — মাল বুঝে নেওয়া, ইস্যু করা, কাটিং, বোর্ড, হাজিরা, পে-রোল — এগুলো আগে থাকা লাগে। প্রতিটি সারি তার নিজের ড্রয়ার খোলে, আর প্রতিটি অংশের একটাই কাজ থাকে।
  </div>
  <div style="display: flex; flex-direction: column; gap: 34px;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${bnHeading('লাইন আর ক্যালেন্ডার')}
      <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-secondary); max-width: 84ch; text-wrap: pretty;">আটটি সেলাই লাইন আর কোন লাইন কোন দিন চলে। প্ল্যানিং বোর্ড, ঘণ্টার শিট আর দক্ষতার প্রতিটি হিসাব এই ক্যালেন্ডার ধরেই হয় — তাই একটা ছুটি ভুল দিলে সারা মাসের দক্ষতাও ভুল হয়।</div>
      ${card(`
        ${setupRow('L1', 'লাইন ১', '৬৮ জন অপারেটর · শুক্রবার বন্ধ')}
        ${setupRow('L2', 'লাইন ২', '৬৮ জন অপারেটর · শুক্রবার বন্ধ')}
        ${setupRow('L4', 'লাইন ৪', '৭২ জন অপারেটর · শুক্রবার বন্ধ')}
      `)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${bnHeading('মানুষ')}
      <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-secondary); max-width: 84ch; text-wrap: pretty;">সতেরোটি রোল, আর একজন একাধিক রোল রাখতে পারেন। রোল ঠিক করে কোন স্ক্রিনগুলো তার জন্য আছে; লাইন স্কোপ ঠিক করে সেই স্ক্রিনের ভেতরে সে কতটুকু দেখবে। লাইন স্কোপ খালি রাখলে পুরো ফ্লোর বোঝায়।</div>
      ${card(`
        ${setupRow('KU', 'করিম উদ্দিন', 'স্টোরকিপার · পুরো ফ্লোর')}
        ${setupRow('SB', 'শিল্পী বেগম', 'প্রোডাকশন · L1, L2')}
        ${setupRow('GM', 'সাধারণ সদস্য', 'এখনও কোনো ডেস্ক নেই', badge('accent', 'রোল দরকার'))}
      `)}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${bnHeading('কর্মী')}
      <div style="font: 400 13.5px/1.7 ${BANGLA}; color: var(--fx-text-secondary); max-width: 84ch; text-wrap: pretty;">এটা রোস্টার — কর্মী নম্বর, গ্রেড আর লাইন। এটা পে-রোল নয়: মাথাগোনা আর সেকশন সাধারণ কারখানার তথ্য। যেখানে টাকার অঙ্ক আছে সেটা HR-এর নিজের দরজা, /workforce-এ।</div>
      ${card(`
        ${setupRow('W-00412', 'রোকেয়া বেগম', 'গ্রেড ৪ · L1 · সেলাই অপারেটর')}
        ${setupRow('W-00418', 'নাসিমা খাতুন', 'গ্রেড ৩ · L1 · হেলপার')}
      `)}
    </div>
  </div>
  ${note('Employee numbers, line codes and grades keep their Latin forms — W-00412 is what the card in the worker’s pocket says. Bengali digits appear only where a date is read as prose, never on an identifier or a quantity.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   canvas.json
   ══════════════════════════════════════════════════════════════════════════ */

const A = (file, x, y, w, h, page, title) => ({ file, x, y, w, h, page, title })

const canvas = {
  pages: [
    { id: 'morning', name: 'The morning' },
    { id: 'inbox', name: 'Inbox & desks' },
    { id: 'setup', name: 'Setup & settings' },
    { id: 'gates', name: 'Drawers & gates' },
    { id: 'flows', name: 'Flows' },
    { id: 'bengali', name: 'Bengali' },
  ],
  artboards: [
    A('Main.dc.html', 0, 0, 1440, 2160, 'morning', '/home · owner · populated'),
    A('HomeAdmin.dc.html', 1560, 0, 1440, 2160, 'morning', '/home · admin · populated'),
    A('HomeEmpty.dc.html', 3120, 0, 1440, 1180, 'morning', '/home · empty (calm and day one)'),
    A('HomeStates.dc.html', 3120, 1420, 1440, 1080, 'morning', '/home · loading and error'),
    A('HomePhone.dc.html', 0, 2400, 1400, 900, 'morning', '/home · phone · the three Pulse tabs'),

    A('Approve.dc.html', 0, 0, 1440, 1160, 'inbox', '/approve · populated · every desk'),
    A('ApproveEmpty.dc.html', 1560, 0, 1440, 900, 'inbox', '/approve · empty'),
    A('Alerts.dc.html', 3120, 0, 1440, 940, 'inbox', '/alerts · populated · owner scope'),
    A('Refused.dc.html', 4680, 0, 1440, 940, 'inbox', '/refused · populated · every desk'),
    A('DesksFloor.dc.html', 0, 1400, 1560, 1080, 'inbox', 'the floor desks, as the owner opens them'),
    A('DesksOffice.dc.html', 1680, 1400, 1560, 1140, 'inbox', 'the office desks, as the owner opens them'),

    A('Setup.dc.html', 0, 0, 1440, 2560, 'setup', '/setup · populated · six sections'),
    A('SetupEmpty.dc.html', 1560, 0, 1440, 1080, 'setup', '/setup · empty (day one)'),
    A('SetupPerson.dc.html', 1560, 1320, 1300, 1120, 'setup', 'drawer · person · grant, scope, invite'),
    A('Settings.dc.html', 3120, 0, 1440, 1760, 'setup', '/settings · populated · policy'),
    A('SettingsRules.dc.html', 0, 2760, 1560, 1240, 'setup', '/settings#routing · approval rules'),
    A('SettingsAudit.dc.html', 1680, 2760, 1560, 1140, 'setup', '/settings#audit · the trail'),
    A('Factory.dc.html', 3360, 2760, 1440, 1180, 'setup', '/factory · the tenant card'),

    A('DrawerFigure.dc.html', 0, 0, 1300, 1060, 'gates', 'drawer · figure · trend and the denominator'),
    A('Workforce.dc.html', 1420, 0, 1560, 1440, 'gates', '/workforce · owner | admin — the payroll gate'),

    A('F1.dc.html', 0, 0, 1820, 820, 'flows', 'F1 · the morning'),
    A('F2.dc.html', 1940, 0, 2260, 840, 'flows', 'F2 · approving with a correction'),
    A('F3.dc.html', 0, 1060, 2260, 880, 'flows', 'F3 · onboarding a line supervisor'),
    A('F4.dc.html', 2380, 1060, 2260, 900, 'flows', 'F4 · changing an approval rule'),
    A('F5.dc.html', 0, 2180, 1820, 880, 'flows', 'F5 · the owner signs off payroll'),

    A('BengaliHome.dc.html', 0, 0, 1440, 1720, 'bengali', '/home · bn'),
    A('BengaliSetup.dc.html', 1560, 0, 1440, 1420, 'bengali', '/setup · bn'),
  ],
  annotations: [
    { id: 'brief-morning', page: 'morning', x: 0, y: -240, w: 660,
      text: 'S1 — Owner and Admin.\n\nThe order of /home is the argument: what is wrong, then what to decide, then the numbers, then the desks. Plan 2.1 settled that home wins over /dashboard and that decision is not reopened here — queues are actionable, figures are context, an owner acts first and reads second.\n\nThe admin is the owner’s twin. Two differences, both drawn: payroll, and approval routing.' },
    { id: 'brief-inbox', page: 'inbox', x: 0, y: -220, w: 660,
      text: 'The owner is the only person who sees every desk at once.\n\nThe inbox spans all of them; the refusal report spans all of them; the desk grid is what later sessions point at for "what the owner sees of my work".\n\nThe grid’s rule: the desk’s own screen, unchanged. The only additions are the two approvals that are the owner’s alone — the payroll run and the cost sheet — and they are the only "as owner" affordance in the product.' },
    { id: 'brief-setup', page: 'setup', x: 0, y: -260, w: 680,
      text: 'Setup is what the factory is made of; Settings is how it behaves.\n\nThree of the six setup sections drawn here are NOT on /setup today — company profile and People live at /settings, and Suppliers has an action with no section. Drawing them together is a proposal, and the empty state is its argument: they depend on each other in that order.\n\nApproval routing is the one screen an admin can read and cannot change.' },
    { id: 'brief-gates', page: 'gates', x: 0, y: -200, w: 640,
      text: 'The figure drawer is new in S1: every tile on the numbers strip opens one, and the second tab is the denominator itself.\n\nA figure a person cannot argue with is a figure they will not trust — so the 34 shipments behind "91%" are rows, with the three late ones at the top.' },
    { id: 'brief-flows', page: 'flows', x: 0, y: -220, w: 660,
      text: 'Five flows, one artboard each — the whole sequence readable at once, which is what a flow is for.\n\nF4 is drawn as it actually runs rather than as the brief described it: the admin reaches the rules screen, reads every rule, and stops, because upsertApprovalRule refuses anybody without the owner role. The owner finishes the flow.' },
    { id: 'brief-bengali', page: 'bengali', x: 0, y: -200, w: 640,
      text: 'The exception sentences are the longest strings on the owner’s screen and the place Bengali’s extra 30–40% actually bites.\n\nIdentifiers, money and quantities stay Latin mono in both languages. PO-BF-2044 is what the paper on the desk says.' },
  ],
  launch: { view: 'canvas', page: 'morning' },
}

writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2))
made.push('canvas.json')

writeFileSync(join(OUT, '.made'), made.join('\n'))
console.log('emitted', made.length + ':', made.join(' '))
