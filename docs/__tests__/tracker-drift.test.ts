/**
 * The go/no-go documents cannot silently rot (plan 8.2, audit PROC-3).
 *
 * `STUBS.md` and `PROGRESS.md` are what somebody reads to decide whether to ship. They have
 * both been wrong before, and not marginally: plan 0.5 found STUBS claiming Bangla on one of
 * twelve floor routes with no picker, only `CORE_SLICE` registered, no approve-inbox HTTP
 * surface and `delivery.appUrl` on localhost — four claims, all false — while PROGRESS said
 * production infrastructure did not exist.
 *
 * Prose cannot be checked by a machine and should not be. What CAN be checked is the class of
 * claim that is really a statement about the tree:
 *
 *  1. **A file these documents name must exist.** A row citing `modules/foo/service.ts` after
 *     that file was deleted is a row nobody can act on, and it reads as authoritative.
 *  2. **A claim of ABSENCE must still be true.** "X has no caller", "Y does not exist" — these
 *     are the ones that decay fastest, because the fix is a commit somewhere else that has no
 *     reason to touch this file.
 *
 * A test rather than a bespoke CI step, deliberately: it runs locally, in the fast suite, next
 * to every other source scan (`keys`, `action-reachability`, `marbim-off`). A drift check only
 * CI runs is one people discover after pushing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const TRACKERS = ['docs/STUBS.md', 'docs/PROGRESS.md'] as const

/** Every source file in the repo, as a path list, for suffix resolution. */
function tree(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) tree(path, out)
    else out.push(path)
  }
  return out
}

/*
 * `docs` is in here because tests live there now — `handoff-contract.test.ts` and this file.
 * Found immediately: a STUBS row citing the handoff check failed on its own first run, which
 * is the check working, just not on the drift anybody expected.
 */
const FILES = tree('src').concat(
  tree('scripts'),
  tree('k6'),
  tree('docs'),
  ['eslint.config.mjs'],
)

/**
 * Source only, for the absence checks below.
 *
 * `FILES` includes `docs` so a citation there resolves. Scanning it for a SYMBOL is a
 * different question: the handoff for the approve inbox names `upsertApprovalRule` while
 * documenting that it has no caller, and counting that as a caller made the check contradict
 * the very row it was checking. A document mentioning a function is not a call to it — the
 * same distinction as a comment mentioning one.
 */
const SOURCE = FILES.filter((file) => file.startsWith('src/') && /\.tsx?$/.test(file))

/**
 * Backticked things that look like a source file.
 *
 * A tracker cites files two ways — bare (`service.ts`) and partial (`modules/core/gates.ts`) —
 * so resolution is by SUFFIX rather than exact path. A bare `actions.ts` matches nineteen
 * files and that is fine: the claim being checked is "this kind of file exists", and a row
 * naming one that exists nowhere is the failure.
 */
const CITATION = /`([a-zA-Z0-9_@./-]+\.(?:ts|tsx|sql|mjs|js|json|css))`/g

/**
 * A source file with its comments removed.
 *
 * The lesson this repo has now learned four times — `action-reachability`, `marbim-off`,
 * `marbim-claims`, and here. A COMMENT mentioning a symbol is not a caller: `approvals/
 * register.ts` explains why `upsertApprovalRule` is owner-only, and `lib/pdf.ts` describes the
 * Playwright pool it will one day have. Both read as the feature existing to a raw text scan,
 * and both made this check report a true row as stale on its first run.
 */
const withoutComments = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

/**
 * Cited names that are not repo files and never were.
 *
 * Kept explicit and small. A regex loose enough to exclude these automatically would also
 * stop catching real deletions, which is the point of the check.
 */
const NOT_OURS = new Set([
  'package.json',
  'docker-compose.dev.yml',
  'docker-compose.prod.yml',
  'tsconfig.json',
])

/**
 * Files the trackers name as **owed**, not as existing.
 *
 * A row reading "dev-plan §9 wants `cutting_lay.js`" cites a file precisely because it is
 * missing, and failing on it would be the check misreading a claim of absence as a claim of
 * existence. Explicit rather than inferred from wording — "wants", "no", "missing" and
 * "pending" all appear in rows about things that DO exist.
 *
 * Shrink-only, and the shrinking is the point: build one of these and this list stops it
 * being forgotten in STUBS, because the entry has to come out too.
 */
const PLANNED = new Set([
  // Three k6 scenarios dev-plan §9 asks for on floor-facing modules. Plan 7.1 built the
  // harness and three others; these are the remaining floor paths.
  'cutting_lay.js',
  'qc_inline.js',
  'shipment_pack.js',
])

describe('every file the trackers cite exists', () => {
  it.each(TRACKERS)('%s', (tracker) => {
    const text = readFileSync(tracker, 'utf8')
    const missing: string[] = []

    for (const match of text.matchAll(CITATION)) {
      const cited = match[1]!
      if (NOT_OURS.has(cited) || PLANNED.has(cited)) continue
      // A `.ts` inside a sentence about a package, or a doc file — neither is a source claim.
      // A package name, never a repo path.
      if (cited.startsWith('@')) continue

      const resolved = FILES.some(
        (file) => file === cited || file.endsWith(`/${cited}`) || file.endsWith(cited),
      )
      if (!resolved) missing.push(cited)
    }

    expect(
      [...new Set(missing)],
      `${tracker} cites files that do not exist. Either they were deleted and the row is ` +
        `stale, or the row was wrong when written — both mislead whoever reads this to ` +
        `decide whether to ship:\n${[...new Set(missing)].join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Claims of ABSENCE, and how to tell whether each is still true.
 *
 * Hand-maintained, and that is the honest shape: "X has no caller" cannot be derived from the
 * text of the claim. What this list buys is that the day somebody FIXES one of these, the
 * build tells them the tracker now lies — which is exactly the commit that has no other reason
 * to touch `STUDS.md`.
 *
 * Removing an entry because the claim was resolved is the definition of progress here. Leaving
 * one in after fixing it is what this catches.
 */
const ABSENCE_CLAIMS: readonly {
  claim: string
  /** True while the claim still holds. */
  stillTrue: () => boolean
  tracker: string
}[] = [
  {
    claim: '`upsertApprovalRule` has no caller — approval rules can only be set by seeding',
    tracker: 'docs/STUBS.md',
    stillTrue: () => {
      const callers = SOURCE.filter(
        (file) =>
          !file.includes('__tests__') &&
          !file.endsWith('approvals/service.ts') &&
          withoutComments(file).includes('upsertApprovalRule'),
      )
      return callers.length === 0
    },
  },
  {
    claim: 'settings has no `queries.ts`, so its pages read `service.ts` directly (BE-M6)',
    tracker: 'docs/STUBS.md',
    stillTrue: () => !existsSync('src/modules/settings/queries.ts'),
  },
  {
    claim: '`lib/pdf.ts` is a stub, so document rendering is not routed',
    tracker: 'docs/STUBS.md',
    stillTrue: () => {
      if (!existsSync('src/lib/pdf.ts')) return false
      // A real implementation would reach for a renderer. Kept deliberately coarse: what is
      // being detected is "somebody built this", not the shape of what they built.
      return !/playwright|puppeteer|pdfkit/i.test(withoutComments('src/lib/pdf.ts'))
    },
  },
  {
    claim: 'no real MARBIM provider has ever been exercised — no key exists here',
    tracker: 'docs/STUBS.md',
    // The SDK wrappers landed in 6.4; what is still absent is a live run, which no test can
    // observe. Pinned on the thing that IS observable: the deterministic provider still being
    // the one a keyless environment selects.
    stillTrue: () => existsSync('src/modules/marbim/mock-provider.ts'),
  },
]

describe('claims of absence are still true', () => {
  it.each(ABSENCE_CLAIMS.map((entry) => [entry.claim, entry] as const))('%s', (_claim, entry) => {
    const text = readFileSync(entry.tracker, 'utf8')

    if (!entry.stillTrue()) {
      expect.fail(
        `This is no longer true, and ${entry.tracker} still says it is:\n  ${entry.claim}\n\n` +
          'Somebody fixed it in a commit that had no reason to touch the tracker. Update the ' +
          'row and remove this entry from ABSENCE_CLAIMS.',
      )
    }

    // Guards the guard: an entry describing a claim the tracker no longer makes is a check
    // watching nothing, which passes forever and reads as coverage.
    const keyword = entry.claim.match(/`([^`]+)`/)?.[1] ?? entry.claim.split(' ')[0]!
    expect(
      text.includes(keyword),
      `ABSENCE_CLAIMS still watches "${keyword}" but ${entry.tracker} no longer mentions it — ` +
        'the row was removed and this entry should have gone with it.',
    ).toBe(true)
  })
})

describe('the trackers are not stale on their face', () => {
  it('STUBS rows carry a date', () => {
    /*
     * Every row has a created/updated column. A row with no date cannot be aged, and "how long
     * has this been owed" is the question that turns a stub list into a decision.
     */
    const rows = readFileSync('docs/STUBS.md', 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.startsWith('|---') && !line.includes('| Stub |'))

    const undated = rows.filter((row) => !/\d{4}-\d{2}-\d{2}/.test(row))

    expect(undated.map((row) => row.slice(0, 70)), 'rows with no date').toEqual([])
  })
})
