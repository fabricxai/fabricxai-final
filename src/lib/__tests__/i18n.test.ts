/**
 * i18n resolver — vectors written before the implementation.
 *
 * This is the layer between a notification row and a human, so its failure modes are all of
 * the shape "the message went out looking wrong and nobody knew":
 *
 *  - a missing key must be VISIBLE, not silently blank. An empty subject line reads as a
 *    broken mail server; the key itself reads as a missing translation, which is what it is.
 *  - a missing Bangla string falls back to English rather than to nothing. A floor
 *    supervisor reading English is inconvenienced; one reading an empty alert is not
 *    informed at all.
 *  - an unsupplied parameter is never rendered as "undefined". `{daysLeft}` with no value is
 *    a bug in the caller, and printing "expires in undefined days" turns it into a bug the
 *    reader has to interpret.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
  missingKeys,
  resolveLocale,
  t,
} from '../i18n'

describe('t · resolving a key', () => {
  it('1 · renders a known key in the requested locale', () => {
    expect(t('en', 'notifications.system.welcome.title')).toBe(
      MESSAGES.en['notifications.system.welcome.title'],
    )
    expect(t('bn', 'notifications.system.welcome.title')).toBe(
      MESSAGES.bn['notifications.system.welcome.title'],
    )
  })

  it('2 · interpolates parameters by name', () => {
    const rendered = t('en', 'maintenance.notifications.parts_low.title', {
      name: 'Looper',
      onHand: 0,
      minLevel: 5,
    })
    expect(rendered).toContain('Looper')
    expect(rendered).not.toContain('{name}')
  })

  it('3 · falls back to English when a Bangla string is missing', () => {
    // Inconvenient for a Bangla reader; an empty alert would be no alert at all.
    const key = 'notifications.system.test.title'
    const sparse = { en: { [key]: 'Test alert' }, bn: {} }
    expect(t('bn', key, {}, sparse)).toBe('Test alert')
  })

  it('4 · returns the KEY itself when nothing has it', () => {
    // An empty subject reads as a broken mail server. The key reads as a missing
    // translation, which is exactly what it is, and is greppable.
    expect(t('en', 'nothing.defines.this.key')).toBe('nothing.defines.this.key')
  })

  it('5 · leaves an unsupplied placeholder visible rather than printing undefined', () => {
    const sparse = { en: { 'x.y': 'expires in {daysLeft} days' }, bn: {} }
    // "expires in undefined days" is a bug the reader has to interpret. "{daysLeft}" is a
    // bug the developer can see.
    expect(t('en', 'x.y', {}, sparse)).toBe('expires in {daysLeft} days')
  })

  it('6 · renders a zero, which is a real value', () => {
    const sparse = { en: { 'x.y': '{onHand} left' }, bn: {} }
    expect(t('en', 'x.y', { onHand: 0 }, sparse)).toBe('0 left')
  })

  it('7 · renders the same placeholder twice', () => {
    const sparse = { en: { 'x.y': '{kind}: the {kind} has lapsed' }, bn: {} }
    expect(t('en', 'x.y', { kind: 'fire' }, sparse)).toBe('fire: the fire has lapsed')
  })

  it('8 · does not interpolate a value that itself looks like a placeholder', () => {
    // A buyer literally called "{name}" is absurd, but a machine serial or a note pasted
    // from elsewhere is not, and one substitution pass must not become two.
    const sparse = { en: { 'x.y': '{a} and {b}' }, bn: {} }
    expect(t('en', 'x.y', { a: '{b}', b: 'second' }, sparse)).toBe('{b} and second')
  })
})

describe('resolveLocale · what a user reads', () => {
  it('9 · accepts a supported locale', () => {
    expect(resolveLocale('bn')).toBe('bn')
  })

  it('10 · falls back to the default for anything else', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE)
  })
})

describe('the catalogue itself', () => {
  /**
   * Refusal copy still awaiting Bangla — enumerated, not computed (plan 4.3).
   *
   * It used to be derived: "every refusal key with no Bangla". That made the carve-out
   * self-fulfilling. Adding a new untranslated refusal grew the exemption and the suite
   * stayed green, so the one number that says how far this work has to go could only rise,
   * silently, and nothing anywhere would say so.
   *
   * Listing them turns it into a ratchet. A new untranslated refusal fails, because it is
   * not here. A translated one still listed fails too, because a note that is no longer
   * true is worse than no note. The list can only shrink.
   *
   * **Why any of them are English at all.** These are read by storekeepers and mechanics,
   * and a confident mistranslation of why a bonded issue was refused is worse than English
   * somebody can escalate. `t()` falls back to English — documented behaviour, not an
   * accident. What is NOT acceptable is not knowing which ones.
   *
   * **Nothing here is floor-reachable.** The floor namespaces (store, cutting, production,
   * quality, sampling, shipment, maintenance) are at full parity, and so are all thirty
   * `gates.*` blocks — a blocked gate is the refusal that stops somebody's work mid-task,
   * and 11f is what keeps it that way. What remains is desk copy: a merchandiser, a
   * commercial officer or an owner, reading it at a keyboard.
   */
  const AWAITING_BANGLA: readonly string[] = [
  'approvals.errors.auto_approve_needs_floor',
  'approvals.errors.draft_not_found',
  'approvals.errors.no_required_roles',
  'approvals.errors.rules_are_owner_only',

  'buyers.errors.buyer_not_found',
  'buyers.errors.invalid',
  'buyers.errors.lead_is_lost',
  'buyers.errors.lead_not_found',
  'buyers.errors.lost_needs_reason',
  'buyers.errors.terms_backdated',
  'buyers.errors.terms_draft_insert_only',

  'commercial.errors.bank_docs_invalid',
  'commercial.errors.btb_currency_mismatch',
  'commercial.errors.charge_needs_parent',
  'commercial.errors.discrepancy_needs_notes',
  'commercial.errors.invalid_period',
  'commercial.errors.lc_not_amendable',
  'commercial.errors.lc_not_found',
  'commercial.errors.lc_number_exists',
  'commercial.errors.no_btb_limit',
  'commercial.errors.no_invoiced_amount',
  'commercial.errors.reconciliation_exists',
  'commercial.errors.shipment_not_found',
  'commercial.errors.shortfall_needs_reason',
  'commercial.errors.submission_not_found',
  'commercial.errors.submitted_needs_date',
  'commercial.errors.ud_draft_insert_only',
  'commercial.errors.ud_items_invalid',
  'commercial.errors.ud_not_found',
  'commercial.errors.ud_not_short',
  'commercial.errors.ud_number_exists',

  'compliance.errors.audit_not_found',
  'compliance.errors.cap_closed',
  'compliance.errors.cap_not_found',
  'compliance.errors.empty_evidence',
  'compliance.errors.finding_not_found',
  'compliance.errors.invalid',
  'compliance.errors.not_a_closer',
  'compliance.errors.self_certification',

  'costing.errors.below_floor_needs_owner',
  'costing.errors.bom_not_found',
  'costing.errors.no_approved_sheet',
  'costing.errors.no_bom_for_style',
  'costing.errors.sheet_not_found',
  'costing.errors.sheet_stale',
  'costing.errors.sheet_uncomputable',
  'costing.errors.template_not_found',

  'finance.errors.no_accrual',
  'finance.errors.no_margin_basis',
  'finance.errors.order_not_found',
  'finance.errors.payable_already_settled',
  'finance.errors.payable_not_found',
  'finance.errors.pieces_required',
  'finance.errors.receivable_already_settled',
  'finance.errors.receivable_not_found',
  'finance.errors.uncomputable',

  'marbim.errors.context_required',
  'marbim.errors.context_unknown',
  'marbim.errors.invalid',
  'marbim.errors.job_not_found',
  'marbim.errors.job_rejected',
  'marbim.errors.rate_limited',
  'marbim.errors.target_not_registered',
  'marbim.errors.unknown_intake_kind',
  'marbim.errors.unknown_module',

  'memory.errors.embedding_width',
  'memory.errors.empty_source_bom',
  'memory.errors.invalid',
  'memory.errors.no_fingerprint',
  'memory.errors.no_outcome',
  'memory.errors.no_source_bom',
  'memory.errors.note_window_closed',
  'memory.errors.order_not_found',
  'memory.errors.outcome_not_found',
  'memory.errors.rfq_not_found',
  'memory.errors.source_style_not_found',

  'orders.errors.breakdown_outside_tolerance',
  'orders.errors.buyer_not_found',
  'orders.errors.duplicate_breakdown_cell',
  'orders.errors.milestone_already_actualized',
  'orders.errors.milestone_not_found',
  'orders.errors.no_styles',
  'orders.errors.order_not_found',
  'orders.errors.po_draft_insert_only',
  'orders.errors.style_not_found',
  'orders.errors.template_invalid',
  'orders.errors.template_not_found',
  'orders.errors.tna_template_unschedulable',

  'planning.errors.allocation_done',
  'planning.errors.allocation_not_found',
  'planning.errors.line_inactive',
  'planning.errors.line_not_found',
  'planning.errors.no_manpower',
  'planning.errors.no_shift_for_day',
  'planning.errors.no_smv',
  'planning.errors.scenario_empty',
  'planning.errors.scenario_no_longer_fits',
  'planning.errors.scenario_not_found',
  'planning.errors.smv_draft_insert_only',
  'planning.errors.uncomputable',

  'procurement.errors.no_btb_limit',
  'procurement.errors.no_quotes',
  'procurement.errors.po_line_not_found',
  'procurement.errors.po_not_found',
  'procurement.errors.pr_draft_insert_only',
  'procurement.errors.pr_line_not_found',
  'procurement.errors.pr_no_exists',
  'procurement.errors.pr_not_found',
  'procurement.errors.quote_draft_insert_only',
  'procurement.errors.supplier_code_exists',
  'procurement.errors.supplier_draft_insert_only',
  'procurement.errors.supplier_inactive',
  'procurement.errors.supplier_not_found',
  'procurement.errors.uncomputable',

  'rfq.errors.below_floor_needs_manager',
  'rfq.errors.below_floor_needs_reason',
  'rfq.errors.buyer_not_found',
  'rfq.errors.clarification_already_answered',
  'rfq.errors.clarification_not_found',
  'rfq.errors.invalid',
  'rfq.errors.no_live_quote',
  'rfq.errors.not_found',
  'rfq.errors.quote_not_draft',
  'rfq.errors.quote_not_found',
  'rfq.errors.sheet_does_not_reconcile',
  'rfq.errors.sheet_has_no_margin_basis',
  'rfq.errors.unknown_loss_reason',

  'settings.errors.disable_needs_note',
  'settings.errors.invalid_policy',
  'settings.errors.last_owner',
  'settings.errors.not_a_member',
  'settings.errors.policy_is_admin_only',
  'settings.errors.role_not_held',

  'workforce.errors.gazette_draft_insert_only',
  'workforce.errors.gazette_has_no_grades',
  'workforce.errors.gazette_not_found',
  'workforce.errors.gazette_superseded',
  'workforce.errors.no_active_gazette',
  'workforce.errors.payroll_compute_failed',
  'workforce.errors.run_not_found',
  'workforce.errors.run_not_recomputable',
  ]

  /** `errors.x`, `module.errors.x`, and the gate blocks — everything a refusal renders. */
  const isRefusal = (key: string) =>
    key.startsWith('errors.') || key.includes('.errors.') || key.startsWith('gates.')

  const untranslated = Object.keys(MESSAGES.en)
    .filter((key) => MESSAGES.bn[key] === undefined)
    .sort()

  it('11 · defines every key in every locale, except the listed refusals', () => {
    // A key present in English and absent in Bangla is not a compile error and not a
    // runtime error — it is a Bangla reader quietly getting English forever.
    const english = Object.keys(MESSAGES.en)
      .filter((key) => !AWAITING_BANGLA.includes(key))
      .sort()

    for (const locale of LOCALES) {
      const defined = Object.keys(MESSAGES[locale])
        .filter((key) => !AWAITING_BANGLA.includes(key))
        .sort()
      expect(defined).toEqual(english)
    }
  })

  it('11b · only refusal copy is allowed to be waiting', () => {
    // The carve-out is for refusals and nothing else. A notification missing its Bangla
    // still fails test 11, because that one is emailed to somebody with no screen to check.
    expect(AWAITING_BANGLA.filter((key) => !isRefusal(key))).toEqual([])
  })

  it('11c · the list only shrinks — a new untranslated key is not exempt', () => {
    // The ratchet. Whoever adds an English-only refusal has to add it here, which is the
    // moment they get to decide whether it is one a Bangla reader will hit.
    const unlisted = untranslated.filter((key) => !AWAITING_BANGLA.includes(key))

    expect(
      unlisted,
      `English-only copy that is not on the list — translate it, or add it with the rest:\n${unlisted.join('\n')}`,
    ).toEqual([])
  })

  it('11d · carries no stale entry', () => {
    // A translated key still listed makes the count a lie, and the count is the only thing
    // anybody reads to decide whether this work is nearly done.
    const stale = AWAITING_BANGLA.filter((key) => MESSAGES.bn[key] !== undefined)

    expect(stale, `now translated — remove from the list:\n${stale.join('\n')}`).toEqual([])
  })

  it('11e · no key on the list still exists only in the imagination', () => {
    // An entry for a key that was deleted or renamed keeps the list from ever reaching
    // zero, and looks like remaining work that nobody can do.
    const phantom = AWAITING_BANGLA.filter((key) => MESSAGES.en[key] === undefined)

    expect(phantom, `on the list but not in the catalogue:\n${phantom.join('\n')}`).toEqual([])
  })

  it('11f · every gate block is bilingual, with no exemption available', () => {
    /*
     * The one hard floor. A gate block is the refusal that stops work mid-task — a cutter
     * told the PP sample is not approved, a storekeeper told the UD has no balance left, a
     * shipment held for a failed final inspection. The person reading it is standing at a
     * table deciding what to do next, and "escalate it" is exactly what the sentence has to
     * make possible.
     *
     * Deliberately not expressible through AWAITING_BANGLA: this asks the catalogue, so a
     * new gate cannot be exempted by adding a line to a list.
     */
    const englishOnly = Object.keys(MESSAGES.en)
      .filter((key) => key.startsWith('gates.') && MESSAGES.bn[key] === undefined)
      .sort()

    expect(
      englishOnly,
      `gate blocks with no Bangla — these are read on the floor:\n${englishOnly.join('\n')}`,
    ).toEqual([])
  })

  it('12 · uses the same placeholders in every locale', () => {
    // A translation that drops {daysLeft} silently loses the only number in the sentence.
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

    for (const key of Object.keys(MESSAGES.en)) {
      for (const locale of LOCALES) {
        const translated = MESSAGES[locale][key]
        if (translated === undefined) continue
        expect(placeholders(translated)).toEqual(placeholders(MESSAGES.en[key]!))
      }
    }
  })

  it('13 · has no empty strings', () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(MESSAGES[locale])) {
        expect(text.trim(), `${locale}/${key}`).not.toBe('')
      }
    }
  })
})

describe('missingKeys · the catalogue is checked against the code', () => {
  it('14 · reports nothing for keys that exist', () => {
    expect(missingKeys(['notifications.system.welcome.title'])).toEqual([])
  })

  it('15 · names the ones that do not', () => {
    expect(missingKeys(['notifications.system.welcome.title', 'not.a.key'])).toEqual(['not.a.key'])
  })
})

/**
 * The catalogue checked against the CODE, not against itself.
 *
 * Every other test here proves the catalogue is internally consistent. This one proves it
 * covers what the system actually emits — the failure it catches is somebody adding a
 * notification and its key never reaching a locale file, which nothing else notices until
 * an email goes out reading `maintenance.notifications.pm_due.title`.
 */
describe('the catalogue covers what the code emits', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path)
      return path.endsWith('.ts') ? [path] : []
    })

  /**
   * Keys built from a template literal cannot be found by reading the source, so their
   * expansions are listed here. Adding a milestone status or an LC countdown label means
   * adding it to this list as well — which is the point: the list is short, and being made
   * to touch it is what stops a new one shipping with no string behind it.
   */
  const DYNAMIC_KEYS = [
    'orders.notifications.milestone_at_risk.title',
    'orders.notifications.milestone_at_risk.body',
    'orders.notifications.milestone_late.title',
    'orders.notifications.milestone_late.body',
    'commercial.notifications.lc_countdown_latest_shipment.title',
    'commercial.notifications.lc_countdown_expiry.title',
    'commercial.lc.conflict.expiry',
    'commercial.lc.conflict.latest_shipment',
    'commercial.lc.conflict.presentation_window',
    'commercial.lc.conflict.unknown_ex_factory',
  ]

  it('16 · every literal titleKey and bodyKey in src/ has a string', () => {
    const literal = new Set<string>()

    for (const path of sourceFiles('src')) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/(?:titleKey|bodyKey):\s*\n?\s*'([\w.]+)'/g)) {
        literal.add(match[1]!)
      }
    }

    // Sanity: if the scan finds nothing, it is broken and this test proves nothing.
    expect(literal.size).toBeGreaterThan(10)
    expect(missingKeys([...literal])).toEqual([])
  })

  it('17 · every key built from a template literal has a string', () => {
    expect(missingKeys(DYNAMIC_KEYS)).toEqual([])
  })
})


describe('every gate refusal has copy behind it', () => {
  it('leaves no gate reason rendering as a dotted key', () => {
    // Twenty-one of twenty-nine had none, so a UD overdraw reached the storekeeper as the
    // literal string `gate_blocked: gates.ud_balance.insufficient` (audit BE-H3). A gate
    // that blocks without saying why is a gate people route around.
    const thrown = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts') && !path.includes('__tests__')) {
          for (const m of readFileSync(path, 'utf8').matchAll(/'(gates\.[a-z_]+\.[a-z_]+)'/g)) {
            thrown.add(m[1]!)
          }
        }
      }
    }
    walk('src/modules')

    const missing = [...thrown].filter((key) => !(key in MESSAGES.en)).sort()
    expect(missing).toEqual([])
  })
})
