/**
 * What the audit screen is handed (the "occurredAt.slice is not a function" bug).
 *
 * The trail rendered on load and blew up the moment somebody chose a table filter. Two
 * producers of one shape: the settings page mapped its rows and called `.toISOString()`,
 * the filter action returned the query's rows as they came. `occurred_at` is a
 * `timestamptz`, drizzle hands back a `Date`, and a `Date` crosses the server-action
 * boundary as a `Date` — so the client's `occurredAt.slice(0, 16)` met an object.
 *
 * Typescript did not catch it because the client re-declared the row as
 * `occurredAt: string` and then cast the action's result with `as unknown as`. These cases
 * pin the projection itself, which is the thing both callers now share.
 */
import { describe, expect, it } from 'vitest'

import { serialiseAuditRow } from '../audit-row'

/** A row shaped like the query's, with the two fields that are not plain strings. */
const row = {
  id: 42,
  companyId: 'c0000000-0000-4000-8000-000000000001',
  actorUserId: 'user_1',
  actorName: 'Rashida Akter',
  actorRole: 'merchandiser',
  action: 'update',
  targetTable: 'orders',
  targetId: '4f9b1f6a-3c3e-4a1e-9b1a-2a4b5c6d7e8f',
  changedFields: ['status'],
  before: { status: 'confirmed', unitPrice: '2.96' },
  after: { status: 'in_production', unitPrice: '2.96' },
  occurredAt: new Date('2026-08-23T05:31:00.000Z'),
} as unknown as Parameters<typeof serialiseAuditRow>[0]

describe('serialiseAuditRow', () => {
  it('hands the screen a STRING date — the bug was a Date reaching .slice()', () => {
    const out = serialiseAuditRow(row)
    expect(typeof out.occurredAt).toBe('string')
    // The screen's own rendering, exactly: it slices to the minute and drops the T.
    expect(out.occurredAt.slice(0, 16).replace('T', ' ')).toBe('2026-08-23 05:31')
  })

  it('stringifies the id, which the table hands back as a number', () => {
    expect(serialiseAuditRow(row).id).toBe('42')
    expect(typeof serialiseAuditRow(row).id).toBe('string')
  })

  it('carries the field NAMES and neither image — a wage must not ride to the browser', () => {
    const out = serialiseAuditRow(row)
    expect(out.changedFields).toEqual(['status'])
    // Rule 9: this screen shows what changed, never what it changed to. Spreading the row
    // would ship `before`/`after` to a client that renders neither.
    expect(Object.keys(out)).not.toContain('before')
    expect(Object.keys(out)).not.toContain('after')
  })

  it('keeps a system actor distinguishable from a departed one', () => {
    const system = serialiseAuditRow({
      ...row,
      actorUserId: null,
      actorName: null,
    } as unknown as Parameters<typeof serialiseAuditRow>[0])
    expect(system.actorUserId).toBeNull()

    const departed = serialiseAuditRow({
      ...row,
      actorName: null,
    } as unknown as Parameters<typeof serialiseAuditRow>[0])
    // The id outlives the person, and the screen reads exactly this difference.
    expect(departed.actorUserId).toBe('user_1')
    expect(departed.actorName).toBeNull()
  })
})
