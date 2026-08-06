/**
 * The chrome has words in both languages (plan 4.2).
 *
 * Twelve floor routes read Bangla and every sidebar label was an English literal, so a
 * Bangla-only worker could read their screen and not the link to it. The labels now come
 * from `ui.nav.*` / `ui.role.*`, keyed on the NAV entry's own id — which moves the failure
 * from "an English word in a Bangla sidebar" to "the string `ui.nav.orders` in a sidebar",
 * and that is only an improvement if something fails first.
 *
 * `i18n-ui.test.ts` cannot do it. Its scan for asked-for keys matches string literals, and
 * these are built as `ui.nav.${item.id}` — invisible to a regex, by construction. So the
 * check has to come from the other direction: walk the registry, and demand the copy.
 */
import { describe, expect, it } from 'vitest'

import {
  NAV,
  NAV_SECTIONS,
  ROLE_LABEL,
  describeRoles,
  lockedSubject,
  navLabelKey,
  navLockedKey,
  navSectionKey,
  roleLabelKey,
} from '@/components/shell/nav'
import { LOCALES } from '@/lib/i18n'
import { UI_MESSAGES, translator } from '@/lib/i18n-ui'
import type { Role } from '@/modules/core/ctx'

/** Every key the chrome resolves at runtime, from the registry rather than from a list. */
const KEYS = [
  ...NAV.map((item) => navLabelKey(item.id)),
  ...NAV.map((item) => navLockedKey(item.id)),
  ...NAV_SECTIONS.map((section) => navSectionKey(section.id)),
  ...(Object.keys(ROLE_LABEL) as Role[]).map(roleLabelKey),
  'ui.nav.modules_aria',
  'ui.nav.module_hit',
  'ui.nav.no_role',
  'ui.nav.roles_and',
  'ui.nav.search_placeholder',
  'ui.nav.this_screen',
  'ui.nav.this_factory',
]

describe('every entry in the registry has copy', () => {
  it.each(LOCALES)('%s', (locale) => {
    const missing = KEYS.filter((key) => UI_MESSAGES[locale][key] === undefined)

    expect(
      missing,
      `a route or role added without its ${locale} copy renders its own key in the sidebar:\n${missing.join('\n')}`,
    ).toEqual([])
  })
})

describe('the English catalogue and the registry agree', () => {
  /*
   * The label lives twice — as data on the NAV entry and as English in the catalogue —
   * because the data is what `access.test.ts` asserts and what a caller outside a request
   * falls back to. Two copies that must match, with a test that fails when they stop, beats
   * one copy that renders as `ui.nav.orders` the day somebody mistypes an id.
   */
  it('says the same thing about every nav item', () => {
    const drifted = NAV.filter(
      (item) => UI_MESSAGES.en[navLabelKey(item.id)] !== item.label,
    ).map((item) => `${item.id}: "${item.label}" vs "${UI_MESSAGES.en[navLabelKey(item.id)]}"`)

    expect(drifted, `nav label and catalogue disagree:\n${drifted.join('\n')}`).toEqual([])
  })

  it('says the same thing about every section and role', () => {
    for (const section of NAV_SECTIONS) {
      expect(UI_MESSAGES.en[navSectionKey(section.id)], section.id).toBe(section.label)
    }
    for (const [role, label] of Object.entries(ROLE_LABEL)) {
      expect(UI_MESSAGES.en[roleLabelKey(role as Role)], role).toBe(label)
    }
  })

  it('names the locked subject the same way it always did', () => {
    // `role-gates.integration.test.ts` asserts the rendered sentence — "have access to the
    // owner dashboard" — so the English side of the new key has to be word-for-word what
    // the untranslated path produces, or that suite fails for a copy reason.
    const en = translator('en')
    const drifted = NAV.filter((item) => lockedSubject(item, en) !== lockedSubject(item)).map(
      (item) => `${item.id}: "${lockedSubject(item)}" vs "${lockedSubject(item, en)}"`,
    )

    expect(drifted, `locked subject drifted:\n${drifted.join('\n')}`).toEqual([])
  })
})

describe('roles read as a phrase in both languages', () => {
  it('joins with the language’s own conjunction, not with "and"', () => {
    // The join is copy, not punctuation. Bangla uses ও, and a template literal here would
    // have produced "স্টোরকিপার and কোয়ালিটি" — a sentence in neither language.
    const bn = translator('bn')

    expect(describeRoles(['store', 'quality'], bn)).toBe('স্টোরকিপার ও কোয়ালিটি')
    expect(describeRoles(['owner', 'hr', 'finance'], bn)).toBe('ওনার, HR ও ফাইন্যান্স')
  })

  it('says "no role" rather than an empty line', () => {
    const bn = translator('bn')

    expect(describeRoles([], bn)).toBe('কোনো রোল নেই')
    expect(describeRoles([], bn).trim()).toBeTruthy()
  })

  it('still answers in English with no translator at all', () => {
    // The path a job or a script takes. It must not render a raw key at somebody.
    expect(describeRoles(['store'])).toBe('Storekeeper')
    expect(describeRoles(['store', 'quality'])).toBe('Storekeeper and Quality')
    expect(describeRoles(['owner', 'hr', 'finance'])).toBe('Owner, HR and Finance')
    expect(describeRoles([])).toBe('No role')
  })
})
