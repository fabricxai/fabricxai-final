/** S8 — the merchandiser's desk (orders, sampling, memory). Run: node _build.mjs */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIGHT, SANS, MONO, BANGLA, board, mark, slashes, statusLabel, eyebrow, mono, badge,
  btn, kbd, fact, confidence } from '../shell-and-drawers/_kit.mjs'
import { pageHeader } from '../shell-and-drawers/_shell.mjs'
import { drawer, gateChip, linkRow, readOnlyNote } from '../shell-and-drawers/_drawer.mjs'
import { screen, sectionHeading, card, row, figureTile, emptyState, note, caption,
  refusalNote, step, arrow, miniRow } from '../owner-and-admin/_page.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const made = []
const emit = (name, src) => { made.push(name); writeFileSync(join(OUT, name), src) }

const desk = (o) => screen({ role: 'merchandiser', phrase: 'Merchandiser', who: 'RA', collapsed: [], ...o })

/* ── The book. LC chip is a number AND a day count; red only when conflicting. ── */

const lcChip = (number, days, conflict) =>
  `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 5px 9px; border-radius: 999px; border: 1px solid ${conflict ? 'var(--fx-danger)' : 'var(--fx-border-default)'}; background: var(--fx-bg-surface); font: 500 11.5px/1 ${MONO}; color: var(--fx-text-${conflict ? 'primary' : 'secondary'}); white-space: nowrap;">
    ${conflict ? '<span style="color: var(--fx-danger);">●</span>' : ''}${number} · ${days}</span>`

const ORDERS = [
  { status: 'late', critical: true, po: 'PO-BF-2044', buyer: 'H&M', styles: 'ST-2610', qty: '42,000', value: '$203,700', ex: '18 Dec', lc: ['LC-BF-7781', '−3d', true], health: 'cutting not started — PP still with the buyer' },
  { status: 'at-risk', po: 'PO-BF-2041', buyer: 'Primark', styles: 'ST-2588', qty: '12,000', value: '$62,400', ex: '9 Dec', lc: ['LC-BF-7774', '19d', false], health: 'in finishing, 8,400 of 12,000 sewn' },
  { status: 'on-track', po: 'PO-BF-2039', buyer: 'Bestseller A/S', styles: 'ST-2571', qty: '18,000', value: '$97,200', ex: '22 Dec', lc: ['LC-BF-7786', '34d', false], health: 'on plan, cutting 62% complete' },
  { status: 'on-track', po: 'PO-BF-2036', buyer: 'C&A', styles: 'ST-2544, ST-2545', qty: '24,000', value: '$118,800', ex: '6 Jan', lc: ['LC-BF-7790', '48d', false], health: 'fabric in-house, lay planned for 8 Dec' },
  { status: 'done', po: 'PO-BF-2029', buyer: 'H&M', styles: 'ST-2510', qty: '8,000', value: '$38,400', ex: '18 Nov', lc: ['LC-BF-7752', 'closed', false], health: 'shipped in full, realised 28 Nov' },
]

const orderRow = (o) => `<div class="fx-selvage" data-status="${o.status}" ${o.critical ? 'data-critical="true"' : ''} style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
  <div style="flex: 1; min-width: 0; display: grid; grid-template-columns: 128px minmax(0, 1fr) 92px 96px 84px 156px; gap: 14px; align-items: center; padding: 12px 18px; min-height: 44px;">
    <span>${mono(o.po, { size: 12.5 })}</span>
    <div style="min-width: 0; display: flex; flex-direction: column; gap: 3px;">
      <span style="font: 500 14px/1.35 ${SANS};">${o.buyer} · ${o.styles}</span>
      <span style="font: 400 12.5px/1.4 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${o.health}</span>
    </div>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary); text-align: right;">${o.qty}</span>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; text-align: right;">${o.value}</span>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary); text-align: right;">${o.ex}</span>
    <span style="display: flex; justify-content: flex-end; gap: 8px; align-items: center;">${lcChip(...o.lc)}</span>
  </div>
</div>`

const bookHead = () => `<div style="border-bottom: 1px solid var(--fx-border-default); background: var(--fx-bg-surface);">
  <div style="display: grid; grid-template-columns: 128px minmax(0, 1fr) 92px 96px 84px 156px; gap: 14px; padding: 10px 18px 10px 21px;">
    ${eyebrow('PO')}${eyebrow('Buyer &amp; style')}<span style="text-align: right;">${eyebrow('Qty')}</span><span style="text-align: right;">${eyebrow('Value')}</span><span style="text-align: right;">${eyebrow('Ex-fty')}</span><span style="text-align: right;">${eyebrow('LC')}</span>
  </div></div>`

/* ══════════════════════════════════════════════════════════════════════════
   1–3 · /home — the merchandiser's morning
   ══════════════════════════════════════════════════════════════════════════ */

const dayGroup = (day, date, rows) => `<div style="display: flex; flex-direction: column; gap: 0;">
  <div style="display: flex; align-items: baseline; gap: 10px; padding: 12px 18px 8px; background: var(--fx-bg-sunken); border-top: 1px solid var(--fx-border-subtle);">
    <span style="font: 600 13px/1.3 ${SANS};">${day}</span>${mono(date, { size: 11.5, colour: 'var(--fx-text-tertiary)' })}
  </div>${rows}</div>`

emit('Main.dc.html', desk({
  h: 2020, active: 'home', badges: { approve: 3 }, markState: 'listening',
  inner: `${pageHeader({ eyebrow: 'What needs you', title: 'Your work', meta: 'Wednesday, 2 December 2026 · Rashida Akter' })}

  ${sectionHeading('Milestones due this week', 'orderTnaPeek · 6 across 4 orders')}
  ${card(`
    ${dayGroup('Today', 'Wed 2 Dec', `
      ${row({ status: 'late', code: 'PO-BF-2044', text: 'PP sample verdict — 11 days out with H&M, and cutting cannot start without it', sub: 'ST-2610 · chase, or move the ex-factory', meta: 'overdue', right: statusLabel('late', 'late') })}
      ${row({ status: 'at-risk', code: 'PO-BF-2036', text: 'Colour approval due from C&A', sub: 'ST-2544 · 3 colours submitted 26 Nov', meta: 'today', right: statusLabel('at-risk', 'due') })}
    `)}
    ${dayGroup('Tomorrow', 'Thu 3 Dec', `
      ${row({ status: 'on-track', code: 'PO-BF-2039', text: 'Fabric in-house', sub: 'ST-2571 · 18,400 m against PO-IMP-0308', meta: 'planned', right: statusLabel('on-track', 'on track') })}
    `)}
    ${dayGroup('Friday', 'Fri 4 Dec', `
      ${row({ status: 'on-track', code: 'PO-BF-2041', text: 'Finishing complete', sub: 'ST-2588 · 12,000 pcs', meta: 'planned', right: statusLabel('on-track', 'on track') })}
      ${row({ status: 'at-risk', code: 'PO-BF-2036', text: 'Lay planning', sub: 'ST-2544 · waiting on the colour approval above', meta: 'planned', right: statusLabel('at-risk', 'blocked by') })}
    `)}
  `)}
  <div style="height: 28px;"></div>

  ${sectionHeading('PP verdicts waiting on buyers', '2 samples')}
  ${card(`
    ${row({ status: 'late', code: 'SMP-0412', text: 'ST-2610 PP — dispatched to H&M 21 Nov, no verdict', sub: 'AWB 176-44219308 · chased 25 Nov and 1 Dec · this one gates cutting', meta: '11 days', right: statusLabel('late', 'late') })}
    ${row({ status: 'at-risk', code: 'SMP-0418', text: 'ST-2544 fit — with C&A since 28 Nov', sub: 'AWB 176-44221140 · first round', meta: '4 days', right: statusLabel('at-risk', 'waiting') })}
  `)}
  <div style="height: 28px;"></div>

  ${sectionHeading('Samples due to dispatch', '1 in the room')}
  ${card(`
    ${row({ status: 'at-risk', code: 'SMP-0421', text: 'ST-2588 shipment sample — sewn, not yet couriered', sub: 'Primark asked for it by 5 Dec', meta: '3 days', right: statusLabel('at-risk', 'due') })}
  `)}
  <div style="height: 28px;"></div>

  ${sectionHeading('Drafts you raised', '2 waiting on you to confirm')}
  ${card(`
    ${row({ status: 'done', code: 'ST-2610', text: 'style measurements read from the tech pack', sub: '23 fields · 3 below 0.90 · sent for approval 26 h ago', right: `<span style="display: flex; align-items: center; gap: 10px;">${confidence(0.74)}${btn('ghost', 'Discard', { size: 'sm' })}${btn('secondary', 'Confirm the reading', { size: 'sm' })}</span>` })}
    ${row({ status: 'done', code: 'PO-BF-2047', text: 'a new order read from H&M’s purchase order', sub: '14 fields · all above 0.90', right: `<span style="display: flex; align-items: center; gap: 10px;">${confidence(0.94)}${btn('ghost', 'Discard', { size: 'sm' })}${btn('secondary', 'Confirm the reading', { size: 'sm' })}</span>` })}
  `)}
  <div style="height: 28px;"></div>

  ${sectionHeading('RFQs due', '1 this week')}
  ${card(`
    ${row({ status: 'at-risk', code: 'RFQ-0088', text: 'Bestseller A/S — 3 styles, quote due 5 Dec', sub: 'costing started on one of the three', meta: '3 days', right: statusLabel('at-risk', 'due') })}
  `)}
  ${note('Milestones group by DAY, not by order — a merchandiser’s week is a calendar, and an order-shaped list makes them re-sort it in their head every morning. The blocked Friday row names what blocks it rather than only its own status: “waiting on the colour approval above” is the sentence that saves the chase.')}`,
}))

emit('HomeEmpty.dc.html', desk({
  h: 900, active: 'home',
  inner: `${pageHeader({ eyebrow: 'What needs you', title: 'Your work', meta: 'Test Textile Ltd' })}
  ${emptyState('Nothing is booked yet',
    'The desk fills from the order book. Drop a buyer’s purchase order and MARBIM reads it into a draft — buyer, styles, quantities, dates and price — for you to correct and confirm. Or book one by hand; both end in the same place.',
    `<div style="display: flex; gap: 10px;">${btn('primary', 'Drop a buyer PO')}${btn('secondary', 'Book one by hand')}</div>`)}
  ${note('Two doors, and the manual one is never removed. A desk that can only be filled by a document reader is a desk that stops when the reader is wrong.')}`,
}))

/* ── 3 · phone — the Desk skin ───────────────────────────────────────────── */

const phone = (tab, inner) => {
  const tabs = ['Order book', 'Capture', 'Confirm']
  return `<div style="width: 390px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
    ${caption(`${tab + 1} · ${tabs[tab].toLowerCase()}`)}
    <div style="width: 390px; height: 720px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; background: var(--fx-bg-canvas);">
      <div style="flex-shrink: 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); padding: 12px 16px; min-height: 60px; display: flex; align-items: center; gap: 10px;">
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
          <span style="font: 600 17px/1.2 ${SANS};">${tabs[tab]}</span>
          <span style="font: 500 10.5px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary);">Merchandiser · Rashida Akter</span>
        </div>${mark(22, LIGHT, { state: 'listening' })}
      </div>
      <div style="flex: 1; min-height: 0; padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: hidden;">${inner}</div>
      <div style="display: flex; background: var(--fx-bg-surface); border-top: 1px solid var(--fx-border-default);">
        ${tabs.map((t, i) => `<span style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 56px; padding: 8px 4px; color: var(--fx-text-${i === tab ? 'primary' : 'tertiary'});">
          <span style="display: block; width: 2px; height: 12px; transform: skewX(-34deg); background: ${i === tab ? 'var(--fx-accent)' : 'transparent'};"></span>
          <span style="font: ${i === tab ? '600' : '500'} 12px/1.2 ${SANS};">${t}</span></span>`).join('')}
      </div>
    </div>
  </div>`
}

emit('HomePhone.dc.html', board({
  w: 1400, h: 920, pad: 40,
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Desk — the merchandiser and commercial skin')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); margin-top: 10px; max-width: 96ch; text-wrap: pretty;">
      Costing, breakdowns and TNA templates are desk work and are deliberately absent. The phone carries the parts of the day that happen away from the desk: reading the book, getting paper into the system before walking back, and confirming a reading from anywhere. Nothing here writes offline — capture and raiser-confirm only.
    </div>
  </div>
  <div style="display: flex; gap: 32px; align-items: flex-start;">
    ${phone(0, ORDERS.slice(0, 4).map((o) => `<div class="fx-selvage" data-status="${o.status}" style="background: var(--fx-bg-surface); border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden;">
      <div style="flex: 1; min-width: 0; padding: 11px 13px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">${mono(o.po, { size: 12 })}<span style="font: 500 13px/1.3 ${SANS};">${o.buyer}</span></div>
        <span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${o.health}</span>
        <div style="display: flex; gap: 8px; align-items: center;">${lcChip(...o.lc)}<span data-numeric style="font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary);">ex-fty ${o.ex}</span></div>
      </div></div>`).join(''))}
    ${phone(1, `<div style="border: 1px dashed var(--fx-border-strong); border-radius: 8px; background: var(--fx-bg-surface); flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 30px 20px; text-align: center;">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="14" rx="2" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/><circle cx="12" cy="13" r="4" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/><path d="M8.5 6l1.5-2h4l1.5 2" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/></svg>
      <span style="font: 600 15px/1.3 ${SANS};">Photograph the paper</span>
      <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">A purchase order, a SWIFT, a pro-forma. It goes into the system now; the reading waits in Your work to confirm at the desk.</span>
      ${btn('primary', 'Take a photo', { size: 'lg', tap: 48, full: true })}
    </div>
    <div style="font: 400 12px/1.55 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">Nothing is written from here — a photograph is a document, not an order.</div>`)}
    ${phone(2, `<div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-accent-subtle); padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start;">
      ${mark(20, LIGHT)}<span style="font: 400 13px/1.55 ${SANS}; text-wrap: pretty;">Your reading of H&M’s purchase order. Confirm it and it goes for approval; discard it and nothing is written.</span></div>
    ${[['Buyer', 'H&M', 0.98], ['PO number', 'PO-BF-2047', 0.96], ['Quantity', '30,000 pcs', 0.94], ['Ex-factory', '22 Jan 2027', 0.91]].map(([l, v, c]) => `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
      <span style="font: 400 12px/1.3 ${SANS}; color: var(--fx-text-secondary);">${l}</span>
      <span style="font: 500 14px/1.3 ${SANS};">${v}</span>${confidence(c)}</div>`).join('')}
    <div style="display: flex; gap: 8px; margin-top: auto;">${btn('ghost', 'Discard', { tap: 44 })}${btn('primary', 'Confirm', { tap: 44, full: true })}</div>`)}
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   4–7 · /orders — the book
   ══════════════════════════════════════════════════════════════════════════ */

emit('Orders.dc.html', desk({
  h: 1160, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'The book', title: 'Order desk & TNA', meta: '19 open · 412,000 pcs · $1.94m', ownsAmber: false,
    actions: `<div style="display: flex; gap: 10px;">${btn('secondary', 'Drop a buyer PO')}${btn('primary', 'Book an order')}</div>` })}
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px;">
    ${figureTile({ label: 'Shipping this month', value: '11', unit: 'orders', basis: 'of 19 open · 214,000 pieces', asOf: 'just now' })}
    ${figureTile({ label: 'At risk or late', value: '2', basis: 'PO-BF-2044 late 4 days · PO-BF-2041 in finishing', asOf: 'just now', tone: 'var(--fx-danger)' })}
    ${figureTile({ label: 'LC conflicts', value: '1', basis: 'LC-BF-7781’s latest shipment falls before ex-factory', asOf: 'just now', tone: 'var(--fx-danger)' })}
    ${figureTile({ label: 'Inputs not ready', value: '4', unit: 'cells', basis: 'across 3 orders — fabric on two, trims on two', asOf: 'today, 06:00', tone: 'var(--fx-warning)' })}
  </div>
  <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center;">
    ${['All 19', 'Late 1', 'At risk 1', 'In production 9', 'Shipped 6'].map((f, i) => `<span style="display: inline-flex; align-items: center; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-border-${i === 0 ? 'default' : 'subtle'}); background: ${i === 0 ? 'var(--fx-bg-selected)' : 'transparent'}; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-${i === 0 ? 'primary' : 'secondary'});">${f}</span>`).join('')}
    <span style="margin-left: auto; display: inline-flex; gap: 7px; align-items: center;"><span style="font: 400 12px/1 ${SANS}; color: var(--fx-text-tertiary);">move</span>${kbd('j')}${kbd('k')}<span style="font: 400 12px/1 ${SANS}; color: var(--fx-text-tertiary);">open</span>${kbd('↵')}<span style="font: 400 12px/1 ${SANS}; color: var(--fx-text-tertiary);">inputs</span>${kbd('i')}</span>
  </div>
  ${card(`${bookHead()}${ORDERS.map(orderRow).join('')}`)}
  ${note('The LC chip carries a number and a countdown, and turns red only when the latest-shipment date actually conflicts with the ex-factory date — not when it is merely close. A chip that reddens early is a chip a merchandiser learns to ignore, and this one has to survive being ignored exactly zero times.')}`,
}))

emit('OrdersEmpty.dc.html', desk({
  h: 880, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'The book', title: 'Order desk & TNA', meta: 'Test Textile Ltd', ownsAmber: false })}
  ${emptyState('No orders yet — drop a buyer PO or book one by hand',
    'A purchase order becomes a draft: buyer, styles, colour and size breakdown, quantities, price and dates, each with the confidence it was read at. You correct what is wrong and confirm; the TNA generates itself from the ex-factory date backwards.',
    `<div style="display: flex; gap: 10px;">${btn('primary', 'Drop a buyer PO')}${btn('secondary', 'Book one by hand')}</div>`)}`,
}))

emit('OrdersStates.dc.html', desk({
  h: 1000, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'The book', title: 'Order desk & TNA', ownsAmber: false })}
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 30px; align-items: start;">
    <div>${caption('loading')}
      <div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 60px 24px;">
        ${mark(48, LIGHT, { state: 'thinking' })}<span style="font: 400 13px/1 ${MONO}; color: var(--fx-text-tertiary);">Reading the book…</span>
      </div>
      ${note('The KPI row and the rows load together — a book whose figures arrive after its rows invites somebody to read a total that does not match what is under it.')}
    </div>
    <div>${caption('error')}
      <div style="border: 1px solid var(--fx-danger); border-radius: 8px; padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; background: var(--fx-bg-surface);">
        ${mark(32, LIGHT, { state: 'blocked' })}
        <div style="font: 600 17px/1.25 ${SANS};">The book did not load</div>
        <div style="font: 400 14px/1.55 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">Nothing has changed on any order. If you were part-way through booking one, the draft is still in Your work.</div>
        ${btn('secondary', 'Try again')}
      </div>
      ${note('The second sentence is the one that matters. A merchandiser who has just spent ten minutes on a breakdown needs to know it survived before they will press anything.')}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   8–9 · The order drawer (720) and the TNA full page
   ══════════════════════════════════════════════════════════════════════════ */

const MILESTONES = [
  ['Order confirmed', '4 Nov', '4 Nov', 'done', false, 'Rashida Akter'],
  ['Tech pack received', '8 Nov', '8 Nov', 'done', false, 'Rashida Akter'],
  ['PP sample sent', '21 Nov', '21 Nov', 'done', true, 'Sampling room'],
  ['PP approved', '28 Nov', null, 'late', true, 'H&M — the buyer'],
  ['Fabric in-house', '26 Nov', '28 Nov', 'done', true, 'Store'],
  ['Trims in-house', '30 Nov', '30 Nov', 'done', false, 'Store'],
  ['Cutting start', '1 Dec', null, 'late', true, 'Cutting — gated on PP'],
  ['Sewing start', '4 Dec', null, 'at-risk', true, 'Production'],
  ['Finishing complete', '14 Dec', null, 'at-risk', false, 'Production'],
  ['Ex-factory', '18 Dec', null, 'at-risk', true, 'Shipment'],
]

const milestone = ([name, planned, actual, state, critical, owner], last) => {
  const tone = { done: 'var(--fx-success)', late: 'var(--fx-danger)', 'at-risk': 'var(--fx-warning)' }[state]
  const glyph = { done: '✓', late: '✕', 'at-risk': '·' }[state]
  return `<div style="display: flex; gap: 13px;">
    <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; border: 1.5px solid ${tone}; color: ${tone}; font: 500 10px/1 ${MONO};">${glyph}</span>
      ${last ? '' : `<span style="width: ${critical ? 3 : 1.5}px; flex: 1; min-height: 22px; background: ${critical ? 'var(--fx-border-strong)' : 'var(--fx-border-subtle)'};"></span>`}
    </div>
    <div style="display: flex; flex-direction: column; gap: 3px; padding-bottom: ${last ? '0' : '14px'}; flex: 1; min-width: 0;">
      <div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;">
        <span style="font: 600 13.5px/1.3 ${SANS};">${name}</span>
        ${critical ? badge('neutral', 'critical path') : ''}
      </div>
      <div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;">
        <span style="font: 400 12px/1.4 ${MONO}; color: var(--fx-text-tertiary);">planned ${planned}</span>
        <span style="font: 400 12px/1.4 ${MONO}; color: ${actual ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)'};">${actual ? `actual ${actual}` : 'not yet'}</span>
        <span style="font: 400 12px/1.4 ${SANS}; color: var(--fx-text-tertiary);">${owner}</span>
      </div>
    </div>
  </div>`
}

const timeline = (rows = MILESTONES) =>
  `<div style="display: flex; flex-direction: column;">${rows.map((m, i) => milestone(m, i === rows.length - 1)).join('')}</div>`

const orderDrawer = ({ tab = 0, footer, tabsOverride } = {}) => drawer({
  width: 720, height: 900, status: 'late', critical: true,
  code: 'PO-BF-2044', who: 'H&M · ST-2610', statusText: 'in production · 4 days late',
  figure: { label: 'Ordered', value: '42,000', unit: 'pcs', basis: '3 colours × 6 sizes · $4.85 FOB · ex-factory 18 Dec 2026', tone: 'var(--fx-text-primary)' },
  tabs: tabsOverride ?? ['TNA', 'Breakdown', 'LC', 'Files', 'History'], active: tab,
  body: tab === 0
    ? `<div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 12px 14px; font: 400 13px/1.6 ${SANS}; text-wrap: pretty;">
         <strong style="font-weight: 600;">LC-BF-7781’s latest shipment is 21 Dec.</strong> Ex-factory is 18 Dec and slipping — three days of margin left. Commercial raises the amendment; you raise the ask.
       </div>${timeline(MILESTONES.slice(2, 8))}`
    : '',
  gate: `${gateChip('fail', 'PP approval — 11 days out')}${gateChip('pass', 'fabric in-house 28 Nov')}${gateChip('warn', 'LC latest shipment 21 Dec')}`,
  footer,
})

emit('OrderDrawer.dc.html', board({
  w: 900, h: 1060, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `${caption('drawer · record · an order (720 — the body is a grid and a timeline)')}
  ${orderDrawer({ footer: `${btn('ghost', 'Ask commercial for an amendment')}${btn('secondary', 'Open full page')}${btn('primary', 'Actualize PP approved')}` })}
  ${note('The footer’s amber is the milestone the state machine expects next — here “PP approved”, because every other date on this order is waiting behind it. “Open full page” is the second click the contract allows: an order is one of the three records too big for a drawer, and the drawer is still where a merchandiser starts.')}`,
}))

emit('OrderTna.dc.html', desk({
  h: 1800, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'H&M · ST-2610', title: 'PO-BF-2044', meta: '42,000 pcs · $203,700 · ex-factory 18 Dec 2026', ownsAmber: false })}

  <!-- setOrderStatus — the order's own machine, at the top of the record it governs -->
  <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; gap: 8px;">
      ${eyebrow('Status')}
      <span style="display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 999px; border: 1px solid var(--fx-border-strong); background: var(--fx-bg-sunken); font: 500 12.5px/1 ${MONO};"><span style="color: var(--fx-info);">●</span>in production</span>
    </span>
    <span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary);">from here the machine allows three moves, and only three:</span>
    <span style="display: flex; gap: 8px; flex-wrap: wrap;">
      ${btn('secondary', 'Shipped in part', { size: 'sm' })}${btn('secondary', 'Shipped in full', { size: 'sm' })}${btn('ghost', 'Cancel the order', { size: 'sm' })}
    </span>
    <span style="width: 100%; font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
      Closing comes after shipping, never instead of it — an order goes shipped in part or in full first, and only a shipped order can close. Cancelling is the one move with no way back, so it goes through a confirm that names what is already cut.
    </span>
  </div>

  <div style="display: flex; gap: 4px; border-bottom: 1px solid var(--fx-border-subtle); margin-bottom: 24px;">
    ${['TNA', 'Breakdown', 'LC', 'Dossier', 'Files', 'History'].map((t, i) => `<span style="padding: 13px 14px; font: ${i === 0 ? '600' : '500'} 14px/1 ${SANS}; color: var(--fx-text-${i === 0 ? 'primary' : 'tertiary'}); border-bottom: 2px solid ${i === 0 ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${t}</span>`).join('')}
  </div>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 480px; gap: 34px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${sectionHeading('Time and action', '10 milestones · 6 on the critical path')}
      ${card(`<div style="padding: 20px 24px;">${timeline()}</div>`)}
      ${note('The critical path is a thicker connector, not a colour — colour is already carrying milestone state, and a second meaning on the same channel is how a timeline becomes unreadable at a glance.')}
    </div>

    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${caption('actualizing a date — the ripple comes first')}
      <div style="border: 1px solid var(--fx-accent); border-radius: 8px; background: var(--fx-bg-surface); padding: 20px 22px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font: 600 15px/1.3 ${SANS};">Fabric in-house</span>
          <span style="font: 400 13px/1.55 ${SANS}; color: var(--fx-text-secondary);">planned 26 Nov · you are recording it as <strong style="font-weight: 600;">30 Nov</strong></span>
        </div>
        <div style="border-top: 1px solid var(--fx-border-subtle); padding-top: 14px; display: flex; flex-direction: column; gap: 10px;">
          ${eyebrow('What this moves')}
          ${[['Cutting start', '1 Dec', '5 Dec', 4, true], ['Sewing start', '4 Dec', '8 Dec', 4, true], ['Finishing complete', '14 Dec', '16 Dec', 2, false], ['Ex-factory', '18 Dec', '20 Dec', 2, true]]
            .map(([n, from, to, days, crit]) => `<div style="display: flex; align-items: baseline; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--fx-border-subtle);">
              <span style="flex: 1; min-width: 0; font: 400 13px/1.4 ${SANS};">${n}${crit ? ` ${badge('neutral', 'critical')}` : ''}</span>
              <span style="font: 400 12px/1.3 ${MONO}; color: var(--fx-text-tertiary);">${from} → ${to}</span>
              <span data-numeric style="font: 500 12.5px/1.3 ${MONO}; color: var(--fx-danger);">+${days}d</span>
            </div>`).join('')}
        </div>
        <div style="border: 1px solid var(--fx-danger); border-radius: 8px; padding: 12px 14px; font: 400 13px/1.6 ${SANS}; text-wrap: pretty;">
          <strong style="font-weight: 600;">Ex-factory moves to 20 Dec.</strong> LC-BF-7781’s latest shipment is 21 Dec — one day of margin, down from three. Two days of declared slack absorbed the rest.
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">${btn('ghost', 'Cancel')}${btn('primary', 'Record it and move the dates')}</div>
      </div>
      ${note('The preview and the write run the same computation, so they cannot disagree about what happens. A merchandiser is entitled to see the ship date move BEFORE they commit the slip, not after — this dialog is the whole reason previewMilestoneRipple exists as a separate action.')}
      ${card(`<div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;">
        ${eyebrow('A fresh order has no timeline yet')}
        <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">Generate one from the ex-factory date backwards, using this buyer’s lead times. Every date is editable afterwards; the generator is a starting point, not a contract.</span>
        ${btn('secondary', 'Generate the TNA')}
      </div>`)}
    </div>
  </div>`,
}))

/* ── 10–13 · Breakdown, LC, Dossier, Files & History, inputs grid ────────── */

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL']
const REV1 = [['Black', [980, 2340, 3120, 2860, 1420, 480]], ['Ecru', [720, 1980, 2640, 2410, 1180, 390]], ['Deep navy', [860, 2210, 2950, 2700, 1330, 430]]]
const REV2 = [['Black', [980, 2340, 3120, 2860, 1420, 480]], ['Ecru', [720, 1980, 2640, 2410, 1180, 390]], ['Deep navy', [860, 2210, 2950, 4700, 1330, 430]]]

const grid = (rows, diffAgainst) => {
  const cols = SIZES.map((_, i) => rows.reduce((n, [, r]) => n + r[i], 0))
  const grand = cols.reduce((a, b) => a + b, 0)
  const cell = (v, { head = false, total = false, delta = 0 } = {}) =>
    `<div style="padding: 9px 10px; text-align: ${head ? 'left' : 'right'}; border-bottom: 1px solid var(--fx-border-subtle); background: ${delta ? 'var(--fx-accent-subtle)' : 'transparent'}; font: ${total ? '600' : head ? '500' : '400'} 13px/1.3 ${head ? SANS : MONO}; color: var(--fx-text-${total || head ? 'primary' : 'secondary'});">
      ${typeof v === 'number' ? v.toLocaleString('en-US') : v}${delta ? `<div style="font: 500 11px/1.3 ${MONO}; color: var(--fx-accent-on);">+${delta.toLocaleString('en-US')}</div>` : ''}</div>`
  return `<div style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; overflow: hidden; background: var(--fx-bg-surface);">
    <div style="display: grid; grid-template-columns: 116px repeat(6, minmax(0, 1fr)) 84px;">
      <div style="padding: 9px 10px; border-bottom: 1px solid var(--fx-border-default);">${eyebrow('Colour')}</div>
      ${SIZES.map((s) => `<div style="padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--fx-border-default);">${eyebrow(s)}</div>`).join('')}
      <div style="padding: 9px 10px; text-align: right; border-bottom: 1px solid var(--fx-border-default);">${eyebrow('Total')}</div>
      ${rows.map(([name, r], ri) => `${cell(name, { head: true })}${r.map((v, ci) => {
        const was = diffAgainst?.[ri]?.[1]?.[ci]
        return cell(v, { delta: was !== undefined && was !== v ? v - was : 0 })
      }).join('')}${cell(r.reduce((a, b) => a + b, 0), { total: true })}`).join('')}
      ${cell('All colours', { head: true })}${cols.map((v) => cell(v, { total: true })).join('')}${cell(grand, { total: true })}
    </div></div>`
}

emit('OrderBreakdown.dc.html', desk({
  h: 1240, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'H&M · ST-2610', title: 'PO-BF-2044', meta: 'Rev 2 · proposed 1 Dec', ownsAmber: false })}
  <div style="display: flex; gap: 4px; border-bottom: 1px solid var(--fx-border-subtle); margin-bottom: 24px;">
    ${['TNA', 'Breakdown', 'LC', 'Dossier', 'Files', 'History'].map((t, i) => `<span style="padding: 13px 14px; font: ${i === 1 ? '600' : '500'} 14px/1 ${SANS}; color: var(--fx-text-${i === 1 ? 'primary' : 'tertiary'}); border-bottom: 2px solid ${i === 1 ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${t}</span>`).join('')}
  </div>
  <div style="display: flex; flex-direction: column; gap: 24px;">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      ${['Rev 1 · 4 Nov', 'Rev 2 · 1 Dec'].map((r, i) => `<span style="display: inline-flex; align-items: center; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-border-${i === 1 ? 'default' : 'subtle'}); background: ${i === 1 ? 'var(--fx-bg-selected)' : 'transparent'}; font: 500 12.5px/1 ${SANS};">${r}</span>`).join('')}
      <span style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-accent); background: var(--fx-accent-subtle); font: 500 12.5px/1 ${SANS}; color: var(--fx-accent-on);">Showing what changed</span>
      <span style="margin-left: auto; display: flex; gap: 10px;">${btn('ghost', 'Export for the meeting')}${btn('secondary', 'Save the breakdown')}${btn('primary', 'Propose a revision')}</span>
    </div>
    ${grid(REV2, REV1)}
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">
      ${figureTile({ label: 'Breakdown total', value: '44,000', unit: 'pcs', basis: 'Rev 2 · was 42,000 on Rev 1', asOf: '1 Dec, 16:20', tone: 'var(--fx-warning)' })}
      ${figureTile({ label: 'Order header', value: '42,000', unit: 'pcs', basis: 'not yet revised — the header and the grid disagree', asOf: 'just now', tone: 'var(--fx-danger)' })}
      ${figureTile({ label: 'Tolerance', value: '±3', unit: '%', basis: 'agreed with H&M on the PO · ±1,260 pcs per colour', asOf: '4 Nov' })}
    </div>
    <div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 16px 18px; display: flex; gap: 14px; align-items: flex-start;">
      ${mark(24, LIGHT, { state: 'blocked' })}
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <span style="font: 600 14.5px/1.35 ${SANS};">The grid says 44,000 and the order says 42,000</span>
        <span style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">Deep navy / L is up 2,000. A revision changes both together — saving the grid alone would leave the fabric booking, the costing and the LC value computed against a quantity nobody ordered.</span>
      </div>
    </div>
    ${note('The diff overlay is the accent on the cells that moved, plus the delta under the new number. Rev 1 stays selectable rather than being overwritten: “what did we agree in November” is a question a buyer asks in January.')}
  </div>`,
}))

emit('OrderLc.dc.html', desk({
  h: 1200, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'H&M · ST-2610', title: 'PO-BF-2044', meta: 'LC-BF-7781 · Bestseller A/S issuing', ownsAmber: false })}
  <div style="display: flex; gap: 4px; border-bottom: 1px solid var(--fx-border-subtle); margin-bottom: 24px;">
    ${['TNA', 'Breakdown', 'LC', 'Dossier', 'Files', 'History'].map((t, i) => `<span style="padding: 13px 14px; font: ${i === 2 ? '600' : '500'} 14px/1 ${SANS}; color: var(--fx-text-${i === 2 ? 'primary' : 'tertiary'}); border-bottom: 2px solid ${i === 2 ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${t}</span>`).join('')}
  </div>
  <div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 18px 20px; display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px;">
    ${mark(24, LIGHT, { state: 'blocked' })}
    <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
      <span style="font: 600 15px/1.35 ${SANS};">The LC expires before this order can ship</span>
      <span style="font: 400 13.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">Latest shipment on LC-BF-7781 is <strong style="font-weight: 600;">21 Dec</strong>. Ex-factory is 18 Dec and has already slipped four days; another slip of three and the shipment cannot be presented under this credit at all. Commercial raises the amendment — you raise the ask, with the new date.</span>
      <div style="display: flex; gap: 10px; margin-top: 6px;">${btn('secondary', 'Ask commercial for an amendment')}${btn('ghost', 'Open the LC register')}</div>
    </div>
  </div>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start;">
    ${card(`<div style="padding: 20px 24px;">
      ${eyebrow('Master credit')}
      <div style="height: 12px;"></div>
      ${fact('Number', 'LC-BF-7781')}
      ${fact('Value', '$486,200')}
      ${fact('Latest shipment', '<span style="color: var(--fx-danger);">21 Dec 2026</span>')}
      ${fact('Expiry', '11 Jan 2027')}
      ${fact('Tolerance', '±5% quantity and value')}
      ${fact('This order draws', '$203,700 — 42% of the credit')}
    </div>`)}
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${card(`<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 12px;">
        ${eyebrow('Back-to-back headroom')}
        <div style="display: flex; gap: 5px; height: 20px; align-items: center;">
          ${Array.from({ length: 30 }, (_, i) => `<span style="width: 2px; height: 16px; flex-shrink: 0; transform: skewX(-34deg); background: ${i < 26 ? 'var(--fx-border-strong)' : 'var(--fx-success)'};"></span>`).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; font: 400 12px/1 ${MONO}; color: var(--fx-text-tertiary);">
          <span>$364,650 committed to BTBs</span><span data-numeric>12% headroom</span>
        </div>
        <span style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">The policy limit is 75% of the master. An import PO past it is refused at the service — procurement meets that block, not you, but it is your fabric that does not arrive.</span>
      </div>`)}
      ${card(`<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 10px;">
        ${eyebrow('Documents the bank will want')}
        ${[['Commercial invoice', 'ready'], ['Packing list', 'not yet — shipment not packed'], ['Bill of lading', 'not yet'], ['EXP number', 'not yet — commercial files it'], ['Certificate of origin', 'ready'], ['Inspection certificate', 'not yet — final not passed']]
          .map(([d, s]) => `<div style="display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--fx-border-subtle);">
            <span style="width: 15px; height: 15px; border-radius: 4px; border: 1px solid var(--fx-border-${s === 'ready' ? 'strong' : 'default'}); background: ${s === 'ready' ? 'var(--fx-text-primary)' : 'transparent'}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">${s === 'ready' ? '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.6 2.6L10 3" stroke="var(--fx-text-inverse)" stroke-width="1.8"/></svg>' : ''}</span>
            <span style="flex: 1; font: 400 13px/1.4 ${SANS};">${d}</span>
            <span style="font: 400 12px/1.3 ${SANS}; color: var(--fx-text-tertiary);">${s}</span>
          </div>`).join('')}
      </div>`)}
    </div>
  </div>
  ${note('The same conflict sentence appears on the book row (the red LC chip), in the order drawer, and here — identical words in all three. A merchandiser who reads three different phrasings of one problem counts three problems.')}`,
}))

const tabStrip = (active) => `<div style="display: flex; gap: 4px; border-bottom: 1px solid var(--fx-border-subtle); margin-bottom: 24px;">
    ${['TNA', 'Breakdown', 'LC', 'Dossier', 'Files', 'History'].map((t, i) => `<span style="padding: 13px 14px; font: ${i === active ? '600' : '500'} 14px/1 ${SANS}; color: var(--fx-text-${i === active ? 'primary' : 'tertiary'}); border-bottom: 2px solid ${i === active ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${t}</span>`).join('')}
  </div>`

const dossierSection = (title, action, blurb, inner, cta) =>
  `<div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 14px;">
      ${slashes(LIGHT, { accent: true, h: 14 })}
      <h3 style="font: 600 18px/1.2 ${SANS}; margin: 0;">${title}</h3>
      <span style="margin-left: auto; font: 400 11.5px/1 ${MONO}; color: var(--fx-text-tertiary);">${action}</span>
    </div>
    <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 82ch; text-wrap: pretty;">${blurb}</span>
    ${card(`<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;">${inner}
      <div style="display: flex; justify-content: flex-end;">${cta}</div>
    </div>`)}
  </div>`

emit('OrderDossier.dc.html', desk({
  h: 2000, active: 'orders',
  inner: `${pageHeader({ eyebrow: 'H&M · ST-2610', title: 'PO-BF-2044', meta: 'the dossier — four sections, four saves', ownsAmber: false })}
  ${tabStrip(3)}
  <div style="display: flex; flex-direction: column; gap: 32px;">
    ${dossierSection('Fabric leg', 'setOrderFabricLeg',
      'Which fabric, from whom, on what terms, and when it lands. The store’s receipt and the cutting plan both read this, so a wrong leg is a wrong lay two weeks later.',
      `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px;">
        ${fact('Fabric', '40s poplin, 58 inch · 12,400 m')}
        ${fact('Supplier', 'Shanghai Textile Co. · China')}
        ${fact('Terms', 'BTB against LC-BF-7781')}
        ${fact('Promised', '24 Nov 2026 — 9 days late')}
        ${fact('Landed', '12,180 m on 28 Nov — 220 m short')}
        ${fact('Bonded', 'yes · UD-2026-118')}
      </div>`, btn('secondary', 'Save the fabric leg'))}

    ${dossierSection('Drops', 'saveOrderDrops',
      'A buyer who takes 42,000 pieces in three shipments has three ex-factory dates, three packing lists and three presentations. The TNA plans against the LAST one; the shipment board works to each.',
      `${[['Drop 1', '14,000 pcs', '18 Dec 2026', 'Black and Ecru'], ['Drop 2', '14,000 pcs', '4 Jan 2027', 'Deep navy'], ['Drop 3', '14,000 pcs', '18 Jan 2027', 'mixed — to be confirmed']]
        .map(([n, q, d, w]) => `<div style="display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--fx-border-subtle);">
          <span style="width: 74px; font: 600 13.5px/1.3 ${SANS};">${n}</span>
          <span data-numeric style="width: 96px; font: 400 13px/1.3 ${MONO};">${q}</span>
          <span data-numeric style="width: 110px; font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary);">${d}</span>
          <span style="flex: 1; font: 400 13px/1.4 ${SANS}; color: var(--fx-text-tertiary);">${w}</span>
        </div>`).join('')}`, btn('secondary', 'Save the drops'))}

    ${dossierSection('Colour approval', 'setOrderColourApproval',
      'Lab dips and bulk swatches, per colour. Cutting a colour the buyer has not approved is the expensive kind of mistake — the fabric is cut and the shade is wrong.',
      `${[['Black', 'approved', '18 Nov 2026', 'on-track'], ['Ecru', 'approved', '18 Nov 2026', 'on-track'], ['Deep navy', 'submitted — waiting', '26 Nov 2026', 'at-risk']]
        .map(([c, s, d, tone]) => `<div style="display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--fx-border-subtle);">
          <span style="width: 110px; font: 500 13.5px/1.3 ${SANS};">${c}</span>
          <span style="flex: 1;">${statusLabel(tone, s)}</span>
          <span data-numeric style="font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-tertiary);">${d}</span>
        </div>`).join('')}`, btn('secondary', 'Save colour approvals'))}

    ${dossierSection('Ship date', 'recordOrderShipDate',
      'What actually left, and when. Distinct from the ex-factory milestone: the milestone is the plan, this is the fact the on-time figure is computed from.',
      `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px;">
        ${fact('Planned ex-factory', '18 Dec 2026')}
        ${fact('Actually left', '<span style="color: var(--fx-text-tertiary);">not yet</span>')}
      </div>`, btn('secondary', 'Record the ship date'))}

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: start;">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${caption('Files')}
        ${card(`
          ${row({ status: 'done', code: 'PO', text: 'H&M purchase order — PO-BF-2044.pdf', sub: 'dropped 4 Nov · read into the order, 14 fields' })}
          ${row({ status: 'done', code: 'TECH', text: 'Tech pack ST-2610.pdf', sub: 'dropped 8 Nov · 23 measurements read, 3 corrected' })}
          ${row({ status: 'done', code: 'LC', text: 'LC-BF-7781 advice.pdf', sub: 'from the bank, 12 Nov' })}
          ${row({ status: 'at-risk', code: 'AMD', text: 'Amendment advice — not received', sub: 'commercial raised the request 2 Dec' })}
        `)}
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${caption('History')}
        ${card(`
          ${row({ status: 'done', code: '1 Dec 16:20', text: 'Rashida Akter proposed Rev 2 — Deep navy / L up 2,000' })}
          ${row({ status: 'done', code: '28 Nov 09:12', text: 'Store recorded fabric in-house, two days late' })}
          ${row({ status: 'done', code: '21 Nov 14:40', text: 'Sampling dispatched the PP sample to H&M, AWB 176-44219308' })}
          ${row({ status: 'done', code: '4 Nov 11:02', text: 'Rashida Akter booked the order from H&M’s purchase order' })}
        `)}
      </div>
    </div>
  </div>
  ${note('Four sections, four saves — never one “Save the dossier”. Each of these is read by a different desk at a different moment, and a single save button means a merchandiser correcting a drop date also re-writes a colour approval somebody else entered while they had the page open.')}`,
}))

/* ── 13 · /orders/inputs ─────────────────────────────────────────────────── */

const INPUT_STATES = { ready: ['var(--fx-success)', '✓', 'in house'], ordered: ['var(--fx-info)', '·', 'ordered'], late: ['var(--fx-danger)', '✕', 'late'], none: ['var(--fx-text-tertiary)', '–', 'not ordered'], part: ['var(--fx-warning)', '!', 'part'] }

const inputCell = (state, sel = false) => {
  const [tone, glyph, label] = INPUT_STATES[state]
  return `<div style="padding: 10px; border-bottom: 1px solid var(--fx-border-subtle); border-left: 1px solid var(--fx-border-subtle); background: ${sel ? 'var(--fx-bg-selected)' : 'transparent'}; display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 56px; justify-content: center;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; border: 1.5px solid ${tone}; color: ${tone}; font: 500 10px/1 ${MONO};">${glyph}</span>
    <span style="font: 400 10.5px/1 ${MONO}; color: var(--fx-text-tertiary);">${label}</span>
  </div>`
}

emit('OrdersInputs.dc.html', board({
  w: 1560, h: 1080, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('/orders/inputs — the readiness matrix')}
    <h1 style="font: 700 30px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">What is not in the building yet</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      Orders down, inputs across. One screen answers the question a merchandiser is asked in every morning meeting — “can we cut Monday?” — and it answers it per order rather than per requisition.
    </div>
  </div>
  <div style="display: flex; gap: 34px; align-items: flex-start;">
    <div style="flex: 1; min-width: 0;">
      ${card(`<div style="display: grid; grid-template-columns: 200px repeat(4, minmax(0, 1fr)) 118px;">
        <div style="padding: 10px 12px; border-bottom: 1px solid var(--fx-border-default);">${eyebrow('Order')}</div>
        ${['Fabric', 'Trims', 'Labels', 'Packaging'].map((h) => `<div style="padding: 10px; border-bottom: 1px solid var(--fx-border-default); border-left: 1px solid var(--fx-border-subtle); text-align: center;">${eyebrow(h)}</div>`).join('')}
        <div style="padding: 10px 12px; border-bottom: 1px solid var(--fx-border-default); border-left: 1px solid var(--fx-border-subtle);">${eyebrow('Cut on')}</div>
        ${[['PO-BF-2044', 'H&M · ST-2610', ['part', 'ready', 'ready', 'none'], '1 Dec — held'],
           ['PO-BF-2041', 'Primark · ST-2588', ['ready', 'ready', 'ready', 'ready'], 'cut'],
           ['PO-BF-2039', 'Bestseller · ST-2571', ['ready', 'ready', 'ordered', 'ordered'], '4 Dec'],
           ['PO-BF-2036', 'C&A · ST-2544', ['ready', 'late', 'ordered', 'none'], '8 Dec'],
           ['PO-BF-2047', 'H&M · ST-2661', ['none', 'none', 'none', 'none'], 'not planned']]
          .map(([po, who, cells, cut], ri) => `<div style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; flex-direction: column; gap: 3px;">
            ${mono(po, { size: 12 })}<span style="font: 400 12px/1.3 ${SANS}; color: var(--fx-text-tertiary);">${who}</span></div>
          ${cells.map((c, ci) => inputCell(c, ri === 0 && ci === 0)).join('')}
          <div style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); border-left: 1px solid var(--fx-border-subtle); font: 400 12.5px/1.3 ${MONO}; color: var(--fx-text-${cut === 'cut' ? 'tertiary' : 'primary'}); display: flex; align-items: center;">${cut}</div>`).join('')}
      </div>`)}
      ${note('Five states, and “part” is the one that earns its place: 12,180 m of 12,400 arrived, which is neither in-house nor missing. A binary matrix would have shown this order as ready and sent a cutting table 220 m short.')}
    </div>
    <div style="width: 560px; flex-shrink: 0;">
      ${caption('a cell opens the input, not the order')}
      ${drawer({
        width: 560, height: 720, status: 'at-risk',
        code: 'PO-BF-2044 · fabric', who: '40s poplin, 58 inch', statusText: 'part received',
        figure: { label: 'Short by', value: '220', unit: 'm', basis: '12,180 m of 12,400 arrived on 28 Nov · the lay needs 12,300', tone: 'var(--fx-warning)' },
        tabs: ['This input', 'History'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Ordered on', 'PO-IMP-0311 · Shanghai Textile')}
          ${fact('Promised', '24 Nov 2026')}
          ${fact('Received', '28 Nov 2026 · GRN-2291')}
          ${fact('Requisition', 'REQ-0783 for the 900 m shortfall')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Where it came from')}
          ${linkRow('PO-IMP-0311', 'the purchase order', 'opens procurement with this row already open')}
          ${linkRow('GRN-2291', 'the goods receipt', 'store · 26 rolls, one quarantined')}
        </div>`,
        footer: `${btn('ghost', 'Chase procurement')}${btn('primary', 'Set this cell’s state')}`,
      })}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   14–18 · /sampling — the board, the drawer, the machine
   ══════════════════════════════════════════════════════════════════════════ */

const STAGES = ['requested', 'in_work', 'dispatched', 'feedback', 'approved', 'rejected']

const sampleCard = ({ code, style, buyer, kind, note: n, status, gates }) =>
  `<div class="fx-selvage" data-status="${status}" ${gates ? 'data-critical="true"' : ''} style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); overflow: hidden;">
    <div style="flex: 1; min-width: 0; padding: 11px 13px; display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">${mono(code, { size: 12 })}${badge('neutral', kind)}</div>
      <span style="font: 500 13px/1.35 ${SANS};">${style} · ${buyer}</span>
      <span style="font: 400 12px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${n}</span>
      ${gates ? `<span style="display: inline-flex; align-items: center; gap: 6px; font: 500 11px/1.3 ${MONO}; color: var(--fx-danger);"><span style="width: 2px; height: 11px; transform: skewX(-34deg); background: var(--fx-danger);"></span>gates cutting</span>` : ''}
    </div>
  </div>`

emit('Sampling.dc.html', desk({
  h: 1100, active: 'sampling',
  inner: `${pageHeader({ eyebrow: 'The room', title: 'Sampling room', meta: '9 live · 1 gating a cut', ownsAmber: false,
    actions: btn('primary', 'Raise a sample request') })}
  <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; align-items: start;">
    ${[['requested', 1], ['in work', 3], ['dispatched', 2], ['feedback', 1], ['approved', 1], ['rejected', 1]].map(([s, n]) => `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: baseline; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--fx-border-default);">
          <span style="font: 600 13px/1.3 ${SANS};">${s}</span><span data-numeric style="font: 400 12px/1 ${MONO}; color: var(--fx-text-tertiary);">${n}</span>
        </div>
        ${{
          'requested': sampleCard({ code: 'SMP-0424', style: 'ST-2661', buyer: 'H&M', kind: 'proto', note: 'raised today from the new order', status: 'on-track' }),
          'in work': [sampleCard({ code: 'SMP-0421', style: 'ST-2588', buyer: 'Primark', kind: 'shipment', note: 'sewn, waiting on the courier — Primark asked for 5 Dec', status: 'at-risk' }),
                      sampleCard({ code: 'SMP-0423', style: 'ST-2571', buyer: 'Bestseller', kind: 'fit', note: 'second round after the January comments', status: 'on-track' }),
                      sampleCard({ code: 'SMP-0425', style: 'ST-2544', buyer: 'C&A', kind: 'size set', note: 'cutting the size set today', status: 'on-track' })].join(''),
          'dispatched': [sampleCard({ code: 'SMP-0412', style: 'ST-2610', buyer: 'H&M', kind: 'PP', note: 'AWB 176-44219308 · 11 days with the buyer, chased twice', status: 'late', gates: true }),
                         sampleCard({ code: 'SMP-0418', style: 'ST-2544', buyer: 'C&A', kind: 'fit', note: 'AWB 176-44221140 · first round', status: 'at-risk' })].join(''),
          'feedback': sampleCard({ code: 'SMP-0409', style: 'ST-2510', buyer: 'H&M', kind: 'PP', note: 'approved with comments — sleeve length, round two', status: 'at-risk' }),
          'approved': sampleCard({ code: 'SMP-0402', style: 'ST-2588', buyer: 'Primark', kind: 'PP', note: 'approved 18 Nov — this is what let cutting start', status: 'done' }),
          'rejected': sampleCard({ code: 'SMP-0398', style: 'ST-2544', buyer: 'C&A', kind: 'proto', note: 'rejected on fabric hand — re-make in the correct GSM', status: 'late' }),
        }[s]}
      </div>`).join('')}
  </div>
  ${note('One card carries a second mark: “gates cutting”. It is the only sample on this board whose verdict stops a floor, and until now the room had no way to say so — the audit found that a merchandiser goes via the order desk to learn which sample is holding a lay.')}`,
}))

emit('SampleDrawer.dc.html', board({
  w: 1300, h: 1160, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · record — a sample')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; margin-top: 10px; text-wrap: pretty;">
      The audit’s friction, closed: the drawer names the TNA milestone this sample gates and links to it. A PP verdict is the highest-consequence write in the module — three words on a buyer’s comment sheet that are a floor apart in meaning — so the verdict control says what each one does before it is pressed.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('the sample that gates a cut')}
      ${drawer({
        width: 560, height: 960, status: 'late', critical: true,
        code: 'SMP-0412', who: 'ST-2610 · H&M · PP sample', statusText: 'dispatched · 11 days',
        figure: { label: 'Waiting on the buyer', value: '11', unit: 'days', basis: 'dispatched 21 Nov · chased 25 Nov and 1 Dec · cutting cannot start until this comes back', tone: 'var(--fx-danger)' },
        tabs: ['This sample', 'Requisition', 'History'], active: 0,
        body: `<div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font: 600 13.5px/1.35 ${SANS};">This verdict is what flips cutting</span>
          <span style="font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">The PP gate is defined here and enforced on the cutting floor. Until a verdict is recorded, a lay for ST-2610 is refused at the service — Rafiq Islam has met that refusal three times.</span>
          ${linkRow('PO-BF-2044', 'the milestone this gates: “PP approved”', 'planned 28 Nov · opens the order’s TNA with this milestone focused')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Kind', 'PP — pre-production')}
          ${fact('Dispatched', '21 Nov 2026 · DHL 176-44219308')}
          ${fact('Round', '1 of however many it takes')}
          ${fact('Cost so far', '৳4,820 · fabric, trims, one operator-day')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Record the buyer’s verdict')}
          ${[['Approved', 'cutting is released the moment this is saved', 'var(--fx-success)'],
             ['Approved with comments', 'cutting is released; the comments go to the room as round two', 'var(--fx-warning)'],
             ['Rejected', 'cutting stays blocked and the sample goes back to in work', 'var(--fx-danger)']]
            .map(([v, what, tone]) => `<div style="display: flex; gap: 11px; align-items: flex-start; padding: 11px 13px; border: 1px solid var(--fx-border-subtle); border-radius: 8px;">
              <span style="width: 15px; height: 15px; border-radius: 999px; border: 1px solid ${tone}; flex-shrink: 0; margin-top: 2px;"></span>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <span style="font: 500 13.5px/1.3 ${SANS};">${v}</span>
                <span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">${what}</span>
              </div></div>`).join('')}
        </div>`,
        gate: `${gateChip('fail', 'PP approval — no verdict')}${gateChip('pass', 'dispatched 21 Nov')}`,
        footer: `${btn('ghost', 'Add a cost')}${btn('secondary', 'Close the sample')}${btn('primary', 'Record the verdict')}`,
      })}
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${caption('earlier in its life — the stage mover and dispatch')}
      ${drawer({
        width: 560, height: 960, status: 'at-risk',
        code: 'SMP-0421', who: 'ST-2588 · Primark · shipment sample', statusText: 'in work',
        figure: { label: 'Buyer wants it by', value: '5 Dec', basis: 'sewn today · not yet couriered · 3 days left', tone: 'var(--fx-warning)' },
        tabs: ['This sample', 'Requisition', 'History'], active: 0,
        body: `<div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Move it on')}
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${['requested', 'in work', 'dispatched', 'feedback'].map((s, i) => `<span style="display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; min-height: 36px; border-radius: 999px; border: 1px solid var(--fx-border-${i === 1 ? 'strong' : i === 2 ? 'default' : 'subtle'}); background: ${i === 1 ? 'var(--fx-bg-sunken)' : 'transparent'}; font: 500 12.5px/1 ${SANS}; color: var(--fx-text-${i <= 2 ? 'primary' : 'disabled'});">${i === 1 ? '<span style="color: var(--fx-success);">●</span>' : ''}${s}</span>`).join('')}
          </div>
          <span style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">Only the moves the machine allows are offered. From <strong style="font-weight: 600;">in work</strong> that is dispatched or closed — feedback is greyed because a sample nobody has sent cannot have come back.</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px;">
          ${eyebrow('Dispatch')}
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;"><span style="font: 400 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">Courier</span><div style="min-height: 40px; padding: 10px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; font: 400 14px/1.3 ${SANS};">DHL</div></div>
            <div style="display: flex; flex-direction: column; gap: 6px;"><span style="font: 400 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">AWB</span><div style="min-height: 40px; padding: 10px 12px; border: 1px solid var(--fx-border-default); border-radius: 4px; font: 400 14px/1.3 ${MONO}; color: var(--fx-text-tertiary);">176-…</div></div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${fact('Requested by', 'Primark, on the order')}
          ${fact('Raised', '28 Nov 2026 by Rashida Akter')}
          ${fact('Cost so far', '৳2,140')}
        </div>`,
        footer: `${btn('ghost', 'Add a cost')}${btn('secondary', 'Close the sample')}${btn('primary', 'Mark dispatched')}`,
      })}
    </div>
  </div>`,
}))

emit('SampleFull.dc.html', desk({
  h: 1320, active: 'sampling',
  inner: `${pageHeader({ eyebrow: 'ST-2610 · H&M · PP sample', title: 'SMP-0412', meta: 'dispatched 21 Nov · 11 days with the buyer', ownsAmber: false })}
  <div style="display: flex; gap: 4px; border-bottom: 1px solid var(--fx-border-subtle); margin-bottom: 24px;">
    ${['Requisition', 'Rounds', 'Costs', 'History'].map((t, i) => `<span style="padding: 13px 14px; font: ${i === 0 ? '600' : '500'} 14px/1 ${SANS}; color: var(--fx-text-${i === 0 ? 'primary' : 'tertiary'}); border-bottom: 2px solid ${i === 0 ? 'var(--fx-text-primary)' : 'transparent'}; margin-bottom: -1px;">${t}</span>`).join('')}
  </div>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 32px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${sectionHeading('What the room drew for this sample', 'saveSampleRequisition · markRequisitionUsage')}
      ${card(`<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr) 100px 100px 108px;">
        ${['Item', 'Description', 'Asked', 'Issued', 'Used'].map((h) => `<div style="padding: 10px 12px; border-bottom: 1px solid var(--fx-border-default);">${eyebrow(h)}</div>`).join('')}
        ${[['FAB-40P', '40s poplin, 58 inch · shade B', '12 m', '12 m', '9.4 m'],
           ['TRM-BTN', 'Button, 4-hole 18L', '60 pc', '60 pc', '48 pc'],
           ['TRM-ZIP', 'Zip, 18 cm, navy', '12 pc', '12 pc', '10 pc'],
           ['LBL-MAIN', 'Main label, woven', '12 pc', '12 pc', '12 pc']]
          .map(([code, desc, asked, issued, used]) => `
          <div style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle);">${mono(code, { size: 12 })}</div>
          <div style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); font: 400 13px/1.4 ${SANS};">${desc}</div>
          <div data-numeric style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary); text-align: right;">${asked}</div>
          <div data-numeric style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); font: 400 13px/1.3 ${MONO}; text-align: right;">${issued}</div>
          <div data-numeric style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); font: 400 13px/1.3 ${MONO}; text-align: right;">${used}</div>`).join('')}
      </div>`)}
      <div style="display: flex; gap: 10px; justify-content: flex-end;">${btn('secondary', 'Save the requisition')}${btn('primary', 'Record what was used')}</div>
      ${note('Asked, issued and used are three different numbers and the gap between the last two is the sample room’s real cost. Recording usage is what turns “we made a sample” into a per-style cost the costing studio can read.')}
    </div>
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${caption('rounds')}
      ${card(`
        ${row({ status: 'late', code: 'Round 1', text: 'sent 21 Nov — no verdict yet', sub: 'chased 25 Nov and 1 Dec' })}
      `)}
      ${caption('costs — addCostToSample')}
      ${card(`<div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;">
        ${fact('Fabric', '৳1,880')}
        ${fact('Trims', '৳640')}
        ${fact('Labour', '৳1,900 — one operator-day')}
        ${fact('Courier', '৳400')}
        <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--fx-border-default);">
          <span style="font: 600 14px/1.3 ${SANS};">Total</span><span data-numeric style="font: 600 14px/1.3 ${MONO};">৳4,820</span>
        </div>
        <div style="display: flex; justify-content: flex-end;">${btn('secondary', 'Add a cost')}</div>
      </div>`)}
      ${caption('history')}
      ${card(`
        ${row({ status: 'done', code: '21 Nov 14:40', text: 'Rashida Akter marked it dispatched — DHL 176-44219308' })}
        ${row({ status: 'done', code: '19 Nov 11:20', text: 'moved to in work' })}
        ${row({ status: 'done', code: '14 Nov 09:05', text: 'raised against PO-BF-2044' })}
      `)}
    </div>
  </div>`,
}))

emit('SamplingLibraryLoad.dc.html', board({
  w: 1560, h: 1000, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('/sampling/library and /sampling/load')}
    <h1 style="font: 700 28px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">What the room has made, and what it is making</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      Two questions the board cannot answer. The library is asked months later — “what did we do for this buyer in a stretch cotton” — and the load is asked on Monday morning.
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 34px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/sampling/library — findable by style or buyer')}
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${['All buyers', 'H&M', 'Primark', 'C&A', 'Bestseller'].map((f, i) => `<span style="display: inline-flex; align-items: center; padding: 8px 12px; min-height: 36px; border-radius: 4px; border: 1px solid var(--fx-border-${i === 1 ? 'default' : 'subtle'}); background: ${i === 1 ? 'var(--fx-bg-selected)' : 'transparent'}; font: 500 12.5px/1 ${SANS};">${f}</span>`).join('')}
      </div>
      ${card(`
        ${row({ status: 'done', code: 'SMP-0402', text: 'ST-2588 PP — approved 18 Nov, first round', sub: 'Primark · poplin · ৳3,940 · this is what released cutting' })}
        ${row({ status: 'done', code: 'SMP-0361', text: 'ST-2510 PP — approved with comments, round 2', sub: 'H&M · poplin · ৳6,220 · sleeve length changed at round 1' })}
        ${row({ status: 'done', code: 'SMP-0344', text: 'ST-2477 proto — rejected on fabric hand', sub: 'C&A · twill · ৳2,180 · re-made in 32s and approved' })}
      `)}
      ${note('The library’s job is comparison, so cost and round count are on the row rather than behind it. “Two rounds and ৳6,220” is the fact that tells a merchandiser what to promise for the next one.')}
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/sampling/load — the room’s week')}
      ${card(`<div style="display: grid; grid-template-columns: 108px repeat(5, minmax(0, 1fr));">
        <div style="padding: 10px 12px; border-bottom: 1px solid var(--fx-border-default);">${eyebrow('Machine')}</div>
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => `<div style="padding: 10px; text-align: center; border-bottom: 1px solid var(--fx-border-default); border-left: 1px solid var(--fx-border-subtle);">${eyebrow(d)}</div>`).join('')}
        ${[['Sample line 1', ['SMP-0425', 'SMP-0425', 'SMP-0424', '', '']], ['Sample line 2', ['SMP-0423', 'SMP-0423', '', 'SMP-0424', 'SMP-0424']], ['Cutting table', ['SMP-0425', '', 'SMP-0424', '', '']]]
          .map(([m, days]) => `<div style="padding: 11px 12px; border-bottom: 1px solid var(--fx-border-subtle); font: 500 13px/1.3 ${SANS};">${m}</div>
          ${days.map((d) => `<div style="padding: 10px; border-bottom: 1px solid var(--fx-border-subtle); border-left: 1px solid var(--fx-border-subtle); text-align: center; min-height: 44px; display: flex; align-items: center; justify-content: center; background: ${d ? 'var(--fx-bg-sunken)' : 'transparent'};">${d ? mono(d, { size: 11 }) : ''}</div>`).join('')}`).join('')}
      </div>`)}
      ${note('Three sample makers and a cutting table is the whole capacity of a sampling room this size, which is why a fourth urgent request is a conversation and not a form field.')}
    </div>
  </div>`,
}))

/* ── 18 · the machine, drawn ─────────────────────────────────────────────── */

const TRANSITIONS = [
  ['requested', 'in_work', 'the room starts it', 'Move to in work'],
  ['requested', 'closed', 'the buyer withdrew before it was made', 'Close the sample'],
  ['in_work', 'dispatched', 'couriered — courier and AWB required', 'Mark dispatched'],
  ['in_work', 'closed', 'abandoned in the room', 'Close the sample'],
  ['dispatched', 'feedback', 'the buyer has said something', 'Record the verdict'],
  ['dispatched', 'closed', 'never came back and nobody is waiting', 'Close the sample'],
  ['feedback', 'approved', 'verdict: approved — this releases cutting', 'Record the verdict'],
  ['feedback', 'rejected', 'verdict: rejected — cutting stays blocked', 'Record the verdict'],
  ['feedback', 'closed', 'the order was cancelled mid-round', 'Close the sample'],
  ['approved', 'feedback', 'a further comment after approval — the normal case', 'Record the verdict'],
  ['approved', 'closed', 'done with', 'Close the sample'],
  ['rejected', 'in_work', 're-make it', 'Move to in work'],
  ['rejected', 'feedback', 'the buyer commented again on the rejected one', 'Record the verdict'],
  ['rejected', 'closed', 'the style was dropped', 'Close the sample'],
]

emit('SamplingMachine.dc.html', board({
  w: 1300, h: 1100, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('HANDOFF-1-4-sampling §6 — every transition, and the control that makes it')}
    <h1 style="font: 700 28px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">Fourteen moves, three controls</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      The drawer offers only the moves the machine allows from the state it is in. This table is what the stage mover, the verdict control and Close cover between them — drawn so a later session can check the drawer against the machine rather than against a memory of it.
    </div>
  </div>
  ${card(`<div style="display: grid; grid-template-columns: 118px 118px minmax(0, 1fr) 190px;">
    ${['From', 'To', 'When', 'The control'].map((h) => `<div style="padding: 10px 14px; border-bottom: 1px solid var(--fx-border-default);">${eyebrow(h)}</div>`).join('')}
    ${TRANSITIONS.map(([from, to, when, control]) => `
      <div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle);">${mono(from, { size: 12 })}</div>
      <div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle);">${mono(to, { size: 12, colour: to === 'closed' ? 'var(--fx-text-tertiary)' : 'var(--fx-text-primary)' })}</div>
      <div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle); font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary);">${when}</div>
      <div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle); font: 500 12.5px/1.4 ${SANS};">${control}</div>`).join('')}
  </div>`)}
  ${note('“approved → feedback” is not a mistake and the drawer must not treat it as one. A buyer who approved a sample and then sent a further comment is the normal case; a machine that refused it would force somebody to record the second comment as a new request and lose the thread. “closed” is terminal from everywhere, which is why Close sits in the footer of every state rather than in a menu.')}`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   19–21 · /memory, similar styles, and the adjacent desks
   ══════════════════════════════════════════════════════════════════════════ */

emit('Memory.dc.html', desk({
  h: 1240, active: 'memory',
  inner: `${pageHeader({ eyebrow: 'Closed orders, compiled', title: 'Order memory', meta: '14 closed orders · 9 with a note', ownsAmber: false })}
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 520px; gap: 32px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${sectionHeading('What went wrong, and what to repeat')}
      ${card(`
        ${row({ status: 'done', code: 'PO-BF-2029', text: 'H&M · ST-2510 · 8,000 pcs · shipped 18 Nov, realised 28 Nov', sub: 'Two PP rounds. The sleeve comment cost 9 days — ask for the fit sample a week earlier on this buyer’s basics.' })}
        ${row({ status: 'done', code: 'PO-BF-2018', text: 'Primark · ST-2455 · 24,000 pcs · shipped 2 Nov', sub: 'Fabric landed 6 days early and the store had nowhere to put it. Book the bonded bay before the ship date, not after.' })}
        ${row({ status: 'done', code: 'PO-BF-2004', text: 'C&A · ST-2477 · 16,000 pcs · shipped 12 Oct', sub: 'Proto rejected on fabric hand — 32s, not 40s, for this buyer’s twill. Cost two weeks and ৳2,180 of sample.' })}
      `)}
      ${note('Memory is not an archive; it is what the next quotation should know. Each row is a sentence somebody wrote at close-out, not a computed summary — a generated one would say “shipped on time” and lose the sleeve comment that is the actual lesson.')}
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('the close-out note — a form at order close')}
      ${card(`<div style="padding: 20px 22px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: baseline; gap: 10px;">${mono('PO-BF-2029', { size: 13 })}<span style="font: 400 13px/1.3 ${SANS}; color: var(--fx-text-secondary);">closing this order</span></div>
        ${[['What went wrong', 'Two PP rounds. The sleeve comment at round one cost nine days and pushed cutting into the Eid week.'],
           ['What to repeat', 'The fabric leg — Shanghai delivered early and clean. Same supplier for this quality next time.'],
           ['What to change', 'Ask H&M for the fit sample a week earlier on their basics; their comment sheets always come back on the sleeve.']]
          .map(([label, text]) => `<div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font: 500 12.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${label}</span>
            <div style="min-height: 76px; padding: 11px 13px; border: 1px solid var(--fx-border-default); border-radius: 4px; background: var(--fx-bg-surface); font: 400 13.5px/1.6 ${SANS}; text-wrap: pretty;">${text}</div>
          </div>`).join('')}
        <div style="display: flex; gap: 10px; justify-content: flex-end;">${btn('ghost', 'Close without a note')}${btn('primary', 'Save the note and close')}</div>
      </div>`)}
      ${note('“Close without a note” exists and is not hidden. A merchandiser closing eleven orders on the last day of the month will otherwise write eleven notes that say nothing, and a memory full of nothing is worse than a memory with gaps.')}
    </div>
  </div>`,
}))

emit('SimilarStyles.dc.html', board({
  w: 1300, h: 1000, pad: 40, bg: 'var(--fx-bg-sunken)',
  body: `
  <div style="margin-bottom: 24px;">
    ${eyebrow('Drawer · similar styles — findSimilarStyles')}
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; margin-top: 10px; text-wrap: pretty;">
      Opens from any order and from any RFQ. The point is not the list — it is the close-out note attached to each row, which is the only place a factory’s own experience is written down.
    </div>
  </div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    ${drawer({
      width: 560, height: 800, status: 'done',
      code: 'RFQ-0088', who: 'Bestseller A/S · 3 styles', statusText: 'quote due 5 Dec',
      figure: { label: 'Made something like this', value: '3', unit: 'times', basis: 'matched on fabric, construction and buyer · closest first' },
      tabs: ['Similar styles', 'This RFQ'], active: 0,
      body: `<div style="display: flex; flex-direction: column; gap: 11px;">
        ${[['ST-2510', 'H&M · 40s poplin shirt · 8,000 pcs', '$4.62 FOB', 'Two PP rounds. The sleeve comment cost 9 days.', 'at-risk'],
           ['ST-2455', 'Primark · 40s poplin shirt · 24,000 pcs', '$4.40 FOB', 'Fabric landed 6 days early and the store had nowhere to put it.', 'done'],
           ['ST-2388', 'Bestseller · 40s poplin blouse · 14,000 pcs', '$5.10 FOB', 'Clean run. This buyer approves at round one when the size set goes with the PP.', 'done']]
          .map(([style, what, price, lesson, tone]) => `<div class="fx-selvage" data-status="${tone}" style="border: 1px solid var(--fx-border-subtle); border-radius: 8px; background: var(--fx-bg-surface); overflow: hidden;">
            <div style="flex: 1; min-width: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">${mono(style, { size: 12.5 })}<span data-numeric style="font: 500 13px/1.3 ${MONO}; margin-left: auto;">${price}</span></div>
              <span style="font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">${what}</span>
              <span style="font: 400 12.5px/1.55 ${SANS}; color: var(--fx-text-primary); text-wrap: pretty; border-top: 1px solid var(--fx-border-subtle); padding-top: 7px;">${lesson}</span>
            </div></div>`).join('')}
      </div>`,
      footer: `${btn('ghost', 'Open the memory')}${btn('primary', 'Seed the cost sheet from ST-2388')}`,
    })}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px;">
      ${caption('why the note is on the row and not behind it')}
      <div style="font: 400 14px/1.7 ${SANS}; color: var(--fx-text-secondary); max-width: 62ch; text-wrap: pretty;">
        A list of three similar styles with three prices is a list a merchandiser can build from the order book in a minute. What they cannot rebuild is the sentence somebody wrote when the order closed — that the sleeve comment cost nine days, that this buyer approves at round one when the size set travels with the PP.
        <br><br>
        So the note is the row, and the price is the number beside it. The footer’s primary action seeds the cost sheet from the CLEANEST comparable rather than the closest one, because the cleanest is the one worth repeating.
      </div>
      ${refusalNote('Similar is a suggestion, never a rule', 'Matching is on fabric, construction and buyer. It has no idea what the market did since, and the quotation is still the merchandiser’s to write.')}
    </div>
  </div>`,
}))

emit('Adjacent.dc.html', board({
  w: 1560, h: 1240, pad: 40,
  body: `
  <div style="margin-bottom: 26px;">
    ${eyebrow('The four screens the merchandiser opens on somebody else’s desk')}
    <h1 style="font: 700 28px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">Where the desk ends</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 92ch; text-wrap: pretty;">
      Thirteen rail entries; four of them belong to other desks. Two are read-only, and on the two that are not, only some of the actions are theirs.
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; align-items: start;">
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/planning — write, but only allocate')}
      ${card(`<div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;">
        ${miniRow('at-risk', 'L1–L4 · held open from 6 Dec for ST-2610', '4 lines')}
        ${miniRow('on-track', 'L5–L6 · ST-2588 through 19 Dec', '')}
        ${miniRow('on-track', 'L7–L8 · ST-2571 finishing', '')}
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          ${btn('primary', 'Allocate PO-BF-2044 to a line')}
          <span style="font: 400 12.5px/1.5 ${SANS}; color: var(--fx-text-tertiary);">your own orders only</span>
        </div>
        <div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-tertiary); text-wrap: pretty;">
          Moving somebody else’s allocation, changing a line’s calendar, forking a scenario and recording an SMV are the planner’s. They are not greyed here — they are not on this screen.
        </div>
      </div>`)}
      ${note('“Write” on a nav entry is not the same as “every action”. The merchandiser can put their own order on a line because they are the one being asked when it ships; re-sequencing the floor is Nazmul Karim’s job.')}
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/shipment — write, two actions')}
      ${card(`<div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;">
        ${miniRow('at-risk', 'SHP-0912 · PO-BF-2044 · packed, no EXP number', 'blocked')}
        ${miniRow('on-track', 'SHP-0908 · PO-BF-2041 · documents with the bank', '')}
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">${btn('secondary', 'Open a shipment')}${btn('secondary', 'Accept the LC date breach')}</div>
        <div style="border: 1px solid var(--fx-danger); border-radius: 8px; padding: 12px 14px; font: 400 13px/1.6 ${SANS}; text-wrap: pretty;">
          Accepting a breach is a decision with a cost: the shipment can still be presented, and the bank may take it as discrepant. It goes through a confirm that says so, and it is recorded against your name.
        </div>
      </div>`)}
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/approve — what routes to a merchandiser')}
      ${card(`
        ${row({ status: 'done', code: 'ST-2610', text: 'style measurements read from the tech pack', sub: 'yours to approve — 23 fields, 3 below 0.90', right: confidence(0.74) })}
        ${row({ status: 'done', code: 'PO-BF-2044', text: 'an order revision read from H&M’s revised PO', sub: 'Deep navy / L +2,000 · ship −5d', right: confidence(0.91) })}
        ${row({ status: 'done', code: 'SMP-0409', text: 'a PP verdict read from the buyer’s comment mail', sub: 'approved with comments — this one releases a cut', right: confidence(0.88) })}
      `)}
      ${note('Three kinds route here and the third is the one to read slowly: a verdict read out of an email releases a cutting floor. Its confidence is 0.88 — below the threshold — and that is exactly the draft a person must open rather than batch.')}
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${caption('/refused and /marbim')}
      ${card(`
        ${row({ status: 'done', code: 'Mon 11:04', text: 'Save a breakdown of 44,000 against a 42,000 order', sub: 'gate: the header and the grid must agree — propose a revision instead', right: btn('ghost', 'Open the gate', { size: 'sm' }) })}
      `)}
      ${card(`<div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 11px; align-items: center;">${mark(24, LIGHT, { state: 'listening' })}<span style="font: 600 14px/1.3 ${SANS};">Ask MARBIM</span></div>
        ${['What is due this week?', 'Which orders conflict with their LC?', 'What did we learn on ST-2510?'].map((p) => `<div style="padding: 10px 13px; border: 1px solid var(--fx-border-subtle); border-radius: 999px; font: 400 13px/1.4 ${SANS}; color: var(--fx-text-secondary);">${p}</div>`).join('')}
        <span style="font: 400 12px/1.5 ${MONO}; color: var(--fx-text-tertiary);">proposes drafts · never writes</span>
      </div>`)}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   22–26 · The five flows
   ══════════════════════════════════════════════════════════════════════════ */

const flowBoard = (name, { w, h, title, blurb, steps, tail }) => emit(name, board({
  w, h, pad: 40,
  body: `<div style="margin-bottom: 26px;">
    ${eyebrow(title.eyebrow)}
    <h1 style="font: 700 28px/1.15 ${SANS}; letter-spacing: -.02em; margin: 10px 0 12px;">${title.text}</h1>
    <div style="font: 400 14px/1.6 ${SANS}; color: var(--fx-text-secondary); max-width: 100ch; text-wrap: pretty;">${blurb}</div>
  </div>
  <div style="display: flex; align-items: stretch; gap: 0;">${steps}</div>
  ${tail ? note(tail) : ''}`,
}))

const ph = (route, title) => `<div style="padding: 11px 14px; border-bottom: 1px solid var(--fx-border-subtle); display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;">
  ${mono(route, { size: 11.5, colour: 'var(--fx-text-tertiary)' })}<span style="font: 600 13px/1.3 ${SANS};">${title}</span></div>`
const pb = (inner) => `<div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 9px;">${inner}</div>`
const pt = (t) => `<div style="font: 400 12.5px/1.6 ${SANS}; color: var(--fx-text-secondary); text-wrap: pretty;">${t}</div>`
const field = (l, v, c) => `<div style="border: 1px solid var(--fx-border-${c !== undefined && c < 0.9 ? 'default' : 'subtle'}); border-radius: 8px; padding: 9px 11px; display: flex; flex-direction: column; gap: 5px;">
  <span style="font: 400 11.5px/1.3 ${SANS}; color: var(--fx-text-secondary);">${l}</span>
  <span style="font: 500 13.5px/1.3 ${SANS};">${v}</span>${c !== undefined ? confidence(c) : ''}</div>`

flowBoard('F1.dc.html', {
  w: 2260, h: 880,
  title: { eyebrow: 'Flow 1', text: 'Booking an order off the buyer’s paper' },
  blurb: 'The reading is a draft, not an order. Everything downstream — the TNA, the fabric booking, the LC value, the costing — is computed from what is confirmed here, which is why the one field a merchandiser always checks is the ex-factory date.',
  steps: [
    step(1, 'the PO arrives', `${ph('/orders', 'Drop a buyer PO')}${pb(`<div style="border: 1px dashed var(--fx-border-strong); border-radius: 8px; padding: 22px 14px; text-align: center; font: 400 13px/1.6 ${SANS}; color: var(--fx-text-secondary);">H&amp;M_PO_2047.pdf<br><span style="font-size: 12px; color: var(--fx-text-tertiary);">4 pages</span></div>${pt('Dropped here, photographed on the phone, or mailed in — three doors, one pipeline.')}`)}`, { w: 340 }),
    arrow(),
    step(2, 'MARBIM reads it', `${ph('drawer · draft', 'PO-BF-2047')}${pb(`${field('Buyer', 'H&M', 0.98)}${field('Quantity', '30,000 pcs', 0.94)}${field('Ex-factory', '22 Jan 2027', 0.87)}${pt('14 fields. The ex-factory date is the weakest at 0.87 — it was handwritten in the margin.')}`)}`, { w: 340 }),
    arrow(),
    step(3, 'correct the date', `${ph('drawer · draft', 'corrected')}${pb(`${field('Ex-factory', '29 Jan 2027')}<span style="font: 400 11.5px/1.4 ${MONO}; color: var(--fx-text-tertiary);">corrected from 22 Jan</span>${pt('The margin note said 29, not 22. The correction goes in with the confirmation, in one action.')}`)}`, { w: 340 }),
    arrow(),
    step(4, 'the TNA generates', `${ph('/orders/PO-BF-2047', 'TNA')}${pb(`${miniRow('on-track', 'Tech pack received · 8 Dec', '')}${miniRow('on-track', 'PP approved · 22 Dec', '')}${miniRow('on-track', 'Cutting start · 29 Dec', '')}${miniRow('on-track', 'Ex-factory · 29 Jan', '')}${pt('Backwards from the ex-factory date, using this buyer’s lead times. Every date is editable — the generator is a starting point, not a contract.')}`)}`, { w: 340 }),
    arrow(),
    step(5, 'the book', `${ph('/orders', 'the book')}${pb(`${miniRow('on-track', 'PO-BF-2047 · H&M · ST-2661', '30,000')}${pt('On-track, because nothing has slipped yet. The LC chip is empty until commercial opens the credit — an order can be booked before its money is.')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'Booking by hand reaches step 4 directly, with an empty form instead of a draft. The manual door is never removed: a desk that can only be filled by a document reader is a desk that stops when the reader is wrong.',
})

flowBoard('F2.dc.html', {
  w: 2260, h: 900,
  title: { eyebrow: 'Flow 2', text: 'A slip, and what it costs downstream' },
  blurb: 'The ripple preview is the whole flow. A merchandiser recording that fabric arrived four days late is not asking to move the ship date — but it does move, and they are entitled to see by how much before they commit it.',
  steps: [
    step(1, 'the milestone', `${ph('/orders/PO-BF-2044', 'TNA')}${pb(`${miniRow('at-risk', 'Fabric in-house · planned 26 Nov', 'not yet')}${pt('The store received it on 30 Nov. Recording the actual date is the merchandiser’s, because the consequences are theirs.')}`)}`, { w: 340 }),
    arrow(),
    step(2, 'the ripple preview', `${ph('previewMilestoneRipple', 'What this moves')}${pb(`${miniRow('late', 'Cutting start · 1 → 5 Dec', '+4d')}${miniRow('late', 'Sewing start · 4 → 8 Dec', '+4d')}${miniRow('at-risk', 'Ex-factory · 18 → 20 Dec', '+2d')}${pt('Two days of declared slack absorbed the rest. The same computation runs on the write, so the preview and the result cannot disagree.')}`)}`, { w: 340 }),
    arrow(),
    step(3, 'confirm', `${ph('actualizeMilestone', 'committed')}${pb(`${pt('<strong>Ex-factory moves to 20 Dec.</strong>')}${miniRow('done', 'Fabric in-house · actual 30 Nov', '✓')}${pt('One action writes the actual date and every planned date it moves — never two, because a half-applied ripple is a TNA nobody can trust.')}`)}`, { w: 340 }),
    arrow(),
    step(4, 'the chip turns red', `${ph('/orders', 'the book')}${pb(`<div style="display: flex; align-items: center; gap: 8px;">${mono('PO-BF-2044', { size: 12 })}${lcChip('LC-BF-7781', '−1d', true)}</div>${pt('The latest shipment is 21 Dec and ex-factory is now 20 Dec. One day of margin, down from three. The chip is red because the dates genuinely conflict, not because they are close.')}`)}`, { w: 340 }),
    arrow(),
    step(5, 'the ask', `${ph('drawer · order · LC', 'the conflict')}${pb(`${pt('“The LC expires before this order can ship. Latest shipment on LC-BF-7781 is 21 Dec…” — the same sentence as the book row and the full page.')}<div style="display: flex; gap: 8px;">${btn('primary', 'Ask commercial for an amendment', { size: 'sm' })}</div>${pt('Which raises a draft to commercial. A merchandiser does not amend a credit; they say what date they need.')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'Three surfaces show this conflict — the chip on the book, the banner in the drawer, the banner on the full page — in identical words. A merchandiser who reads three phrasings of one problem counts three problems.',
})

flowBoard('F3.dc.html', {
  w: 1820, h: 880,
  title: { eyebrow: 'Flow 3', text: 'The buyer changes their mind' },
  blurb: 'A revision is a diff, not a re-entry. What arrives is a revised PO; what a merchandiser needs to see is the six numbers that moved, not the ninety that did not.',
  steps: [
    step(1, 'the revised PO', `${ph('/orders', 'a second drop')}${pb(`<div style="border: 1px dashed var(--fx-border-strong); border-radius: 8px; padding: 20px 14px; text-align: center; font: 400 13px/1.5 ${SANS}; color: var(--fx-text-secondary);">H&amp;M_PO_2044_RevB.pdf</div>${pt('Matched to the existing order by PO number, so it reads as a revision rather than a second order.')}`)}`),
    arrow(),
    step(2, 'the diff draft', `${ph('drawer · draft', 'a revision')}${pb(`${pt('<strong>Deep navy / L +2,000. Ship date −5 days.</strong>')}${miniRow('at-risk', 'Deep navy / L · 2,700 → 4,700', '+2,000')}${miniRow('at-risk', 'Ex-factory · 18 → 13 Dec', '−5d')}${pt('Two changes on a 42,000-piece order. Everything unchanged is not listed — a diff that repeats the whole grid is a re-entry with extra steps.')}`)}`),
    arrow(),
    step(3, 'approve it', `${ph('/approve', 'the merchandiser’s inbox')}${pb(`${pt('Confidence 0.91 on the quantity, 0.84 on the date — the date was handwritten again.')}${confidence(0.84)}${pt('Approving writes Rev 2. The order header and the grid move together; a revision that changed only one of them is the state the breakdown tab refuses.')}`)}`),
    arrow(),
    step(4, 'Rev 2, with the overlay', `${ph('/orders/PO-BF-2044', 'Breakdown')}${pb(`${pt('Rev 1 stays selectable. The changed cell carries the accent and the delta under the new number.')}${miniRow('at-risk', 'Deep navy / L · 4,700', '+2,000')}${pt('“What did we agree in November” is a question a buyer asks in January.')}`)}`),
  ].join(''),
  tail: 'The five-day pull-in is the harder half and it does not stop here: it re-ripples the TNA, and the ripple preview runs on it the same way F2’s did.',
})

flowBoard('F4.dc.html', {
  w: 2260, h: 900,
  title: { eyebrow: 'Flow 4', text: 'A sample becomes a cutting release' },
  blurb: 'Five steps, and the fourth is the one with a floor behind it. A verdict read out of an email releases a cutting table — which is why it lands as a draft with a confidence rather than as a write.',
  steps: [
    step(1, 'raise it', `${ph('/sampling', 'raise a request')}${pb(`${miniRow('on-track', 'SMP-0412 · ST-2610 PP · requested', '')}${pt('Raised against PO-BF-2044, so the room knows which order is waiting and the order knows which sample it is waiting on.')}`)}`, { w: 340 }),
    arrow(),
    step(2, 'the room makes it', `${ph('drawer · sample', 'stage mover')}${pb(`${pt('requested → in work. Only the moves the machine allows are offered.')}${miniRow('on-track', 'requisition: 12 m poplin, 60 buttons', 'issued')}${pt('What the room drew is recorded, so the sample has a cost by the time it leaves.')}`)}`, { w: 340 }),
    arrow(),
    step(3, 'dispatch', `${ph('markSampleDispatched', 'courier and AWB')}${pb(`${field('Courier', 'DHL')}${field('AWB', '176-44219308')}${pt('in work → dispatched. The AWB is required — a sample “sent” with no way to trace it is a sample nobody can chase.')}`)}`, { w: 340 }),
    arrow(),
    step(4, 'the verdict, from mail', `${ph('/approve', 'a draft')}${pb(`${pt('H&M’s comment sheet, read into a verdict draft.')}${field('Verdict', 'Approved with comments', 0.88)}${pt('Three verdicts are one word apart on a comment sheet and a floor apart in meaning. 0.88 is below the threshold, so this one is opened, not batched.')}`)}`, { w: 340 }),
    arrow(),
    step(5, 'cutting is released', `${ph('/orders/PO-BF-2044', 'TNA')}${pb(`${miniRow('done', 'PP approved · actual 2 Dec', '✓')}${miniRow('on-track', 'Cutting start · no longer gated', '')}${pt('Approving the draft records the verdict, sets the milestone’s actual date, and clears the PP gate on the cutting floor — where Rafiq Islam has been refused three times.')}`)}`, { w: 340 }),
  ].join(''),
  tail: 'The gate is DEFINED in sampling and ENFORCED in cutting: the verdict lives here, the refusal happens where the cloth is. That split is why the sample drawer has to say “this verdict is what flips cutting” out loud.',
})

flowBoard('F5.dc.html', {
  w: 1820, h: 860,
  title: { eyebrow: 'Flow 5', text: 'Close-out, and the next quotation' },
  blurb: 'The only flow in this canvas that pays off months later. A close-out note is thirty seconds at the end of an order and the difference between quoting from memory and quoting from experience.',
  steps: [
    step(1, 'the order finishes', `${ph('/orders/PO-BF-2029', 'shipped and realised')}${pb(`${miniRow('done', 'Shipped in full · 18 Nov', '8,000')}${miniRow('done', 'Realised · 28 Nov', '$38,400')}${pt('confirmed → in_production → shipped_full → closed. Closing is the last transition and it asks one thing on the way through.')}`)}`),
    arrow(),
    step(2, 'the note', `${ph('saveCloseOutNote', 'three questions')}${pb(`${pt('<strong>What went wrong:</strong> two PP rounds; the sleeve comment cost nine days.')}${pt('<strong>What to repeat:</strong> the fabric leg — Shanghai delivered early and clean.')}${pt('<strong>What to change:</strong> ask H&M for the fit sample a week earlier.')}`)}`),
    arrow(),
    step(3, '/memory compiles it', `${ph('/memory', 'closed orders')}${pb(`${miniRow('done', 'PO-BF-2029 · H&M · ST-2510', '8,000')}${pt('A sentence somebody wrote, not a computed summary. A generated one would say “shipped on time” and lose the sleeve comment that is the actual lesson.')}`)}`),
    arrow(),
    step(4, 'the next RFQ', `${ph('drawer · similar styles', 'RFQ-0088')}${pb(`${miniRow('at-risk', 'ST-2510 · $4.62 FOB · two PP rounds', '')}${pt('Bestseller asks for a poplin shirt. The drawer shows three the factory has made — and the note under each.')}${pt('This is the only place a factory’s own experience is written down.')}`)}`),
  ].join(''),
  tail: '“Close without a note” exists and is not hidden. Eleven orders closed on the last day of the month would otherwise produce eleven notes that say nothing, and a memory full of nothing is worse than a memory with gaps.',
})

/* ══════════════════════════════════════════════════════════════════════════
   27 · Bengali — the book and the order drawer
   ══════════════════════════════════════════════════════════════════════════ */

const bnHeading = (text, right) => `<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
  ${slashes(LIGHT, { accent: true, h: 15 })}
  <h2 style="font: 600 26px/1.35 ${BANGLA}; letter-spacing: 0; margin: 0;">${text}</h2>
  ${right ? `<span style="margin-left: auto; font: 400 12.5px/1.5 ${BANGLA}; color: var(--fx-text-tertiary);">${right}</span>` : ''}</div>`

const BN_ORDERS = [
  { status: 'late', critical: true, po: 'PO-BF-2044', buyer: 'H&M', styles: 'ST-2610', qty: '42,000', value: '$203,700', ex: '18 Dec', lc: ['LC-BF-7781', '−3d', true], health: 'কাটিং শুরু করা যায়নি — PP স্যাম্পল এখনও বায়ারের কাছে' },
  { status: 'at-risk', po: 'PO-BF-2041', buyer: 'Primark', styles: 'ST-2588', qty: '12,000', value: '$62,400', ex: '9 Dec', lc: ['LC-BF-7774', '19d', false], health: 'ফিনিশিংয়ে আছে · ১২,০০০-এর মধ্যে ৮,৪০০ সেলাই হয়েছে' },
  { status: 'on-track', po: 'PO-BF-2039', buyer: 'Bestseller A/S', styles: 'ST-2571', qty: '18,000', value: '$97,200', ex: '22 Dec', lc: ['LC-BF-7786', '34d', false], health: 'পরিকল্পনা মতোই চলছে · কাটিং ৬২% শেষ' },
]

const bnOrderRow = (o) => `<div class="fx-selvage" data-status="${o.status}" ${o.critical ? 'data-critical="true"' : ''} style="border-top: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface);">
  <div style="flex: 1; min-width: 0; display: grid; grid-template-columns: 128px minmax(0, 1fr) 92px 96px 84px 156px; gap: 14px; align-items: center; padding: 13px 18px; min-height: 44px;">
    <span>${mono(o.po, { size: 12.5 })}</span>
    <div style="min-width: 0; display: flex; flex-direction: column; gap: 4px;">
      <span style="font: 500 14px/1.5 ${BANGLA};">${o.buyer} · ${o.styles}</span>
      <span style="font: 400 12.5px/1.7 ${BANGLA}; color: var(--fx-text-tertiary); text-wrap: pretty;">${o.health}</span>
    </div>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary); text-align: right;">${o.qty}</span>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; text-align: right;">${o.value}</span>
    <span data-numeric style="font: 400 13px/1.3 ${MONO}; color: var(--fx-text-secondary); text-align: right;">${o.ex}</span>
    <span style="display: flex; justify-content: flex-end;">${lcChip(...o.lc)}</span>
  </div></div>`

emit('BengaliOrders.dc.html', desk({
  h: 1180, bangla: true, active: 'orders', phrase: 'মার্চেন্ডাইজার', who: 'RA',
  inner: `${pageHeader({ eyebrow: 'বই', title: 'অর্ডার ডেস্ক ও TNA', meta: '১৯টি খোলা · 412,000 pcs · $1.94m', ownsAmber: false, bangla: true,
    actions: `<div style="display: flex; gap: 10px;"><button style="display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 10px 18px; font: 600 14px/1.4 ${BANGLA}; min-height: 36px; background: transparent; color: var(--fx-text-primary); border: 1px solid var(--fx-border-default);">বায়ারের PO দিন</button><button style="display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 10px 18px; font: 600 14px/1.4 ${BANGLA}; min-height: 36px; background: var(--fx-accent); color: var(--fx-accent-on); border: none;">অর্ডার তুলুন</button></div>` })}
  ${card(`
    <div style="border-bottom: 1px solid var(--fx-border-default); background: var(--fx-bg-surface);">
      <div style="display: grid; grid-template-columns: 128px minmax(0, 1fr) 92px 96px 84px 156px; gap: 14px; padding: 10px 18px 10px 21px;">
        ${['PO', 'বায়ার ও স্টাইল', 'পরিমাণ', 'মূল্য', 'এক্স-ফ্যাক্টরি', 'LC'].map((h, i) => `<span style="font: 500 12px/1.4 ${BANGLA}; letter-spacing: 0; color: var(--fx-text-tertiary); text-align: ${i >= 2 ? 'right' : 'left'};">${h}</span>`).join('')}
      </div></div>
    ${BN_ORDERS.map(bnOrderRow).join('')}
  `)}
  <div style="height: 30px;"></div>
  ${bnHeading('অর্ডারের ড্রয়ার', 'যেটা সারিতে চাপ দিলে খোলে')}
  <div style="display: flex; gap: 28px; align-items: flex-start;">
    ${drawer({
      width: 720, height: 620, status: 'late', critical: true,
      code: 'PO-BF-2044', who: 'H&M · ST-2610', statusText: '৪ দিন দেরি',
      figure: { label: 'অর্ডার', value: '42,000', unit: 'pcs', basis: '৩টি রঙ × ৬টি সাইজ · $4.85 FOB · এক্স-ফ্যাক্টরি 18 Dec 2026' },
      tabs: ['TNA', 'ব্রেকডাউন', 'LC', 'ফাইল', 'ইতিহাস'], active: 0,
      body: `<div style="border: 1px solid var(--fx-danger); border-radius: 8px; background: var(--fx-bg-surface); padding: 12px 14px; font: 400 13.5px/1.75 ${BANGLA}; text-wrap: pretty;">
        <strong style="font-weight: 600;">LC-BF-7781-এর শেষ শিপমেন্টের তারিখ 21 Dec।</strong> এক্স-ফ্যাক্টরি 18 Dec, আর সেটা পিছিয়ে যাচ্ছে — হাতে তিন দিন আছে। সংশোধনী তুলবে কমার্শিয়াল; আপনি শুধু কোন তারিখ দরকার সেটা বলবেন।
      </div>
      <div style="display: flex; flex-direction: column; gap: 11px;">
        ${[['PP অনুমোদন', '28 Nov', 'এখনও হয়নি — ১১ দিন বায়ারের কাছে', 'late'],
           ['কাপড় গুদামে', '26 Nov', '28 Nov — দুই দিন দেরিতে এসেছে', 'done'],
           ['কাটিং শুরু', '1 Dec', 'PP-র জন্য আটকে আছে', 'late']].map(([n, p, a, st]) => `
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; border-radius: 999px; border: 1.5px solid ${st === 'done' ? 'var(--fx-success)' : 'var(--fx-danger)'}; color: ${st === 'done' ? 'var(--fx-success)' : 'var(--fx-danger)'}; font: 500 10px/1 ${MONO};">${st === 'done' ? '✓' : '✕'}</span>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <span style="font: 600 13.5px/1.5 ${BANGLA};">${n}</span>
              <span style="font: 400 12.5px/1.7 ${BANGLA}; color: var(--fx-text-tertiary);"><span style="font-family: ${MONO};">${p}</span> — ${a}</span>
            </div></div>`).join('')}
      </div>`,
      gate: `${gateChip('fail', 'PP অনুমোদন — ১১ দিন')}${gateChip('pass', 'কাপড় গুদামে 28 Nov')}`,
      footer: `<button style="display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 10px 18px; font: 600 14px/1.4 ${BANGLA}; min-height: 36px; background: transparent; color: var(--fx-text-primary); border: 1px solid transparent;">সংশোধনী চান</button><button style="display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 10px 18px; font: 600 14px/1.4 ${BANGLA}; min-height: 36px; background: var(--fx-accent); color: var(--fx-accent-on); border: none;">PP অনুমোদন লিখুন</button>`,
    })}
    <div style="flex: 1; min-width: 0;">
      ${note('The LC conflict sentence is the longest string a merchandiser reads, and in Bengali it is roughly 40% longer again — which is why the drawer is 720 here and the banner wraps to four lines rather than being truncated. Purchase orders, style codes, quantities, money and dates keep their Latin forms: the buyer’s paper says PO-BF-2044 and 18 Dec, and so does the screen.')}
    </div>
  </div>`,
}))

/* ══════════════════════════════════════════════════════════════════════════
   canvas.json
   ══════════════════════════════════════════════════════════════════════════ */

const A = (file, x, y, w, h, page, title) => ({ file, x, y, w, h, page, title })

const canvas = {
  pages: [
    { id: 'desk', name: 'The desk' },
    { id: 'order', name: 'An order' },
    { id: 'sampling', name: 'Sampling' },
    { id: 'memory', name: 'Memory & edges' },
    { id: 'flows', name: 'Flows' },
    { id: 'bengali', name: 'Bengali' },
  ],
  artboards: [
    A('Main.dc.html', 0, 0, 1440, 2020, 'desk', '/home · merchandiser · populated'),
    A('HomeEmpty.dc.html', 1560, 0, 1440, 900, 'desk', '/home · empty (Test Textile)'),
    A('Orders.dc.html', 3120, 0, 1440, 1160, 'desk', '/orders · populated'),
    A('OrdersEmpty.dc.html', 1560, 1120, 1440, 880, 'desk', '/orders · empty'),
    A('OrdersStates.dc.html', 3120, 1400, 1440, 1000, 'desk', '/orders · loading and error'),
    A('HomePhone.dc.html', 0, 2260, 1400, 920, 'desk', '/home · phone · the three Desk tabs'),
    A('OrderDrawer.dc.html', 1560, 2260, 900, 1060, 'desk', 'drawer · record · an order (720)'),

    A('OrderTna.dc.html', 0, 0, 1440, 1800, 'order', '/orders/[orderId] · TNA · the ripple'),
    A('OrderBreakdown.dc.html', 1560, 0, 1440, 1240, 'order', '/orders/[orderId] · Breakdown · Rev 2 diff'),
    A('OrderLc.dc.html', 3120, 0, 1440, 1200, 'order', '/orders/[orderId] · LC · the conflict'),
    A('OrderDossier.dc.html', 0, 1800, 1440, 2000, 'order', '/orders/[orderId] · Dossier, Files, History'),
    A('OrdersInputs.dc.html', 1560, 1800, 1560, 1080, 'order', '/orders/inputs · the readiness matrix'),

    A('Sampling.dc.html', 0, 0, 1440, 1100, 'sampling', '/sampling · the board by stage'),
    A('SampleDrawer.dc.html', 1560, 0, 1300, 1160, 'sampling', 'drawer · record · a sample'),
    A('SampleFull.dc.html', 0, 1300, 1440, 1320, 'sampling', '/sampling/[sampleId] · requisition'),
    A('SamplingLibraryLoad.dc.html', 1560, 1300, 1560, 1000, 'sampling', '/sampling/library · /sampling/load'),
    A('SamplingMachine.dc.html', 2980, 0, 1300, 1100, 'sampling', 'the 14 transitions, and the control for each'),

    A('Memory.dc.html', 0, 0, 1440, 1240, 'memory', '/memory · populated · the close-out note'),
    A('SimilarStyles.dc.html', 1560, 0, 1300, 1000, 'memory', 'drawer · similar styles'),
    A('Adjacent.dc.html', 0, 1440, 1560, 1240, 'memory', '/planning · /shipment · /approve · /refused · /marbim'),

    A('F1.dc.html', 0, 0, 2260, 880, 'flows', 'F1 · booking an order off the paper'),
    A('F2.dc.html', 2380, 0, 2260, 900, 'flows', 'F2 · a slip and what it costs'),
    A('F3.dc.html', 0, 1100, 1820, 880, 'flows', 'F3 · the buyer changes their mind'),
    A('F4.dc.html', 1940, 1100, 2260, 900, 'flows', 'F4 · a sample becomes a cutting release'),
    A('F5.dc.html', 0, 2200, 1820, 860, 'flows', 'F5 · close-out and the next quotation'),

    A('BengaliOrders.dc.html', 0, 0, 1440, 1180, 'bengali', '/orders and the order drawer · bn'),
  ],
  annotations: [
    { id: 'brief-desk', page: 'desk', x: 0, y: -240, w: 660,
      text: 'S8 — Merchandiser, part 1: orders, sampling, memory.\n\nThe busiest desk in the factory, and the one whose screens are read at a desk rather than standing up. Thirteen rail entries, four of them somebody else’s.\n\nMilestones group by DAY, not by order: a merchandiser’s week is a calendar, and an order-shaped list makes them re-sort it every morning.' },
    { id: 'brief-order', page: 'order', x: 0, y: -220, w: 660,
      text: 'An order is one of the three records too big for a drawer.\n\nThe drawer is still where a merchandiser starts — five tabs and the next milestone’s action — and “Open full page” is the second click the contract allows.\n\nEvery date change goes through the ripple preview first. The preview and the write run the same computation, so they cannot disagree.' },
    { id: 'brief-sampling', page: 'sampling', x: 0, y: -220, w: 660,
      text: 'The audit’s friction, closed: the sample drawer names the TNA milestone it gates and links to it.\n\nA PP verdict is the highest-consequence write in the module — three words on a comment sheet that are a floor apart in meaning — so the verdict control says what each one does before it is pressed.\n\nThe machine’s fourteen transitions are drawn as a table so a later session can check the drawer against the machine.' },
    { id: 'brief-memory', page: 'memory', x: 0, y: -200, w: 640,
      text: 'Memory is not an archive; it is what the next quotation should know.\n\nEach row is a sentence somebody wrote at close-out, never a computed summary — a generated one would say “shipped on time” and lose the sleeve comment that is the actual lesson.' },
    { id: 'brief-flows', page: 'flows', x: 0, y: -200, w: 640,
      text: 'Five flows, one artboard each.\n\nF2 is the one to walk with a merchandiser: recording that fabric arrived four days late is not asking to move the ship date, but it does move, and the preview is what lets them see by how much before committing.' },
  ],
  launch: { view: 'canvas', page: 'desk' },
}

writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2))
made.push('canvas.json')

writeFileSync(join(OUT, '.made'), made.join('\n'))
console.log('emitted', made.length + ':', made.join(' '))
