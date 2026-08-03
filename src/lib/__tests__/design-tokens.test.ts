/**
 * Every design token a component reaches for must exist in `theme.css`.
 *
 * This exists because a misspelt custom property is the quietest bug in the system. CSS has
 * no such thing as an undefined variable error: `var(--fx-bg-base)` where the token is
 * actually `--fx-bg-canvas` resolves to nothing, the declaration is dropped, and the element
 * inherits whatever was underneath. The wall board shipped a dark theme with light-mode text
 * on a white background and rendered as very pale grey on cream — legible enough on a laptop
 * to review, invisible on the factory pillar it was built for.
 *
 * Nothing else catches it. TypeScript sees a string, ESLint sees a string, and the component
 * renders without complaint.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const THEME = 'src/app/theme.css'
const SOURCE_ROOT = 'src'

/** `--fx-text-${tone}` and friends — a template hole, not a token we can check statically. */
const INTERPOLATED = /^--fx-[a-z0-9-]*-$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    // Tests are excluded, this file loudest of all: it names the token that caused the bug
    // in its own documentation, and scanning itself would report that prose as a defect.
    if (entry === '__tests__') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })
}

describe('design tokens', () => {
  const defined = new Set(
    Array.from(readFileSync(THEME, 'utf8').matchAll(/(--fx-[a-z0-9-]+)\s*:/g), (m) => m[1]!),
  )

  it('defines every token the components use', () => {
    const missing: string[] = []

    for (const file of sourceFiles(SOURCE_ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/var\((--fx-[a-z0-9-]+)/g)) {
        const token = match[1]!
        // A trailing dash means the name was built from a template literal, so the real
        // token is only known at runtime. Those are the tone/severity maps, and the tone
        // unions are already type-checked at the call site.
        if (INTERPOLATED.test(token) || defined.has(token)) continue
        missing.push(`${token} — ${file}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('reads a theme that actually has tokens in it', () => {
    // Guards the guard: a moved or renamed theme file would empty `defined` and make the
    // test above pass for every possible token, silently.
    expect(defined.size).toBeGreaterThan(50)
  })
})
