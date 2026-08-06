/**
 * X.1 routing and arithmetic (plan 3.2, audit TEST-B1).
 *
 * 887 lines of backend with an empty `__tests__/`, and every ⚖ mutation in the product
 * funnels through it. These are the parts that need no database: which rule governs a draft,
 * how long it has waited, and what fraction of a module's drafts a reviewer had to correct.
 *
 * `matchRule` is the one worth the most. It is a SECOND COPY of core's `resolveRule` — the
 * inbox decides who may sign, and `approve` decides again, independently. If the two ever
 * disagree, a reviewer is shown a draft and then refused on it, which reads as a broken
 * queue rather than as a rule difference. The pair are pinned against each other in the
 * integration suite; here the shared behaviour is pinned to what it actually is, including
 * the part that surprises people.
 */
// The fallback path reads the module registry, and loading it validates the environment.
// No database is touched.
import 'dotenv/config'

import { describe, expect, it } from 'vitest'

import '@/modules/registry'

import { correctionRate, hoursBetween, matchRule, type MatchableRule } from '../service'

const rule = (over: Partial<MatchableRule> = {}): MatchableRule => ({
  moduleId: 'orders',
  targetTable: null,
  operation: null,
  requiredRoles: ['merchandiser'],
  approvalsRequired: 1,
  ...over,
})

const draft = { moduleId: 'orders', targetTable: 'order_breakdowns', operation: 'update' }

describe('which rule governs a draft', () => {
  it('takes the first match in the order given', () => {
    // The caller sorts by priority descending; this only ever takes the first match. Both
    // copies of this logic rely on the ordering rather than re-sorting, so a caller that
    // forgot the ORDER BY would silently route on insertion order.
    const rules = [
      rule({ requiredRoles: ['commercial'], approvalsRequired: 2 }),
      rule({ requiredRoles: ['merchandiser'] }),
    ]

    expect(matchRule(rules, draft)).toEqual({
      requiredRoles: ['commercial'],
      approvalsRequired: 2,
    })
  })

  it('treats a null target table as every table in the module', () => {
    const rules = [rule({ targetTable: null, requiredRoles: ['planner'] })]

    expect(matchRule(rules, draft).requiredRoles).toEqual(['planner'])
    expect(matchRule(rules, { ...draft, targetTable: 'orders' }).requiredRoles).toEqual(['planner'])
  })

  it('treats a null operation as every operation', () => {
    const rules = [rule({ operation: null, requiredRoles: ['planner'] })]

    for (const operation of ['insert', 'update', 'delete']) {
      expect(matchRule(rules, { ...draft, operation }).requiredRoles).toEqual(['planner'])
    }
  })

  it('does not match another module s rule', () => {
    const rules = [rule({ moduleId: 'store', requiredRoles: ['store'] })]

    // Falls through to orders' own registered defaults rather than borrowing store's rule.
    expect(matchRule(rules, draft).requiredRoles).toEqual(['owner', 'admin', 'merchandiser'])
  })

  it('does not match a different table or a different operation', () => {
    const rules = [
      rule({ targetTable: 'orders', requiredRoles: ['commercial'] }),
      rule({ operation: 'delete', requiredRoles: ['compliance'] }),
    ]

    expect(matchRule(rules, draft).requiredRoles).toEqual(['owner', 'admin', 'merchandiser'])
  })

  it('lets a WILDCARD outrank an exact rule, because priority is the only order', () => {
    /*
     * The surprise, pinned deliberately.
     *
     * A reader expects the more specific rule to win. It does not: the list arrives sorted
     * by priority alone, and the first match wins. So a module-wide rule at priority 200
     * beats a rule naming this exact table at 100.
     *
     * This is asserted not because it is right but because core's `resolveRule` does the
     * same thing, and the two agreeing matters more than either being intuitive. Changing
     * it means changing both, and this test is what will fail if only one moves.
     */
    const rules = [
      rule({ targetTable: null, requiredRoles: ['owner'] }), // priority 200, sorted first
      rule({ targetTable: 'order_breakdowns', requiredRoles: ['merchandiser'] }), // priority 100
    ]

    expect(matchRule(rules, draft).requiredRoles).toEqual(['owner'])
  })
})

describe('when no rule matches', () => {
  it('falls back to what the module registered', () => {
    // Read from the live registry, so a module that changes its defaults changes this
    // answer — the fallback is not a copy kept here.
    expect(matchRule([], { ...draft, moduleId: 'workforce' })).toEqual({
      requiredRoles: ['owner', 'hr'],
      approvalsRequired: 1,
    })
  })

  it('falls back to the owner for a module that is not registered at all', () => {
    // Closed, not open. An unknown module routes to the one role that can always act,
    // rather than to nobody (a queue that can never clear) or to everybody.
    expect(matchRule([], { ...draft, moduleId: 'not_a_module' })).toEqual({
      requiredRoles: ['owner'],
      approvalsRequired: 1,
    })
  })
})

describe('how long a draft has waited', () => {
  const at = (iso: string) => new Date(iso)

  it('rounds down, so a draft never claims an hour it has not waited', () => {
    // 59 minutes is zero hours. Rounding up would escalate a 48h threshold at 47:01.
    expect(hoursBetween(at('2026-08-06T00:00:00Z'), at('2026-08-06T00:59:00Z'))).toBe(0)
    expect(hoursBetween(at('2026-08-06T00:00:00Z'), at('2026-08-06T01:00:00Z'))).toBe(1)
    expect(hoursBetween(at('2026-08-04T00:00:00Z'), at('2026-08-06T00:00:00Z'))).toBe(48)
  })

  it('is timezone-independent, because it is a duration and not a date', () => {
    // The factory-timezone bug (INFRA-H2) does not apply here: this subtracts two instants.
    // Pinned so nobody "fixes" it into a calendar-day calculation, which WOULD be wrong.
    const from = at('2026-08-05T18:30:00Z') // already the 6th in Dhaka
    const to = at('2026-08-05T20:30:00Z')

    expect(hoursBetween(from, to)).toBe(2)
  })

  it('goes negative for a draft dated in the future rather than clamping', () => {
    // A clock-skewed device or a bad import. Reported as -1 rather than 0, so it looks
    // wrong instead of looking like a draft that just arrived.
    expect(hoursBetween(at('2026-08-06T02:00:00Z'), at('2026-08-06T00:00:00Z'))).toBe(-2)
    expect(hoursBetween(at('2026-08-06T00:30:00Z'), at('2026-08-06T00:00:00Z'))).toBe(-1)
  })
})

describe('the correction rate', () => {
  it('is a percentage to two places', () => {
    expect(correctionRate(4, 1)).toBe('25.00')
    expect(correctionRate(3, 1)).toBe('33.33')
    expect(correctionRate(3, 2)).toBe('66.67')
    expect(correctionRate(7, 7)).toBe('100.00')
  })

  it('reports zero of zero as 0.00, which is why reviewed is returned beside it', () => {
    // Indistinguishable from a genuine perfect record on its own. `correctionRates` returns
    // `reviewed` alongside, and the tool description tells MARBIM to quote both — a module
    // nobody has reviewed must not read as a module nobody has had to correct.
    expect(correctionRate(0, 0)).toBe('0.00')
    expect(correctionRate(9, 0)).toBe('0.00')
  })

  it('does not round a correction away', () => {
    // One correction in a thousand drafts is 0.10, not 0.00. A rate that rounds the first
    // failure to nothing is a rate that says an extractor is perfect until it is badly
    // broken.
    expect(correctionRate(1000, 1)).toBe('0.10')
    expect(correctionRate(10_000, 1)).toBe('0.01')
  })
})
