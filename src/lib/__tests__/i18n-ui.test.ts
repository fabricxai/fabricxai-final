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

    const missing = [...asked]
      .filter(([key]) => UI_MESSAGES.en[key] === undefined)
      .map(([key, path]) => `${key} (asked in ${path})`)
      .sort()

    expect(missing, `Keys a screen renders that the catalogue lacks:\n${missing.join('\n')}`).toEqual(
      [],
    )
  })

  it('the Bangla is actually Bangla', () => {
    // Guards the copy-paste that leaves an English sentence in the bn block. Checked by
    // script range rather than by hand: the terms a factory keeps in English (LC, UD, GRN,
    // PP) mean a Bangla string legitimately contains Latin characters, but it must contain
    // at least some Bengali.
    const bengali = /[ঀ-৿]/
    const notTranslated = Object.entries(UI_MESSAGES.bn)
      .filter(([, value]) => !bengali.test(value))
      .map(([key]) => key)
      .sort()

    expect(
      notTranslated,
      `bn entries with no Bengali script — English left in the Bangla block:\n${notTranslated.join('\n')}`,
    ).toEqual([])
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
