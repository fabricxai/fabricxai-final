/**
 * The off-switch is wired (plan 6.1, audit AI-B1 fallout).
 *
 * `MARBIM_ENABLED` was declared in `lib/env.ts`, validated at boot, and **read by nothing
 * else in the repo**. So with it off the button, the panel and the nav entry all still
 * mounted, `/marbim`, `/marbim/intake` and `/memory` all still opened, chat hard-failed once
 * per turn against a provider that was never registered, the intake screen kept queueing
 * extraction jobs nothing would ever run, and the poller's skip was recorded as a
 * **succeeded** job run — so job health stayed green while documents piled up.
 *
 * "Pilot with MARBIM off" was not a configuration this codebase supported, and the flag
 * being present made that harder to notice rather than easier.
 *
 * These are source and pure-function assertions. The flag is read from `process.env` at
 * module load in a server-only file, so flipping it inside a test would mean reloading the
 * whole environment — what can be checked here is that each surface CONSULTS it, and that
 * the registry data the consultation reads is right.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { NAV, marbimScreens, visibleNav } from '@/components/shell/nav'

/**
 * The file, with its comments removed.
 *
 * A comment that MENTIONS the flag is not a consumer of it — and every one of these files
 * has a paragraph explaining why the flag is read there, so scanning the raw text made the
 * check pass for a layout that had stopped reading it. Found by red-testing: replacing
 * `env.MARBIM_ENABLED` with a hardcoded `true` left the guard green.
 *
 * Same fix as `action-reachability`, for the same reason, one hour apart.
 */
const read = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

describe('the registry knows which screens need the copilot', () => {
  it('names MARBIM and order memory, and nothing else', () => {
    /*
     * 1.6 is on the list because it is built ON the copilot — its similarity search, its
     * embeddings and its close-out extraction all need a provider. With MARBIM off it would
     * render the parts that are plain SQL and silently lack the rest, which is the shape of
     * a screen that looks finished and is not.
     */
    expect([...marbimScreens()].sort()).toEqual(['marbim', 'memory'])
  })

  it('drops them from the sidebar when the copilot is off', () => {
    const on = visibleNav(['merchandiser'], 'woven', true).map((i) => i.id)
    const off = visibleNav(['merchandiser'], 'woven', false).map((i) => i.id)

    expect(on).toContain('marbim')
    expect(on).toContain('memory')
    expect(off).not.toContain('marbim')
    expect(off).not.toContain('memory')
  })

  it('takes nothing else away with them', () => {
    // The flag hides two screens. A merchandiser with the copilot off still has an order
    // desk, a buyer desk and an approve inbox.
    const on = visibleNav(['merchandiser'], 'woven', true).map((i) => i.id)
    const off = visibleNav(['merchandiser'], 'woven', false).map((i) => i.id)

    expect(on.filter((id) => !off.includes(id))).toEqual(['marbim', 'memory'])
  })

  it('defaults to showing them, because every other caller means "on"', () => {
    // `visibleNav(roles, factoryType)` is called from tests and tooling that have no flag to
    // pass. The shell — the one caller that renders to a person — passes it explicitly.
    expect(visibleNav(['merchandiser'], 'woven').map((i) => i.id)).toContain('marbim')
  })
})

describe('every surface consults the flag', () => {
  /**
   * File → what it must do with `MARBIM_ENABLED`.
   *
   * A source scan, and deliberately: the flag is read at module load in a server-only file,
   * so a runtime assertion would mean reloading the environment per case. What this catches
   * is the failure that actually happened — a flag nothing reads — and it catches it by
   * name rather than by somebody remembering to look.
   */
  const CONSUMERS: Record<string, string> = {
    'src/app/(app)/layout.tsx': 'hides the button, the panel and the nav entries',
    'src/app/(app)/marbim/page.tsx': 'refuses the assistant surface',
    'src/app/(app)/marbim/intake/page.tsx': 'refuses document intake',
    'src/app/(app)/memory/page.tsx': 'refuses order memory',
    'src/modules/marbim/actions.ts': 'refuses to queue an extraction nothing will read',
    'src/worker/processors/scheduler.ts': 'does not schedule the extraction tasks',
  }

  it.each(Object.entries(CONSUMERS))('%s %s', (path, what) => {
    expect(read(path), `${path} no longer ${what}`).toContain('MARBIM_ENABLED')
  })

  it('refuses intake on the PROVIDER too, not only the flag', () => {
    /*
     * Both, because they fail differently. The flag off is a factory that has not bought the
     * copilot. A flag on with no provider registered is a misconfiguration — and it is the
     * worse of the two, because everything looks available and fails per use.
     */
    const actions = read('src/modules/marbim/actions.ts')

    expect(actions).toContain('hasProvider()')
    expect(actions).toContain('marbim.errors.unavailable')
  })
})

describe('a skipped run is not a green one', () => {
  it('records the decline as its own status', () => {
    // `runQueuedExtractions` returns `{ skipped: '…' }` rather than throwing, because the
    // backlog is intact. `recordRun` used to close that as `succeeded`, which is what made
    // job health report green while nothing was being extracted.
    const jobRuns = read('src/modules/core/job-runs.ts')

    expect(jobRuns).toContain('declinedToRun')
    expect(jobRuns).toContain("'skipped'")
  })

  it('counts only real successes as a task having run', () => {
    // `lastSuccessByTask` is what job health ages a task from, and it filters on
    // `succeeded` — so a run of skips ages exactly like silence, which is what it is.
    expect(read('src/modules/core/job-runs.ts')).toContain("eq(jobRuns.status, 'succeeded')")
  })
})

describe('the registry itself', () => {
  it('still declares a writeRoles for every entry', () => {
    // Guards the guard: adding `requiresMarbim` to the NavItem shape must not have made the
    // required field optional again by accident.
    expect(NAV.filter((item) => item.writeRoles === undefined)).toEqual([])
  })
})
