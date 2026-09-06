/**
 * The rail and the top bar.
 *
 * NAV is a verbatim transcription of src/components/shell/nav.ts — id, label, href,
 * section, and the two role lists. The per-role rails below are what `visibleNav()`
 * actually returns for a woven factory with the copilot on; they were computed by
 * running the real function, not eyeballed. Counts: owner/admin 25, merchandiser 13,
 * production 7 (+6 trimmed by railHiddenFor into "More").
 */
import { SANS, MONO, BANGLA } from './_kit.mjs'

export const NAV = [
  { id: 'home', label: 'Your work', bn: 'আপনার কাজ', href: '/home', section: 'work' },
  { id: 'approve', label: 'Approve inbox', bn: 'অ্যাপ্রুভ ইনবক্স', href: '/approve', section: 'work' },
  { id: 'marbim', label: 'MARBIM', bn: 'MARBIM', href: '/marbim', section: 'work' },
  { id: 'orders', label: 'Order desk & TNA', bn: 'অর্ডার ডেস্ক ও TNA', href: '/orders', section: 'work' },
  { id: 'memory', label: 'Order memory', bn: 'অর্ডার মেমোরি', href: '/memory', section: 'work' },
  { id: 'sampling', label: 'Sampling room', bn: 'স্যাম্পল রুম', href: '/sampling', section: 'work' },
  { id: 'buyers', label: 'Buyer & lead desk', bn: 'বায়ার ও লিড ডেস্ক', href: '/buyers', section: 'commercial' },
  { id: 'rfq', label: 'RFQ & quotation', bn: 'RFQ ও কোটেশন', href: '/rfq', section: 'commercial' },
  { id: 'costing', label: 'Costing studio', bn: 'কস্টিং স্টুডিও', href: '/costing', section: 'commercial' },
  { id: 'lcs', label: 'LC register', bn: 'LC রেজিস্টার', href: '/lcs', section: 'commercial' },
  { id: 'finance', label: 'Commercial finance', bn: 'কমার্শিয়াল ফাইন্যান্স', href: '/finance', section: 'commercial' },
  { id: 'procurement', label: 'Procurement', bn: 'প্রকিউরমেন্ট', href: '/procurement', section: 'commercial' },
  { id: 'planning', label: 'Planning board', bn: 'প্ল্যানিং বোর্ড', href: '/planning', section: 'floor' },
  { id: 'store', label: 'Store', bn: 'স্টোর', href: '/store', section: 'floor' },
  { id: 'ud', label: 'UD workbench', bn: 'UD ওয়ার্কবেঞ্চ', href: '/ud', section: 'floor' },
  { id: 'cutting', label: 'Cutting', bn: 'কাটিং', href: '/cutting', section: 'floor' },
  { id: 'lines', label: 'Line tracking', bn: 'লাইন ট্র্যাকিং', href: '/lines', section: 'floor' },
  { id: 'quality', label: 'Quality', bn: 'কোয়ালিটি', href: '/quality', section: 'floor' },
  { id: 'shipment', label: 'Shipment', bn: 'শিপমেন্ট', href: '/shipment', section: 'floor' },
  { id: 'maintenance', label: 'Maintenance', bn: 'মেইনটেন্যান্স', href: '/maintenance', section: 'floor' },
  { id: 'workforce', label: 'Workforce & payroll', bn: 'কর্মী ও পে-রোল', href: '/workforce', section: 'oversight' },
  { id: 'compliance', label: 'Compliance', bn: 'কমপ্লায়েন্স', href: '/compliance', section: 'oversight' },
  { id: 'refused', label: 'Refused writes', bn: 'রিফিউজড রাইটস', href: '/refused', section: 'oversight' },
  { id: 'setup', label: 'Factory setup', bn: 'কারখানার সেটআপ', href: '/setup', section: 'system' },
  { id: 'settings', label: 'Settings', bn: 'সেটিংস', href: '/settings', section: 'system' },
]

export const SECTIONS = [
  { id: 'work', label: 'Work', bn: 'কাজ' },
  { id: 'commercial', label: 'Commercial', bn: 'কমার্শিয়াল' },
  { id: 'floor', label: 'Floor', bn: 'ফ্লোর' },
  { id: 'oversight', label: 'Oversight', bn: 'তদারকি' },
  { id: 'system', label: 'System', bn: 'সিস্টেম' },
]

const item = (id) => NAV.find((n) => n.id === id)

/** visibleNav(['owner'], 'woven') — 25. `dashboard`, `alerts`, `factory` are hiddenFromSidebar. */
export const RAILS = {
  owner: {
    phrase: 'Owner', count: 25,
    ids: ['home', 'approve', 'marbim', 'orders', 'memory', 'sampling', 'buyers', 'rfq', 'costing',
          'lcs', 'finance', 'procurement', 'planning', 'store', 'ud', 'cutting', 'lines', 'quality',
          'shipment', 'maintenance', 'workforce', 'compliance', 'refused', 'setup', 'settings'],
    readOnly: [],
  },
  merchandiser: {
    phrase: 'Merchandiser', count: 13,
    ids: ['home', 'approve', 'marbim', 'orders', 'memory', 'sampling', 'buyers', 'rfq', 'costing',
          'planning', 'shipment', 'refused', 'settings'],
    readOnly: ['home', 'marbim', 'refused', 'settings'],
  },
  production: {
    phrase: 'Production', count: 7,
    ids: ['approve', 'marbim', 'cutting', 'lines', 'maintenance', 'refused', 'settings'],
    readOnly: ['marbim', 'refused', 'settings'],
    more: ['orders', 'sampling', 'planning', 'store', 'quality', 'setup'],
  },
  store: {
    phrase: 'Storekeeper', count: 9,
    ids: ['home', 'approve', 'marbim', 'procurement', 'store', 'ud', 'refused', 'setup', 'settings'],
    readOnly: ['home', 'marbim', 'refused', 'settings'],
  },
}

/* ── Glyphs, transcribed from src/components/shell/nav-icons.tsx ───────────── */

const G = (d) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink: 0; display: block;"><g stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${d}</g></svg>`

export const ICON = {
  home: G('<path d="M3 3.5h10v10H3z"/><path d="M5.5 6.5h5"/><path d="M5.5 9h3.5"/><path d="M5.5 11.5h4"/>'),
  approve: G('<path d="M2 5.5h12v7H2z"/><path d="M2 5.5l6 4 6-4"/>'),
  marbim: G('<path d="M3.5 3.5l9 9"/><path d="M12.5 3.5l-9 9"/>'),
  orders: G('<rect x="2.5" y="3.5" width="11" height="10"/><path d="M2.5 6.5h11"/><path d="M5.5 2v3"/><path d="M10.5 2v3"/>'),
  memory: G('<path d="M4 4.5h9v8H4z"/><path d="M2.5 3h9"/><path d="M2.5 3v8"/>'),
  sampling: G('<path d="M5 2.5h6l1.5 3.5H3.5L5 2.5z"/><path d="M3.5 6v7.5h9V6"/><path d="M8 9v4.5"/>'),
  buyers: G('<circle cx="8" cy="5" r="2.25"/><path d="M3.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>'),
  rfq: G('<path d="M4 2.5h6l3 3V13.5H4z"/><path d="M10 2.5V5.5h3"/><path d="M6 8.5h4"/><path d="M6 11h3"/>'),
  costing: G('<rect x="3" y="2.5" width="10" height="11"/><path d="M3 6h10"/><path d="M6 8.5h1.5M8.5 8.5H10M6 11h1.5M8.5 11H10"/>'),
  lcs: G('<rect x="2" y="4" width="12" height="8"/><circle cx="8" cy="8" r="1.75"/><path d="M4 6h1.5M10.5 10H12"/>'),
  finance: G('<path d="M2.5 13.5V5l4-2.5 3 2 4-2v11"/><path d="M2.5 13.5h11"/><path d="M6.5 7v6.5M9.5 8.5V13.5"/>'),
  procurement: G('<path d="M2.5 3.5h2l1.5 7h7l1.5-5H6"/><circle cx="7.5" cy="13" r="1"/><circle cx="12" cy="13" r="1"/>'),
  planning: G('<rect x="2.5" y="2.5" width="11" height="11"/><path d="M6.5 2.5v11M9.5 2.5v11M2.5 6.5h11M2.5 9.5h11"/>'),
  store: G('<path d="M2.5 4h11v2.5H2.5z"/><path d="M3.5 6.5v6.5h9V6.5"/><path d="M2.5 10h11"/>'),
  ud: G('<path d="M8 2.5l5 2.5v4c0 3-2.2 4.8-5 5.5-2.8-.7-5-2.5-5-5.5V5z"/><path d="M5.5 8l2 2 3.5-3.5"/>'),
  cutting: G('<circle cx="4.5" cy="4.5" r="2"/><circle cx="4.5" cy="11.5" r="2"/><path d="M6 5.5l7.5-3M6 10.5l7.5 3M6 5.5l0 5"/>'),
  lines: G('<path d="M2 5h12"/><path d="M2 8h12"/><path d="M2 11h12"/><path d="M5 5v6M11 5v6"/>'),
  quality: G('<circle cx="8" cy="8" r="5.5"/><path d="M5.5 8.2l1.8 1.8 3.5-4"/>'),
  shipment: G('<path d="M2.5 4.5h7v7h-7z"/><path d="M9.5 7h3l1.5 2v2.5h-4.5"/><circle cx="5" cy="12.5" r="1.25"/><circle cx="12" cy="12.5" r="1.25"/>'),
  maintenance: G('<path d="M10.5 2.5a3 3 0 00-3.8 3.8L3 10l3 3 3.7-3.7a3 3 0 003.8-3.8L11 7.5 10.5 2.5z"/>'),
  workforce: G('<circle cx="6" cy="5" r="2"/><circle cx="11" cy="6" r="1.5"/><path d="M2.5 13c0-2 1.6-3.5 3.5-3.5S9.5 11 9.5 13"/><path d="M9.5 13c.3-1.4 1.4-2.5 3-2.5 1.2 0 2.2.6 2.7 1.5"/>'),
  compliance: G('<path d="M5 3.5h6v11H5z"/><path d="M6.5 2.5h3v2h-3z"/><path d="M6.5 7.5h3M6.5 10h3"/>'),
  settings: G('<circle cx="8" cy="8" r="2.25"/><path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.1 4.1l1.4 1.4M10.5 10.5l1.4 1.4M11.9 4.1l-1.4 1.4M5.5 10.5l-1.4 1.4"/>'),
  // nav-icons.tsx has no glyph for these four — the fallback dash is drawn, not invented.
  refused: G('<path d="M4 8h8"/>'),
  setup: G('<path d="M4 8h8"/>'),
}

/* ── The rail ──────────────────────────────────────────────────────────────── */

function link(n, { active = false, badge = 0, bangla = false, muted = false }) {
  return `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 36px; border-radius: 8px; font: 500 14px/1.2 ${SANS}; background: ${active ? 'var(--fx-bg-selected)' : 'transparent'}; color: ${active ? 'var(--fx-text-primary)' : muted ? 'var(--fx-text-tertiary)' : 'var(--fx-text-secondary)'};">
      <span style="width: 2px; height: 15px; flex-shrink: 0; transform: skewX(-34deg); background: ${active ? 'var(--fx-accent)' : 'transparent'};"></span>
      ${ICON[n.id] ?? ICON.refused}
      <span style="flex: 1; min-width: 0;">${bangla ? n.bn : n.label}</span>
      ${badge > 0 ? `<span style="display: inline-block; font: 500 11px/1 ${MONO}; letter-spacing: .05em; color: var(--fx-accent-on); background: var(--fx-accent-subtle); border: 1px solid transparent; border-radius: 4px; padding: 5px 8px;">${badge}</span>` : ''}
    </div>`
}

/* Bengali has no case and matra clusters break at negative tracking, so the mono-caps
   treatment is dropped rather than transliterated into a shout. */
const sectionHead = (label, bangla = false) =>
  bangla
    ? `<div style="font: 500 12px/1.4 ${BANGLA}; letter-spacing: 0; color: var(--fx-text-tertiary); padding: 0 12px 8px;">${label}</div>`
    : `<div style="font: 500 11px/1 ${MONO}; letter-spacing: .09em; text-transform: uppercase; color: var(--fx-text-tertiary); padding: 0 12px 8px;">${label}</div>`

/**
 * @param role      key into RAILS
 * @param active    nav id carrying the amber slash
 * @param collapsed section ids drawn as a closed directory row (owner's 25 do not fit a
 *                  desk screen expanded — the runbook's "rail is a directory")
 */
export function rail(role, { active, collapsed = [], badges = {}, bangla = false, height } = {}) {
  const spec = RAILS[role]
  const shown = new Set(spec.ids)
  const groups = SECTIONS.map((s) => ({
    ...s,
    items: NAV.filter((n) => n.section === s.id && shown.has(n.id)),
  })).filter((g) => g.items.length > 0)

  const body = groups.map((g) => {
    if (collapsed.includes(g.id)) {
      return `<div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="display: flex; align-items: center; gap: 8px; padding: 4px 12px 8px; cursor: pointer;">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink: 0;"><path d="M3 1.5L6.5 5 3 8.5" stroke="var(--fx-text-tertiary)" stroke-width="1.5"/></svg>
          <span style="font: ${bangla ? `500 12px/1.4 ${BANGLA}; letter-spacing: 0` : `500 11px/1 ${MONO}; letter-spacing: .09em; text-transform: uppercase`}; color: var(--fx-text-tertiary); flex: 1;">${bangla ? g.bn : g.label}</span>
          <span data-numeric style="font: 400 11px/1 ${MONO}; color: var(--fx-text-disabled);">${g.items.length}</span>
        </div>
      </div>`
    }
    return `<div style="display: flex; flex-direction: column; gap: 2px;">
      ${sectionHead(bangla ? g.bn : g.label, bangla)}
      ${g.items.map((n) => link(n, { active: n.id === active, badge: badges[n.id] ?? 0, bangla })).join('\n      ')}
    </div>`
  }).join('\n    ')

  const more = spec.more
    ? `<div style="display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--fx-border-subtle); padding-top: 14px;">
      ${sectionHead(bangla ? 'আরও' : 'More', bangla)}
      <div style="font: 400 12px/1.5 ${bangla ? BANGLA : SANS}; color: var(--fx-text-tertiary); padding: 0 12px 8px; text-wrap: pretty;">${bangla ? 'আপনি খুলতে পারেন, তবে রোজকার তালিকা থেকে সরানো।' : 'Yours to open, trimmed from the daily scan.'}</div>
      ${spec.more.map((id) => link(NAV.find((n) => n.id === id), { muted: true, bangla })).join('\n      ')}
    </div>`
    : ''

  return `<nav style="width: 232px; flex-shrink: 0; ${height ? `height: ${height}px;` : ''} border-right: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); padding: 20px 12px; display: flex; flex-direction: column; gap: 22px; overflow: hidden;">
    ${body}
    ${more}
  </nav>`
}

/* ── The top bar ───────────────────────────────────────────────────────────── */

export function topBar(t, { factory = 'Barakah Fashions Ltd', initials = 'BF', phrase = 'Owner', who = 'MR', mark, bangla = false, search }) {
  return `<header style="height: 60px; flex-shrink: 0; border-bottom: 1px solid var(--fx-border-subtle); background: var(--fx-bg-surface); display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 420px) minmax(0, 1fr); align-items: center; gap: 16px; padding: 0 24px;">
    <div style="display: flex; align-items: center; gap: 16px; min-width: 0;">
      <img src="${t.lockup}" alt="FabricX AI" style="height: 26px; width: auto; display: block;" />
      <span style="display: inline-flex; align-items: center; gap: 10px; padding: 5px 12px 5px 5px; border-radius: 8px; border: 1px solid var(--fx-border-default); background: var(--fx-bg-sunken); color: var(--fx-text-primary);">
        <span style="width: 32px; height: 32px; border-radius: 4px; background: var(--fx-text-primary); color: var(--fx-text-inverse); display: inline-flex; align-items: center; justify-content: center; font: 700 12px/1 ${SANS}; letter-spacing: .04em; flex-shrink: 0;">${initials}</span>
        <span style="font: 600 14px/1.2 ${SANS}; white-space: nowrap;">${factory}</span>
      </span>
    </div>
    <div style="justify-self: center; width: 100%;">
      <div style="display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--fx-border-default); background: var(--fx-bg-sunken); color: var(--fx-text-tertiary); font: 400 13px/1 ${bangla ? "'Anek Bangla', sans-serif" : SANS};">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5"/></svg>
        ${search ?? 'Search modules, orders, buyers…'}
      </div>
    </div>
    <div style="justify-self: end; display: flex; align-items: center; gap: 14px; min-width: 0;">
      <button style="display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--fx-border-default); background: var(--fx-bg-surface); color: var(--fx-text-secondary); font: 500 12.5px/1 ${SANS}; cursor: pointer;">
        ${mark}Ask MARBIM
      </button>
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--fx-border-subtle); font: 500 13px/1 ${MONO}; color: var(--fx-text-tertiary);">?</span>
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--fx-border-subtle); color: var(--fx-text-tertiary);">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z" stroke="currentColor" stroke-width="1.4"/></svg>
      </span>
      <span style="display: flex; align-items: center; gap: 8px;">
        <span style="font: 500 11px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase; color: var(--fx-text-tertiary); white-space: nowrap;">${phrase}</span>
        <span style="width: 30px; height: 30px; border-radius: 999px; background: var(--fx-bg-sunken); border: 2px solid var(--fx-bg-surface); display: inline-flex; align-items: center; justify-content: center; font: 600 11px/1 ${SANS}; color: var(--fx-text-secondary);">${who}</span>
      </span>
    </div>
  </header>`
}

/** h1 + optional eyebrow, closed by the accent thread rule. Once per page. */
export function pageHeader({ eyebrow: eb, title, meta, actions, ownsAmber = true, bangla = false }) {
  return `<div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
    <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap;">
      <div style="display: flex; flex-direction: column; gap: 8px; min-width: 0;">
        ${eb ? `<div style="font: ${bangla ? `400 13px/1.5 ${BANGLA}; letter-spacing: 0` : `400 12px/1 ${MONO}; letter-spacing: .06em; text-transform: uppercase`}; color: var(--fx-text-tertiary);">${eb}</div>` : ''}
        <h1 style="font: ${bangla ? '600' : '700'} 34px/${bangla ? '1.35' : '1.15'} ${bangla ? BANGLA : SANS}; letter-spacing: ${bangla ? '0' : '-0.02em'}; margin: 0; color: var(--fx-text-primary);">${title}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
        ${meta ? `<span style="font: 400 13px/1.5 ${MONO}; color: var(--fx-text-secondary);">${meta}</span>` : ''}
        ${actions ?? ''}
      </div>
    </div>
    <div class="fx-thread-rule" data-variant="${ownsAmber ? 'accent' : 'muted'}"></div>
  </div>`
}
