/**
 * Session 3b services against real infrastructure: MinIO, Redis/BullMQ, Postgres.
 *
 * These are the pieces that are easy to write and easy to get subtly wrong — a presigned
 * URL that does not actually work, an "idempotent" replay that inserts twice, a relay
 * that marks events published before delivering them. None of that shows up in a
 * typecheck, so it gets exercised for real here.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, notifications, offlineKeys, outbox, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { createDownloadUrl, createUploadUrl, confirmUpload } from '@/modules/core/documents'
import { notify, listUnread, markRead } from '@/modules/core/notifications'
import {
  __resetSyncHandlers,
  registerSyncHandler,
  syncBatch,
} from '@/modules/core/offline-sync'
import { emit } from '@/modules/core/outbox'
import { withTenantTx } from '@/modules/core/tenancy'
import { relayOnce } from '@/worker/processors/outbox-relay'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const USER = `svc-user-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }

beforeAll(async () => {
  await db
    .insert(companies)
    .values({ id: COMPANY, name: 'Services Co', slug: `svc-${COMPANY.slice(0, 8)}` })
    .onConflictDoNothing()
  await db
    .insert(users)
    .values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Service Tester' })
    .onConflictDoNothing()

  await db.execute(sql`
    create table if not exists demo_sync_rows (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references companies(id) on delete cascade,
      note text not null
    )`)
  await db.execute(sql`alter table demo_sync_rows enable row level security`)
  await db.execute(sql`alter table demo_sync_rows force row level security`)
  await db.execute(sql`drop policy if exists demo_sync_tenant on demo_sync_rows`)
  await db.execute(sql`
    create policy demo_sync_tenant on demo_sync_rows for all to fabricxai_app
      using (company_id = app.current_company_id())
      with check (company_id = app.current_company_id())`)
  await db.execute(sql`grant select, insert, update, delete on demo_sync_rows to fabricxai_app`)
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id = ${COMPANY}`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(users).where(eq(users.id, USER))
  await db.execute(sql`drop table if exists demo_sync_rows`)
  __resetSyncHandlers()
  await client.end()
})

describe('documents · MinIO round trip', () => {
  it('presigned upload and download actually work against real storage', async () => {
    const body = Buffer.from('%PDF-1.4 pretend buyer PO\n')

    const { documentId, uploadUrl } = await createUploadUrl(ctx, {
      filename: 'buyer-po.pdf',
      mimeType: 'application/pdf',
      sizeBytes: body.byteLength,
      kind: 'buyer_po',
    })

    // A presigned URL that has never been exercised is a guess, not a feature.
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'content-length': String(body.byteLength) },
      body,
    })
    expect(put.status, await put.text()).toBe(200)

    const confirmed = await confirmUpload(ctx, documentId)
    expect(confirmed.status).toBe('ready')
    // Size comes from storage, not from what the client claimed.
    expect(confirmed.sizeBytes).toBe(body.byteLength)

    const { url } = await createDownloadUrl(ctx, documentId)
    const got = await fetch(url)
    expect(got.status).toBe(200)
    expect(Buffer.from(await got.arrayBuffer())).toEqual(body)
  })

  it('refuses a disallowed mime type and an oversized upload', async () => {
    await expect(
      createUploadUrl(ctx, {
        filename: 'payload.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 100,
      }),
    ).rejects.toMatchObject({ messageKey: 'errors.document_type_not_allowed' })

    await expect(
      createUploadUrl(ctx, {
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 40 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ messageKey: 'errors.document_too_large' })
  })

  it('marks a document failed when the bytes never arrived', async () => {
    const { documentId } = await createUploadUrl(ctx, {
      filename: 'never-uploaded.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
    })

    // Confirm without ever PUTting — the row must not be allowed to claim 'ready'.
    await expect(confirmUpload(ctx, documentId)).rejects.toMatchObject({
      messageKey: 'errors.document_not_uploaded',
    })
  })
})

describe('notifications · dedupe makes jobs re-runnable', () => {
  it('collapses repeats on dedupeKey but keeps distinct ones', async () => {
    const dedupeKey = `test:lc-expiry:${randomUUID()}`

    const first = await notify(ctx, {
      userId: USER,
      kind: 'lc.expiry_near',
      severity: 'critical',
      titleKey: 'notifications.lc.expiry_near.title',
      params: { daysLeft: 6 },
      dedupeKey,
    })
    expect(first).not.toBeNull()

    // The nightly scan runs again and re-emits the same thing.
    const second = await notify(ctx, {
      userId: USER,
      kind: 'lc.expiry_near',
      titleKey: 'notifications.lc.expiry_near.title',
      dedupeKey,
    })
    expect(second).toBeNull()

    const rows = await db.select().from(notifications).where(eq(notifications.companyId, COMPANY))
    expect(rows.filter((r) => r.dedupeKey === dedupeKey)).toHaveLength(1)
  })

  it('lists unread and marks read', async () => {
    await notify(ctx, {
      userId: USER,
      kind: 'system.test',
      titleKey: 'notifications.system.test.title',
    })

    const unread = await listUnread(ctx)
    expect(unread.length).toBeGreaterThan(0)

    const marked = await markRead(ctx, unread.map((n) => n.id))
    expect(marked).toBe(unread.length)
    // Marking again is a no-op — the first read time is the one that matters.
    expect(await markRead(ctx, unread.map((n) => n.id))).toBe(0)
  })
})

describe('offline sync · replay is a no-op', () => {
  it('applies once and returns the same row on replay', async () => {
    __resetSyncHandlers()
    let handlerCalls = 0

    registerSyncHandler('__demo__', 'record_note', async (c, tx, row) => {
      handlerCalls += 1
      const result = await tx.execute<{ id: string }>(
        sql`insert into demo_sync_rows (company_id, note) values (${c.companyId}, ${String(row.payload.note)}) returning id`,
      )
      const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
      return { rowId: (rows[0] as { id: string }).id }
    })

    const batch = [
      {
        offlineKey: `ok-${randomUUID()}`,
        moduleId: '__demo__',
        operation: 'record_note',
        payload: { note: 'line 3 hour 14' },
      },
    ]

    const first = await syncBatch(ctx, batch)
    expect(first[0]?.status).toBe('applied')
    const rowId = (first[0] as { rowId: string }).rowId

    // The tablet lost the response and sent the whole batch again.
    const replay = await syncBatch(ctx, batch)
    expect(replay[0]?.status).toBe('duplicate')
    // Same row returned, so the device reconciles against what actually landed.
    expect((replay[0] as { rowId: string }).rowId).toBe(rowId)

    expect(handlerCalls).toBe(1)

    const count = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from demo_sync_rows where company_id = ${COMPANY}`,
    )
    const rows = Array.isArray(count) ? count : ((count as { rows?: unknown[] }).rows ?? [])
    expect(Number((rows[0] as { n: string }).n)).toBe(1)
  })

  it('rejects an unknown operation without poisoning the rest of the batch', async () => {
    const results = await syncBatch(ctx, [
      {
        offlineKey: `bad-${randomUUID()}`,
        moduleId: '__demo__',
        operation: 'not_registered',
        payload: {},
      },
      {
        offlineKey: `good-${randomUUID()}`,
        moduleId: '__demo__',
        operation: 'record_note',
        payload: { note: 'still lands' },
      },
    ])

    // One bad row must not discard the operator's other forty-nine.
    expect(results[0]?.status).toBe('rejected')
    expect(results[1]?.status).toBe('applied')
  })

  it('remembers a rejection so a replay is not retried forever', async () => {
    const offlineKey = `fail-${randomUUID()}`
    __resetSyncHandlers()
    registerSyncHandler('__demo__', 'always_fails', async () => {
      throw new Error('handler blew up')
    })

    const row = {
      offlineKey,
      moduleId: '__demo__',
      operation: 'always_fails',
      payload: {},
    }

    const first = await syncBatch(ctx, [row])
    expect(first[0]?.status).toBe('rejected')

    const replay = await syncBatch(ctx, [row])
    expect(replay[0]?.status).toBe('rejected')

    const ledger = await db.select().from(offlineKeys).where(eq(offlineKeys.offlineKey, offlineKey))
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.status).toBe('rejected')
  })
})

describe('outbox relay · at-least-once delivery', () => {
  it('delivers an event to BullMQ and marks it published exactly once', async () => {
    const eventId = await withTenantTx(ctx, (tx) =>
      emit(ctx, tx, {
        eventName: 'core.test.relayed',
        payload: { hello: 'floor' },
        aggregateTable: 'demo_sync_rows',
        aggregateId: randomUUID(),
      }),
    )

    const [before] = await db.select().from(outbox).where(eq(outbox.id, eventId))
    expect(before?.publishedAt).toBeNull()

    /*
     * Relay until THIS event is published, rather than once.
     *
     * `relayOnce` takes a batch of 100 oldest-first, so a single pass only reaches an event
     * emitted just now when the unpublished backlog is smaller than a batch. That made this
     * test pass on a clean database and fail on a real one — it failed after a session of
     * seeding and screen work left 84 events behind, and would fail in CI the moment the
     * seed grows. The assertion is about at-least-once delivery, not about batch size.
     */
    let relayed = 0
    for (let pass = 0; pass < 50; pass += 1) {
      const result = await relayOnce()
      relayed += result.relayed
      const [row] = await db.select().from(outbox).where(eq(outbox.id, eventId))
      if (row?.publishedAt) break
      // Nothing left to relay and still unpublished is a real failure, not a short batch.
      if (result.relayed === 0) break
    }
    expect(relayed).toBeGreaterThan(0)

    const [after] = await db.select().from(outbox).where(eq(outbox.id, eventId))
    expect(after?.publishedAt).not.toBeNull()

    // A second pass must not re-deliver an already-published event.
    const [firstRow] = await db
      .select()
      .from(outbox)
      .where(eq(outbox.id, eventId))
    const publishedAt = firstRow?.publishedAt
    await relayOnce()
    const [again] = await db.select().from(outbox).where(eq(outbox.id, eventId))
    expect(again?.publishedAt).toEqual(publishedAt)
  })
})
