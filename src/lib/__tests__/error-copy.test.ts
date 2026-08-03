/**
 * Every error a service can throw has a sentence somebody can read.
 *
 * Services throw `AppError(code, messageKey, details)`, and only `Error.message` survives a
 * server-action boundary — Next drops the class, the code and the details. So a screen that
 * catches one and renders it puts `conflict: shipment.errors.doc_needs_file` in front of a
 * shipping clerk. Not a crash, not wrong, and not a sentence.
 *
 * `actionErrorMessage` turns the key back into copy, but only if the copy exists. This test
 * is what stops the next error key being added without it: it reads the source for every
 * key any service throws and fails if the catalogue has nothing to say about one.
 *
 * It scans TEXT rather than importing the modules, deliberately. Importing every service to
 * enumerate its throws would need a database and a registered MARBIM provider, and a guard
 * that only runs in the integration suite is a guard that runs after the mistake is merged.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MESSAGES } from '@/lib/i18n'

/** `new AppError('conflict', 'x.y')`, `notFound('x.y')`, `conflict('x.y')`, `forbidden('x.y')`. */
const THROWN = /(?:new AppError\(\s*'[a-z_]+',\s*|notFound\(\s*|conflict\(\s*|forbidden\(\s*)'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/g

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      // Tests throw keys at fixtures, not at people.
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}

function thrownKeys(): Map<string, string> {
  const byKey = new Map<string, string>()

  for (const path of sourceFiles('src')) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(THROWN)) {
      const key = match[1]!
      if (!byKey.has(key)) byKey.set(key, path)
    }
  }

  return byKey
}

describe('every refusal reads as a sentence', () => {
  const thrown = thrownKeys()

  it('finds the error keys at all', () => {
    // If the regex stops matching, every assertion below passes vacuously and the guard
    // silently stops guarding — the exact failure this whole file exists to prevent.
    expect(thrown.size).toBeGreaterThan(150)
  })

  it('has copy for every key a service can throw', () => {
    const missing = [...thrown.entries()]
      .filter(([key]) => MESSAGES.en[key] === undefined)
      .map(([key, path]) => `${key} (thrown in ${path})`)
      .sort()

    expect(
      missing,
      `These errors would render as their own key in front of a user. Add a sentence to MESSAGES.en in src/lib/i18n.ts:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('has no copy for errors nothing throws', () => {
    // Dead copy is a lie about what the system can tell you, and it is the entry somebody
    // edits for an hour wondering why their change does nothing.
    const dead = Object.keys(MESSAGES.en)
      .filter((key) => key.startsWith('errors.') || key.includes('.errors.'))
      .filter((key) => !thrown.has(key))
      .sort()

    expect(dead, `Copy for keys no service throws:\n${dead.join('\n')}`).toEqual([])
  })

  it('no screen renders a caught error message raw', () => {
    /*
     * The other half of the problem. Copy in the catalogue does nothing if a component
     * reaches past the resolver for `error.message` — which is what every screen did, and
     * what a new one will do by reflex, because it is the shorter thing to type.
     *
     * `actionErrorMessage` is the only thing that turns `conflict: store.errors.roll_not_found`
     * back into a sentence, so the raw shape is banned outright rather than discouraged.
     */
    const offenders: string[] = []

    for (const path of sourceFiles('src/app').concat(sourceFiles('src/components'))) {
      if (!path.endsWith('.tsx')) continue
      const source = readFileSync(path, 'utf8')
      for (const [i, line] of source.split('\n').entries()) {
        /*
         * `instanceof Error` in a screen is only ever the prelude to reading `.message`,
         * and `actionErrorMessage` takes the error itself — so needing the check at all
         * means reaching past the resolver. There are zero legitimate uses in `.tsx` today,
         * which is why this is an outright ban rather than a per-file exemption: a file
         * that happens to call the resolver elsewhere would otherwise be excused for every
         * raw line in it, which is exactly how the first one comes back.
         */
        if (/instanceof Error/.test(line)) offenders.push(`${path}:${i + 1}`)
      }
    }

    expect(
      offenders,
      `Use actionErrorMessage(error, fallback) from @/lib/action-error — these would render a dotted key:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('never leaves a placeholder in refusal copy', () => {
    /*
     * `AppError.details` does not survive a server action — only the message string does —
     * so `actionErrorMessage` has no values to substitute. A template like "serial {serial}
     * already exists" would reach the reader with the braces still in it, which is worse
     * than the key: it looks like working software that has lost the number.
     */
    const withPlaceholders = Object.keys(MESSAGES.en)
      .filter((key) => key.startsWith('errors.') || key.includes('.errors.'))
      .filter((key) => /\{\w+\}/.test(MESSAGES.en[key]!))
      .sort()

    expect(withPlaceholders).toEqual([])
  })
})
