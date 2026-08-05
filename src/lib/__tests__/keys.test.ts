/**
 * The composite-key helper, and the repo-wide rule it exists to keep.
 *
 * The sweep at the bottom is the point of this file. A NUL byte in a `.ts` file makes it a
 * binary file to grep and ripgrep, which then skip it in silence — and silence from a
 * search reads exactly like "no matches". Three service files sat in that blind spot and
 * two audits reported things about them that were not true.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { compositeKey, KEY_SEP, splitKey } from '@/lib/keys'

describe('composite keys', () => {
  it('round-trips the parts it was built from', () => {
    expect(splitKey(compositeKey('Navy', 'XL'))).toEqual(['Navy', 'XL'])
    expect(splitKey(compositeKey('BROKEN-STITCH', 'Side seam'))).toEqual([
      'BROKEN-STITCH',
      'Side seam',
    ])
  })

  it('keeps pairs distinct that a naive join would merge', () => {
    // The reason for a separator no value can contain. With '-' these two collide, and the
    // cut report then credits one colour's pieces to another.
    expect(compositeKey('Navy-Blue', 'XL')).not.toBe(compositeKey('Navy', 'Blue-XL'))
  })

  it('survives the punctuation real colours and sizes carry', () => {
    for (const [a, b] of [
      ['Navy/White', '3XL'],
      ['Off-White', 'XS-S'],
      ['Red (Pantone 186C)', 'M'],
      ['ছাই', 'এল'],
      ['', ''],
    ] as const) {
      expect(splitKey(compositeKey(a, b))).toEqual([a, b])
    }
  })

  it('separates with a unit separator, not NUL', () => {
    // NUL is what this replaced: invisible to grep, and rejected by Postgres in text and
    // jsonb the day one of these keys is persisted.
    expect(KEY_SEP).toBe('\u001F')
    expect(KEY_SEP).not.toBe('\u0000')
  })
})

describe('no source file is invisible to grep', () => {
  const SOURCE_ROOT = 'src'

  function sourceFiles(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) found.push(...sourceFiles(path))
      else if (/\.tsx?$/.test(entry.name)) found.push(path)
    }
    return found
  }

  it('contains no NUL byte anywhere under src/', () => {
    const withNul = sourceFiles(SOURCE_ROOT).filter((path) =>
      readFileSync(path, 'utf8').includes('\u0000'),
    )

    // Write the separator as an escape (`\u001F`) rather than as the character itself —
    // `src/lib/keys.ts` explains why, and `compositeKey` means no module needs its own.
    expect(withNul).toEqual([])
  })

  it('checks enough files to be meaningful', () => {
    // A sweep that silently matched nothing would pass forever. This is the guard on the
    // guard: if the walk breaks, this fails rather than going quietly green.
    expect(sourceFiles(SOURCE_ROOT).length).toBeGreaterThan(200)
  })
})
