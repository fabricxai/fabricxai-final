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
  it('11 · defines every key in every locale', () => {
    // A key present in English and absent in Bangla is not a compile error and not a
    // runtime error — it is a Bangla reader quietly getting English forever.
    const english = Object.keys(MESSAGES.en).sort()

    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(english)
    }
  })

  it('12 · uses the same placeholders in every locale', () => {
    // A translation that drops {daysLeft} silently loses the only number in the sentence.
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

    for (const key of Object.keys(MESSAGES.en)) {
      for (const locale of LOCALES) {
        expect(placeholders(MESSAGES[locale][key]!)).toEqual(placeholders(MESSAGES.en[key]!))
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

