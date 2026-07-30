/**
 * Phase 0 exit criterion B — a demo pending_change inserts, approves, commits and audits
 * end to end against a scratch table. Definition: docs/runbooks/phase-0-exit.md
 *
 * **The scratch table is created here, never in a migration.** A demo table that ships in
 * `src/db/migrations/` reaches production, and "it was only for the Phase 0 gate" is not
 * a story anyone wants to tell later.
 *
 * Cases 5, 6 and 8 are the ones worth the effort. 1 and 4 only prove the feature works;
 * double-approve, re-validation after a schema tightens, and cross-tenant approve prove
 * it cannot be talked around.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { approvalRules, auditLog, companies, outbox, pendingChanges, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { AppError } from '@/modules/core/errors'
import { approve, propose, reject } from '@/modules/core/pending-changes'
import { __resetRegistry, registerModule } from '@/modules/core/registry'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY_A = randomUUID()
const COMPANY_B = randomUUID()
const USER_A = `gate-b-user-${randomUUID().slice(0, 8)}`
const USER_B = `gate-b-other-${randomUUID().slice(0, 8)}`

const ctxA: RequestCtx = { companyId: COMPANY_A, userId: USER_A, roles: ['owner'] }
const ctxB: RequestCtx = { companyId: COMPANY_B, userId: USER_B, roles: ['owner'] }

/** The module's payload schema. Case 6 re-registers a tightened version of it. */
const widgetLoose = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
})

const widgetTight = z.object({
  name: z.string().min(1),
  // Tightened: the factory decided a widget order below 100 pieces is never real.
  quantity: z.number().int().min(100),
})

function registerDemo(schema: z.ZodType) {
  __resetRegistry()
  registerModule({
    id: '__demo__',
    pendingTargets: ['demo_widgets'],
    zodMap: { widget_v1: schema },
    approvalDefaults: { requiredRoles: ['owner'] },
  })
}

async function countWidgets(companyId: string): Promise<number> {
  const rows = await db.execute<{ n: string }>(
    sql`select count(*)::text as n from demo_widgets where company_id = ${companyId}`,
  )
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
  return Number((list[0] as { n: string }).n)
}

beforeAll(async () => {
  await db.execute(sql`
    create table if not exists demo_widgets (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references companies(id) on delete cascade,
      name text not null,
      quantity integer not null,
      created_at timestamptz not null default now()
    )`)

  // Same treatment every real tenant table gets, or this proves nothing about tenancy.
  await db.execute(sql`alter table demo_widgets enable row level security`)
  await db.execute(sql`alter table demo_widgets force row level security`)
  await db.execute(sql`drop policy if exists demo_widgets_tenant on demo_widgets`)
  await db.execute(sql`
    create policy demo_widgets_tenant on demo_widgets
      for all to fabricxai_app
      using (company_id = app.current_company_id())
      with check (company_id = app.current_company_id())`)
  await db.execute(sql`grant select, insert, update, delete on demo_widgets to fabricxai_app`)

  await db
    .insert(companies)
    .values([
      { id: COMPANY_A, name: 'Gate B Alpha', slug: `gate-b-a-${COMPANY_A.slice(0, 8)}` },
      { id: COMPANY_B, name: 'Gate B Beta', slug: `gate-b-b-${COMPANY_B.slice(0, 8)}` },
    ])
    .onConflictDoNothing()

  // `pending_changes.created_by` and `reviewed_by` are real foreign keys — a draft has to
  // be attributable to a person, which is the whole point of the audit chain. The fixture
  // needs real users, not invented ids.
  await db
    .insert(users)
    .values([
      { id: USER_A, email: `${USER_A}@fabricxai.test`, name: 'Gate B Owner' },
      { id: USER_B, email: `${USER_B}@fabricxai.test`, name: 'Gate B Other Owner' },
    ])
    .onConflictDoNothing()
})

afterAll(async () => {
  // `audit_log.company_id` is ON DELETE **restrict**, not cascade — deliberately. You
  // cannot delete a company and quietly take its audit trail with it; purging history is
  // an explicit ops act. So the fixture has to clear it by hand, which is the correct
  // amount of friction for the operation.
  //
  // This connection is the owner (superuser), so it bypasses RLS. That is what a fixture
  // needs and exactly what the application role must never have.
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY_A}, ${COMPANY_B})`)
  await db.delete(companies).where(eq(companies.id, COMPANY_A))
  await db.delete(companies).where(eq(companies.id, COMPANY_B))
  await db.delete(users).where(eq(users.id, USER_A))
  await db.delete(users).where(eq(users.id, USER_B))
  await db.execute(sql`drop table if exists demo_widgets`)
  await client.end()
})

beforeEach(() => {
  registerDemo(widgetLoose)
})

const draft = () =>
  ({
    moduleId: '__demo__',
    targetTable: 'demo_widgets',
    operation: 'insert' as const,
    zodSchemaKey: 'widget_v1',
    payload: { name: 'Poplin shirt', quantity: 1200 },
    fieldConfidence: { name: 0.98, quantity: 0.71 },
    source: 'ai_extraction' as const,
    extractorVersion: 'gate-b-v1',
  })

describe('gate B · propose → approve → commit → audit', () => {
  it('1 · proposes a draft carrying real per-field confidence', async () => {
    const { id, status } = await propose(ctxA, draft())
    expect(status).toBe('pending')

    const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id))
    expect(row?.status).toBe('pending')
    expect(row?.fieldConfidence).toEqual({ name: 0.98, quantity: 0.71 })
    // The weakest field, not an average — that is the number the inbox sorts on.
    expect(Number(row?.confidenceMin)).toBeCloseTo(0.71, 3)
    expect(row?.extractorVersion).toBe('gate-b-v1')
  })

  it('2 · refuses a target table the module never registered', async () => {
    await expect(propose(ctxA, { ...draft(), targetTable: 'users' })).rejects.toMatchObject({
      code: 'forbidden',
      messageKey: 'errors.target_not_registered',
    })
  })

  it('3 · refuses a payload the module zod rejects, writing nothing', async () => {
    const before = await db.select().from(pendingChanges)

    await expect(
      propose(ctxA, { ...draft(), payload: { name: '', quantity: -5 } }),
    ).rejects.toMatchObject({ code: 'validation_failed', status: 422 })

    const after = await db.select().from(pendingChanges)
    expect(after).toHaveLength(before.length)
  })

  it('3b · refuses an AI draft with no per-field confidence', async () => {
    // Confidence comes from the extractor or the draft does not exist. Constants forbidden.
    await expect(
      propose(ctxA, { ...draft(), fieldConfidence: {} }),
    ).rejects.toMatchObject({ messageKey: 'errors.confidence_required' })
  })

  it('4 · approve commits the row, the audit entry and the event in one transaction', async () => {
    const { id } = await propose(ctxA, draft())
    const { committedRowId } = await approve(ctxA, { pendingChangeId: id })

    const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id))
    expect(row?.status).toBe('committed')
    expect(row?.committedRowId).toBe(committedRowId)
    expect(row?.reviewedBy).toBe(USER_A)

    const widgets = await db.execute<{ name: string; quantity: number }>(
      sql`select name, quantity from demo_widgets where id = ${committedRowId}`,
    )
    const list = Array.isArray(widgets) ? widgets : ((widgets as { rows?: unknown[] }).rows ?? [])
    expect(list[0]).toMatchObject({ name: 'Poplin shirt', quantity: 1200 })

    const audits = await db.select().from(auditLog).where(eq(auditLog.pendingChangeId, id))
    expect(audits).toHaveLength(1)
    expect(audits[0]?.action).toBe('insert')
    expect(audits[0]?.targetTable).toBe('demo_widgets')
    expect(audits[0]?.after).toMatchObject({ name: 'Poplin shirt' })

    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventName, 'core.pending_change.committed'))
    expect(events.some((e) => (e.payload as { pendingChangeId?: string }).pendingChangeId === id))
      .toBe(true)
  })

  it('5 · a second approve gets a 409 and commits nothing extra', async () => {
    const { id } = await propose(ctxA, draft())
    const before = await countWidgets(COMPANY_A)

    await approve(ctxA, { pendingChangeId: id })
    const afterFirst = await countWidgets(COMPANY_A)
    expect(afterFirst).toBe(before + 1)

    await expect(approve(ctxA, { pendingChangeId: id })).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
    })

    // One commit ever happens (architecture §9).
    expect(await countWidgets(COMPANY_A)).toBe(afterFirst)
  })

  it('6 · a draft that no longer satisfies a tightened schema fails instead of committing', async () => {
    // Written while quantity >= 1 was acceptable…
    const { id } = await propose(ctxA, { ...draft(), payload: { name: 'Tee', quantity: 40 } })
    const before = await countWidgets(COMPANY_A)

    // …the factory then tightens the rule. The draft must not sneak through.
    registerDemo(widgetTight)

    await expect(approve(ctxA, { pendingChangeId: id })).rejects.toMatchObject({
      code: 'validation_failed',
    })

    expect(await countWidgets(COMPANY_A)).toBe(before)

    // And the reviewer is told WHY — the explanation survives the failed approve.
    const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id))
    expect(row?.status).toBe('failed')
    expect(row?.error).toMatchObject({ messageKey: 'errors.payload_invalid' })
  })

  it('7 · reject closes the draft, writes no row, and is still audited', async () => {
    const { id } = await propose(ctxA, draft())
    const before = await countWidgets(COMPANY_A)

    await reject(ctxA, id, 'quantity looks wrong on the PO')

    const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id))
    expect(row?.status).toBe('rejected')
    expect(row?.reviewNote).toBe('quantity looks wrong on the PO')
    expect(await countWidgets(COMPANY_A)).toBe(before)

    const audits = await db.select().from(auditLog).where(eq(auditLog.pendingChangeId, id))
    expect(audits[0]?.action).toBe('reject')
  })

  it('8 · another company cannot see or approve the draft', async () => {
    const { id } = await propose(ctxA, draft())
    const before = await countWidgets(COMPANY_A)

    // RLS makes it invisible rather than forbidden — company B has no such row.
    await expect(approve(ctxB, { pendingChangeId: id })).rejects.toMatchObject({
      code: 'not_found',
    })

    expect(await countWidgets(COMPANY_A)).toBe(before)
    expect(await countWidgets(COMPANY_B)).toBe(0)

    const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id))
    expect(row?.status).toBe('pending')
  })

  it('9 · auto-approve does not fire when the weakest field is below the floor', async () => {
    await db.insert(approvalRules).values({
      companyId: COMPANY_A,
      moduleId: '__demo__',
      targetTable: 'demo_widgets',
      requiredRoles: ['owner'],
      autoApprove: true,
      // The draft's weakest field is 0.71 — below this floor, so a human must look.
      minConfidence: '0.900',
      priority: 500,
    })

    try {
      const low = await propose(ctxA, draft())
      expect(low.status).toBe('pending')

      // Same rule, a draft where every field clears the floor: now it may skip the human.
      const high = await propose(ctxA, {
        ...draft(),
        fieldConfidence: { name: 0.99, quantity: 0.96 },
      })
      expect(high.status).toBe('committed')
    } finally {
      await db.delete(approvalRules).where(eq(approvalRules.companyId, COMPANY_A))
    }
  })

  it('9b · a two-approver rule does not commit on the first approval', async () => {
    // `approvals_required` was stored and ignored until now. A rule demanding two approvers
    // is a rule about two DIFFERENT people.
    await db.insert(approvalRules).values({
      companyId: COMPANY_A,
      moduleId: '__demo__',
      targetTable: 'demo_widgets',
      requiredRoles: ['owner', 'admin'],
      approvalsRequired: 2,
      priority: 600,
    })

    const secondApprover = `gate-b-second-${randomUUID().slice(0, 8)}`
    await db.insert(users).values({
      id: secondApprover,
      email: `${secondApprover}@fabricxai.test`,
      name: 'Second Approver',
    })

    let draftId: string | null = null
    try {
      const before = await countWidgets(COMPANY_A)
      const { id } = await propose(ctxA, draft())
      draftId = id

      const first = await approve(ctxA, { pendingChangeId: id })
      expect(first.status).toBe('awaiting_approvals')
      expect(first.committedRowId).toBeNull()
      expect(first.approvals).toBe(1)
      expect(await countWidgets(COMPANY_A)).toBe(before)

      // The same person clicking again is still one approval — otherwise a two-approver
      // control is a one-approver control with extra steps.
      const again = await approve(ctxA, { pendingChangeId: id })
      expect(again.status).toBe('awaiting_approvals')
      expect(again.approvals).toBe(1)
      expect(await countWidgets(COMPANY_A)).toBe(before)

      // The draft stays pending, so it is still in the other approver's inbox.
      const [stillPending] = await db
        .select()
        .from(pendingChanges)
        .where(eq(pendingChanges.id, id))
      expect(stillPending?.status).toBe('pending')

      const second = await approve(
        { ...ctxA, userId: secondApprover, roles: ['admin'] },
        { pendingChangeId: id },
      )
      expect(second.status).toBe('committed')
      expect(second.committedRowId).not.toBeNull()
      expect(await countWidgets(COMPANY_A)).toBe(before + 1)
    } finally {
      await db.delete(approvalRules).where(eq(approvalRules.companyId, COMPANY_A))
      // The approval rows must go before the approver: `approver_user_id` is ON DELETE
      // RESTRICT on purpose — "who signed off on this" must survive somebody being
      // removed. Deleting the draft cascades them.
      if (draftId) await db.delete(pendingChanges).where(eq(pendingChanges.id, draftId))
      await db.delete(users).where(eq(users.id, secondApprover))
    }
  })

  it('10 · a non-approver role is refused', async () => {
    const { id } = await propose(ctxA, draft())
    const viewer: RequestCtx = { ...ctxA, roles: ['viewer'] }

    const error = await approve(viewer, { pendingChangeId: id }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(403)
  })
})
