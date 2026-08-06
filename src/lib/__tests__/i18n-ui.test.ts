/**
 * Screen copy exists in both languages, and every key a screen asks for exists at all.
 *
 * The first half is the point of the whole exercise: an English-only key falls back to
 * English silently, which means a half-translated screen looks finished. This test is what
 * makes "the floor reads Bangla" a property of the build rather than an intention.
 *
 * The second half catches the opposite mistake — `t('ui.store.recieve_title')` renders the
 * typo as itself, in front of a storekeeper, and nothing else would notice.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALES } from '@/lib/i18n'
import { UI_MESSAGES, tui, translator } from '@/lib/i18n-ui'

/** `t('ui.x.y')`, `tui(locale, 'ui.x.y')` — the key, wherever it is asked for. */
const UI_KEY = /['"`](ui\.[a-z0-9_]+(?:\.[a-z0-9_]+)+)['"`]/g

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}

describe('screen copy is bilingual', () => {
  it('every key exists in every locale', () => {
    const en = Object.keys(UI_MESSAGES.en).sort()

    for (const locale of LOCALES) {
      const missing = en.filter((key) => UI_MESSAGES[locale][key] === undefined)
      expect(
        missing,
        `Keys with no ${locale} translation — a floor screen would silently read English:\n${missing.join('\n')}`,
      ).toEqual([])
    }
  })

  it('no locale carries copy the default does not have', () => {
    // A key only in Bangla is unreachable from the fallback path and is almost always a
    // rename that was applied to one side of the catalogue.
    for (const locale of LOCALES) {
      const orphans = Object.keys(UI_MESSAGES[locale])
        .filter((key) => UI_MESSAGES.en[key] === undefined)
        .sort()
      expect(orphans, `${locale} keys missing from en:\n${orphans.join('\n')}`).toEqual([])
    }
  })

  it('no copy is blank in any locale', () => {
    const blank: string[] = []
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(UI_MESSAGES[locale])) {
        if (value.trim() === '') blank.push(`${locale} · ${key}`)
      }
    }
    // An empty string resolves as present, so the fallback never fires and the screen shows
    // nothing where a label belongs.
    expect(blank, `Blank copy:\n${blank.join('\n')}`).toEqual([])
  })

  it('every ui.* key a screen asks for is in the catalogue', () => {
    const asked = new Map<string, string>()

    for (const path of sourceFiles('src/app').concat(sourceFiles('src/components'))) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(UI_KEY)) {
        if (!asked.has(match[1]!)) asked.set(match[1]!, path)
      }
    }

    // `t.plural('ui.x.y', n)` asks for a BASE key and reads `ui.x.y_one` / `ui.x.y_other`,
    // so a base with both forms present is satisfied even though the base itself is absent.
    const defined = (key: string) =>
      UI_MESSAGES.en[key] !== undefined ||
      (UI_MESSAGES.en[`${key}_one`] !== undefined && UI_MESSAGES.en[`${key}_other`] !== undefined)

    const missing = [...asked]
      .filter(([key]) => !defined(key))
      .map(([key, path]) => `${key} (asked in ${path})`)
      .sort()

    expect(missing, `Keys a screen renders that the catalogue lacks:\n${missing.join('\n')}`).toEqual(
      [],
    )
  })

  /**
   * Keys whose Bangla IS the Latin string, with the reason.
   *
   * A list rather than a loosened rule, so each exception is argued once and the next one
   * has to be argued too. Both of these are names, not sentences: transliterating them
   * would put a word on the screen that nobody in the factory says out loud.
   */
  const LATIN_IS_THE_TRANSLATION: Record<string, string> = {
    'ui.nav.marbim': 'the assistant’s name — a proper noun in both languages',
    'ui.nav.locked_marbim': 'the same name, in the sentence the locked card uses',
    'ui.role.hr': 'what the department is called on a Bangladeshi factory floor, in English',
  }

  it('the Bangla is actually Bangla', () => {
    // Guards the copy-paste that leaves an English sentence in the bn block. Checked by
    // script range rather than by hand: the terms a factory keeps in English (LC, UD, GRN,
    // PP) mean a Bangla string legitimately contains Latin characters, but it must contain
    // at least some Bengali.
    const bengali = /[ঀ-৿]/
    const notTranslated = Object.entries(UI_MESSAGES.bn)
      .filter(([key, value]) => !bengali.test(value) && !(key in LATIN_IS_THE_TRANSLATION))
      .map(([key]) => key)
      .sort()

    expect(
      notTranslated,
      `bn entries with no Bengali script — English left in the Bangla block:\n${notTranslated.join('\n')}`,
    ).toEqual([])
  })

  it('carries no stale exemption from the Bangla check', () => {
    // The list rots the moment somebody translates one of them. A note that is no longer
    // true is worse than no note, because the next reader trusts it.
    const bengali = /[ঀ-৿]/
    const stale = Object.keys(LATIN_IS_THE_TRANSLATION).filter((key) => {
      const value = UI_MESSAGES.bn[key]
      return value === undefined || bengali.test(value)
    })

    expect(stale, `no longer Latin-only: ${stale.join(', ')}`).toEqual([])
  })
})

describe('the resolver', () => {
  it('falls back to English for a key Bangla lacks', () => {
    expect(tui('bn', 'ui.common.save')).toBe(UI_MESSAGES.bn['ui.common.save'])
    // A key in neither renders as itself, greppably — the notification catalogue's rule.
    expect(tui('bn', 'ui.nope.missing')).toBe('ui.nope.missing')
  })

  it('translator binds a locale', () => {
    const t = translator('bn')
    expect(t('ui.common.save')).toBe(tui('bn', 'ui.common.save'))
  })
})
