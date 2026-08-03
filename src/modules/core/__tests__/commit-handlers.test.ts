/**
 * Every pending target must be able to commit.
 *
 * A module whitelists a table in `pendingTargets` and, if it registers no commit handler,
 * core writes the row itself. That generic write treats payload KEYS as literal column
 * names and refuses anything that is not a bare lowercase identifier — while every zod
 * schema in this repo names fields in camelCase.
 *
 * So a target can be registered, its schema valid, its drafts proposable and reviewable,
 * and still fail the instant somebody clicks Approve. `markers` sat that way since 5.1.
 * `orders`, `uds` and `wage_gazettes` sat that way until MARBIM's document intake tried to
 * use them and every draft died at the last step, after the upload, the extraction, the
 * wait and the review.
 *
 * Nothing else catches it: propose succeeds, the inbox renders, the reviewer reads a
 * perfectly good draft. The only signal is one 500 at the click.
 *
 * The exemptions below are the targets known to be in that state today. Each is a real
 * defect owed a handler, not a decision — the list exists so the count can only shrink,
 * and so a NEW uncommittable target fails this test the day it is added.
 */
// Before the registry: loading every module's `register.ts` pulls in the db client, which
// validates the environment at import. No database is touched by these assertions.
import 'dotenv/config'

import { describe, expect, it } from 'vitest'

import '@/modules/registry'
import { getCommitHandler, listModules } from '@/modules/core/registry'

/** Core's rule, copied deliberately: `assertIdentifier` in `pending-changes.ts`. */
const COLUMN_NAME = /^[a-z_][a-z0-9_]*$/

/**
 * `module/target` pairs that cannot currently commit a camelCase draft.
 *
 * **Empty, and meant to stay that way.** It held twelve entries when this test was written
 * — every one a target whose drafts died at the click — and each has since been given its
 * module's own creation logic. An entry here is a bug with a name, never an accepted
 * design: add one only with the reason, and delete it the moment the handler lands.
 */
const UNCOMMITTABLE_TODAY: readonly string[] = []

/** Fields no generic row write could ever accept, across a module's draft schemas. */
function camelCaseFields(zodMap: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(zodMap).flatMap(([key, schema]) => {
    const shape = (schema as { shape?: Record<string, unknown> }).shape ?? {}
    const bad = Object.keys(shape).filter((field) => !COLUMN_NAME.test(field))
    return bad.length > 0 ? [`${key}: ${bad.join(', ')}`] : []
  })
}

describe('pending targets can be committed', () => {
  const pairs = listModules().flatMap((module) =>
    module.pendingTargets.map((target) => [`${module.id}/${target}`, module, target] as const),
  )

  it.each(pairs)('%s', (name, module, target) => {
    if (getCommitHandler(module.id, target)) return

    const risky = camelCaseFields(module.zodMap)
    if (risky.length === 0) return

    expect(
      UNCOMMITTABLE_TODAY,
      `"${name}" has no commit handler, and ${module.id} drafts camelCase fields core's generic write refuses as invalid identifiers (${risky.join(' · ')}). ` +
        'Register a commit handler, or add it to UNCOMMITTABLE_TODAY with the reason.',
    ).toContain(name)
  })

  it('the exemption list has no stale entries', () => {
    // A fixed target left on the list makes the list a lie, and the next reader trusts it.
    const stale = UNCOMMITTABLE_TODAY.filter((name) => {
      const [moduleId = '', target = ''] = name.split('/')
      return getCommitHandler(moduleId, target) !== undefined
    })

    expect(stale, `${stale.join(', ')} now commit — remove them from UNCOMMITTABLE_TODAY`).toEqual(
      [],
    )
  })
})
