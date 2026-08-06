/**
 * Nothing on a screen demands more width than a floor tablet has (plan 4.4, audit FE-H6).
 *
 * The thirteen floor routes are used on a 10" tablet held upright — the cutting table, the
 * delivery bay, the inline check, the packing floor. Every one of them was laid out for a
 * desk monitor, and the whole product had exactly one media query, for reduced motion.
 *
 * A one-time look at thirteen screens fixes thirteen screens. This is the check that keeps
 * the fourteenth from arriving broken, and it is a source scan for the same reason
 * `audited-tables` and `action-role-gates` are: the question is about the whole repo, and
 * the whole repo is only visible from here.
 *
 * ## What it measures
 *
 * A grid's MINIMUM demanded width — the fixed pixel tracks plus the gaps between them.
 * Fractional tracks are ignored, because they yield. That number is what pushes a page
 * sideways, and a page that scrolls sideways hides the thing somebody is reaching for
 * behind a gesture they do not know is available.
 *
 * ## What it does not measure
 *
 * Text. A column can be 1fr and still be unreadable at 90px, and no static check catches
 * that — somebody has to hold the tablet. This narrows that pass to a judgement about
 * legibility rather than a hunt for overflow.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * What a page actually gets, in portrait: 768 device − 60 collapsed sidebar − 36 gutters.
 */
const TABLET_CONTENT_WIDTH = 672

/**
 * The narrowest a flexible column can be and still be read.
 *
 * Counted, because "it fits" is not the same as "it works". A row of four tracks totalling
 * 560px of fixed width technically fits a 672px canvas — by leaving the title column, the
 * one carrying the PO number, at seventy pixels. The overflow never happens and the screen
 * is still unusable, which is the failure mode a pure overflow check misses.
 */
const READABLE_TRACK = 90

/** The gap most grids in this codebase use. Under-counting would let a wide one through. */
const ASSUMED_GAP = 14

const ROOTS = ['src/app', 'src/components']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out)
    } else if (entry.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}

/** Split a track list at the top level, so `minmax(a, b)` stays one track. */
function splitTracks(spec: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''

  for (const char of spec) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (/\s/.test(char) && depth === 0) {
      if (current) tracks.push(current)
      current = ''
      continue
    }
    if (char === ',' && depth === 0) continue
    current += char
  }
  if (current) tracks.push(current)
  return tracks
}

/**
 * The width one track insists on.
 *
 * `1fr`, `auto` and the MAXIMUM half of a `minmax` all yield, so they count zero. A
 * `minmax(240px, 420px)` insists on 240 and may grow to 420; a `minmax(0, 420px)` insists
 * on nothing, which is why the top bar is not on this list.
 */
function trackMinimum(track: string): number {
  const repeat = /^repeat\(([^,]+),(.+)\)$/.exec(track)
  if (repeat) {
    const inner = trackMinimum(repeat[2]!.trim())
    const count = Number(repeat[1]!.trim())
    // auto-fit / auto-fill place as many as fit, so one is the minimum.
    return Number.isFinite(count) ? inner * count : inner
  }

  const minmax = /^minmax\((.+)\)$/.exec(track)
  if (minmax) return trackMinimum(splitTracks(minmax[1]!)[0] ?? '0')

  const px = /^(\d+)px$/.exec(track)
  return px ? Number(px[1]) : 0
}

/**
 * What a grid needs to be usable: its fixed tracks, its gaps, and a readable share for
 * every track that yields.
 */
function minimumWidth(spec: string): number {
  const tracks = splitTracks(spec)
  const fixed = tracks.reduce((sum, track) => sum + trackMinimum(track), 0)
  const flexible = tracks.filter((track) => trackMinimum(track) === 0).length

  return fixed + flexible * READABLE_TRACK + Math.max(tracks.length - 1, 0) * ASSUMED_GAP
}

/**
 * How this element copes with being wider than the screen.
 *
 * A window around the declaration: back far enough to catch a scroll wrapper a few
 * elements up, forward far enough to catch the `minWidth` that usually sits on the next
 * line. Deliberately generous — a false pass here is a screen somebody still has to look
 * at, and a false FAILURE is a test people learn to edit around.
 */
function copesWithNarrow(source: string, at: number): boolean {
  const from = Math.max(0, at - 1400)
  const window = source.slice(from, at + 400)

  return (
    window.includes('fx-stack-tablet') ||
    window.includes('fx-scroll-x') ||
    window.includes('overflowX') ||
    // A declared minimum inside a scroller is the deliberate version of this.
    /minWidth: \d{3}/.test(window)
  )
}

interface WideGrid {
  where: string
  spec: string
  width: number
}

const wide: WideGrid[] = []

for (const root of ROOTS) {
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/gridTemplateColumns: [`']([^`']+)[`']/g)) {
      const width = minimumWidth(match[1]!)
      if (width <= TABLET_CONTENT_WIDTH) continue
      if (copesWithNarrow(source, match.index)) continue

      wide.push({
        where: `${path}:${source.slice(0, match.index).split('\n').length}`,
        spec: match[1]!,
        width,
      })
    }
  }
}

describe('a floor tablet can render every screen', () => {
  it('has no grid that demands more width than the screen has', () => {
    /*
     * The fix is one of two things, and which one depends on the layout rather than on
     * taste. A CARD list — where each row is its own grid and every cell already says what
     * it is — takes `fx-stack-tablet` and becomes a stack. A TABLE — one header grid over
     * many row grids — cannot stack without orphaning its labels, so it takes a
     * `fx-scroll-x` wrapper and a `minWidth`, and a cut-off column tells the reader there
     * is more to the right.
     */
    const named = wide.map((g) => `${g.where} needs ${g.width}px — ${g.spec}`)

    expect(
      named,
      `these push a 768px tablet sideways. Give each one fx-stack-tablet (a card list) or an fx-scroll-x wrapper with a minWidth (a table):\n${named.join('\n')}`,
    ).toEqual([])
  })
})

describe('the measurement itself', () => {
  it('counts fixed tracks and gaps, and ignores the ones that yield', () => {
    // Guards the guard: a scanner that measured everything as zero would pass this file
    // forever while reporting that thirteen screens are fine.
    expect(minimumWidth('minmax(0, 1fr) 200px 190px 170px')).toBe(
      560 + READABLE_TRACK + 3 * ASSUMED_GAP,
    )
    expect(minimumWidth('1fr 2fr .8fr')).toBe(3 * READABLE_TRACK + 2 * ASSUMED_GAP)
    expect(minimumWidth('repeat(auto-fit, minmax(220px, 1fr))')).toBe(220)
  })

  it('does not count a maximum as a floor', () => {
    // `minmax(0, 420px)` is a cap on how wide a track may grow, not a demand. Counting it
    // would flag the top bar, which is the one thing here that already yields correctly.
    expect(minimumWidth('minmax(0, 1fr) minmax(0, 420px) minmax(0, 1fr)')).toBe(
      3 * READABLE_TRACK + 2 * ASSUMED_GAP,
    )
    expect(minimumWidth('minmax(240px, 420px)')).toBe(240)
  })
})

describe('a scroller a keyboard can reach', () => {
  it('every fx-scroll-x wrapper is focusable', () => {
    /*
     * `overflow-x: auto` makes a box scrollable with a finger or a trackpad and with nothing
     * else. Without `tabIndex`, the only way to see the right-hand columns of an order book on
     * a tablet is to touch it — so a keyboard user, or anybody on a device with a keyboard
     * case, simply cannot read the end of the row. That is WCAG 2.1.1, and axe calls it
     * `scrollable-region-focusable`.
     *
     * Found by 7.2's sweep at the tablet viewport, on a wrapper 4.4 had added for exactly the
     * right reason and could not check — there was no browser in the environment. Seven sites
     * fixed; this is what stops the eighth.
     *
     * A source scan rather than a rendered one, deliberately: the Playwright sweep covers five
     * screens and this covers every file, so a wrapper added to a screen nobody load-tests is
     * still caught, and caught in the fast suite.
     */
    const offenders: string[] = []

    for (const file of sourceFiles('src')) {
      const source = readFileSync(file, 'utf8')
      let at = source.indexOf('className="fx-scroll-x"')

      while (at !== -1) {
        // The attribute block this class sits in, which is where a tabIndex would be.
        const block = source.slice(at, at + 500)
        if (!/tabIndex=\{?0/.test(block)) offenders.push(`${file}:${lineOf(source, at)}`)
        at = source.indexOf('className="fx-scroll-x"', at + 1)
      }
    }

    expect(
      offenders,
      `these scroll horizontally and cannot be focused, so a keyboard cannot scroll them. ` +
        `Add tabIndex={0}:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

const lineOf = (source: string, index: number): number =>
  source.slice(0, index).split('\n').length
