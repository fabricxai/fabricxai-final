/**
 * Every server action names the roles that may call it (audit N1).
 *
 * This is a source sweep rather than a runtime check, and it has to be: a Server Action is
 * a POST addressed by an action id, so there is no route to enumerate and no middleware it
 * passes through. The only place "did anyone gate this?" can be asked of ALL of them at
 * once is the source.
 *
 * What it prevents is the seventeenth `actions.ts`. The first sixteen all authenticated
 * with `requireCtx` and stopped, which is how recording the buyer verdict that opens the
 * cutting gate, issuing a purchase order, opening a BTB credit and confirming ex-factory
 * became things any authenticated member of the company could do.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const MODULES_ROOT = 'src/modules'

/** Every module that exposes a `'use server'` action file. */
function actionFiles(): { module: string; path: string; source: string }[] {
  return readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ module: entry.name, path: `${MODULES_ROOT}/${entry.name}/actions.ts` }))
    .filter(({ path }) => {
      try {
        return readFileSync(path, 'utf8').startsWith("'use server'")
      } catch {
        return false
      }
    })
    .map((f) => ({ ...f, source: readFileSync(f.path, 'utf8') }))
}

/**
 * Split a file into its top-level function bodies, keyed by name.
 *
 * Crude on purpose — a real parser would be a dependency and a maintenance surface for a
 * check whose whole value is being obvious. Bodies run from the declaration to the next
 * top-level declaration, which is enough to see which gate a function reaches.
 */
function functionBodies(source: string): Map<string, { exported: boolean; body: string }> {
  const bodies = new Map<string, { exported: boolean; body: string }>()
  const lines = source.split('\n')
  const declaration = /^(export )?(?:async )?function (\w+)/

  let current: { name: string; exported: boolean; lines: string[] } | null = null
  const flush = () => {
    if (current) bodies.set(current.name, { exported: current.exported, body: current.lines.join('\n') })
  }

  for (const line of lines) {
    const match = declaration.exec(line)
    if (match) {
      flush()
      current = { name: match[2]!, exported: Boolean(match[1]), lines: [] }
    }
    if (current) current.lines.push(line)
  }
  flush()

  return bodies
}

const FILES = actionFiles()

describe('the action layer', () => {
  it('has action files to check', () => {
    // Guard on the guard: a sweep that found nothing would pass forever.
    expect(FILES.length).toBeGreaterThanOrEqual(16)
  })

  it('never authenticates without also checking a role', () => {
    // `requireCtx` answers "is somebody signed in", which is not a permission. It stays
    // exported for /api routes and the shell; an action reaching for it is the bug.
    const ungated = FILES.filter(({ source }) => /\brequireCtx\b/.test(source)).map((f) => f.path)

    expect(ungated).toEqual([])
  })

  it('gates every exported action, directly or through a gated helper', () => {
    const offenders: string[] = []

    for (const { module, source } of FILES) {
      const bodies = functionBodies(source)

      // Helpers in the same file that gate on the caller's behalf — compliance routes two
      // of its actions through `policyFor()`, which is a legitimate shape.
      const gatedHelpers = [...bodies.entries()]
        .filter(([, fn]) => !fn.exported && fn.body.includes('requireRole('))
        .map(([name]) => name)

      for (const [name, fn] of bodies) {
        if (!fn.exported) continue
        const gated =
          fn.body.includes('requireRole(') ||
          gatedHelpers.some((helper) => fn.body.includes(`${helper}(`))
        if (!gated) offenders.push(`${module}.${name}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('never calls the gate with an empty role list', () => {
    // `requireRole()` throws on this at runtime; catching it here means it cannot ship.
    const empty = FILES.filter(({ source }) =>
      /requireRole\(\s*await headers\(\)\s*\)/.test(source),
    ).map((f) => f.path)

    expect(empty).toEqual([])
  })
})

describe('the roles on the operations that decide money or open a gate', () => {
  /** The claim each of these makes, in the words of what goes wrong if it is wrong. */
  const CRITICAL: { module: string; action: string; mustList: string[]; mustNotList: string[] }[] = [
    // Releases cutting. An unapproved PP sample is the difference between fabric cut and
    // fabric wasted, and before this any member could record the buyer's verdict.
    { module: 'sampling', action: 'recordBuyerVerdict', mustList: ['merchandiser'], mustNotList: ['store', 'viewer', 'member'] },
    // Draws against a customs UD — overdrawing bonded fabric is legal exposure.
    { module: 'store', action: 'draftStockAdjustment', mustList: ['store'], mustNotList: ['viewer', 'member'] },
    // Money out of the door, against a BTB ceiling.
    { module: 'procurement', action: 'issuePurchaseOrder', mustList: ['procurement', 'commercial'], mustNotList: ['viewer', 'member', 'store'] },
    // Opens a credit against the master LC's headroom.
    { module: 'commercial', action: 'openBtbCredit', mustList: ['commercial'], mustNotList: ['viewer', 'member', 'store'] },
    // The bank presentation. An EXP number is mandatory before it.
    { module: 'commercial', action: 'createSubmission', mustList: ['commercial'], mustNotList: ['viewer', 'member'] },
    // Says the container left, which is what the LC's latest-shipment date is judged against.
    { module: 'shipment', action: 'confirmShipmentLeft', mustList: ['shipment', 'commercial'], mustNotList: ['viewer', 'member'] },
    // Wages. Narrower again inside the service — hr and owner only, admin included in the
    // refusal — but the action must not be the thing that lets everyone else through.
    { module: 'workforce', action: 'runPayroll', mustList: ['hr'], mustNotList: ['viewer', 'member', 'store', 'production'] },
    // Company configuration, including the factory type that swings modules in and out.
    { module: 'settings', action: 'saveCompanyProfile', mustList: ['owner', 'admin'], mustNotList: ['viewer', 'member'] },
  ]

  for (const { module, action, mustList, mustNotList } of CRITICAL) {
    it(`${module}.${action} is limited to the roles that own it`, () => {
      const source = readFileSync(`${MODULES_ROOT}/${module}/actions.ts`, 'utf8')
      const bodies = functionBodies(source)
      const fn = bodies.get(action)

      expect(fn, `${module}.${action} not found — was it renamed?`).toBeDefined()

      const call = /requireRole\(await headers\(\), ([^)]*)\)/.exec(fn!.body)
      expect(call, `${module}.${action} does not gate on a role`).not.toBeNull()

      const declared = call![1]!
      for (const role of mustList) {
        expect(declared, `${module}.${action} must list ${role}`).toContain(`'${role}'`)
      }
      for (const role of mustNotList) {
        expect(declared, `${module}.${action} must NOT list ${role}`).not.toContain(`'${role}'`)
      }
    })
  }
})
