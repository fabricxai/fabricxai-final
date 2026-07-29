/**
 * 2.2 integration — tenancy, the gate, and the concurrency case architecture §9 names
 * explicitly: "UD/BTB concurrent overdraw attempt → row-lock inside the gate check
 * transaction; second writer blocks then fails the gate."
 *
 * That last one is the reason this suite exists. A balance check that reads outside a
 * lock passes every single-threaded test and still lets two storekeepers issue the same
 * last roll — and the failure surfaces as a customs discrepancy months later, when
 * nobody can reconstruct what happened.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { udConsumptions, uds } from '@/modules/commercial/schema'
import {
  checkUdBalance,
  drawUdStandalone,
  expireLapsedUds,
  getUdBalance,
  snapshotReconciliation,
} from '@/modules/commercial/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { AppError } from '@/modules/core/errors'
import { withTenantRead } from '@/modules/core/tenancy'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY_A = randomUUID()
const COMPANY_B = randomUUID()
const USER_A = `ud-a-${randomUUID().slice(0, 8)}`
const UD_A = randomUUID()
const UD_TIGHT = randomUUID()
const UD_LAPSED = randomUUID()

const ctxA: RequestCtx = { companyId: COMPANY_A, userId: USER_A, roles: ['store'] }
const ctxB: RequestCtx = { companyId: COMPANY_B, userId: USER_A, roles: ['store'] }
const ownerA: RequestCtx = { companyId: COMPANY_A, userId: USER_A, roles: ['owner'] }

const TODAY = '2026-06-15'

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY_A, name: 'Bond A', slug: `bond-a-${COMPANY_A.slice(0, 8)}` },
    { id: COMPANY_B, name: 'Bond B', slug: `bond-b-${COMPANY_B.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER_A, email: `${USER_A}@fabricxai.test`, name: 'Storekeeper' })

  await db.insert(uds).values([
    {
      id: UD_A,
      companyId: COMPANY_A,
      number: 'UD/DHK/2026/0417',
      validUntil: '2026-12-31',
      authorizedItems: [
        { itemRef: 'FAB-COTTON-160GSM', qty: '12000.00', unit: 'M' },
        { itemRef: 'TRM-BUTTON-18L', qty: '48000.00', unit: 'PCS' },
      ],
      createdBy: USER_A,
    },
    {
      // Exactly 100 metres left, so two concurrent 60m draws cannot both fit.
      id: UD_TIGHT,
      companyId: COMPANY_A,
      number: 'UD/DHK/2026/0418',
      validUntil: '2026-12-31',
      authorizedItems: [{ itemRef: 'FAB-RIB-2X1', qty: '100.00', unit: 'M' }],
      createdBy: USER_A,
    },
    {
      id: UD_LAPSED,
      companyId: COMPANY_A,
      number: 'UD/DHK/2025/0099',
      validUntil: '2025-12-31',
      authorizedItems: [{ itemRef: 'FAB-OLD', qty: '500.00', unit: 'M' }],
      createdBy: USER_A,
    },
  ])
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY_A}, ${COMPANY_B})`)
  await db.delete(companies).where(eq(companies.id, COMPANY_A))
  await db.delete(companies).where(eq(companies.id, COMPANY_B))
  await db.delete(users).where(eq(users.id, USER_A))
  await client.end()
})

describe('2.2 · tenancy', () => {
  it('another company cannot see or draw against this UD', async () => {
    const visible = await withTenantRead(ctxB, (tx) =>
      tx.select().from(uds).where(eq(uds.id, UD_A)),
    )
    expect(visible).toHaveLength(0)

    await expect(
      drawUdStandalone(ctxB, { udId: UD_A, itemRef: 'FAB-COTTON-160GSM', qty: '10.00', unit: 'M', today: TODAY }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('2.2 · the gate', () => {
  it('allows a draw inside the balance and records the consumption', async () => {
    const { decision } = await drawUdStandalone(ctxA, {
      udId: UD_A,
      itemRef: 'FAB-COTTON-160GSM',
      qty: '3000.00',
      unit: 'M',
      today: TODAY,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.remainingAfter).toBe('9000.00')

    const balance = await getUdBalance(ctxA, UD_A)
    expect(balance.items.find((i) => i.itemRef === 'FAB-COTTON-160GSM')?.free).toBe('9000.00')
  })

  it('blocks an overdraw with a structured, typed error — not a warning', async () => {
    const thrown = await drawUdStandalone(ctxA, {
      udId: UD_A,
      itemRef: 'FAB-COTTON-160GSM',
      qty: '9500.00',
      unit: 'M',
      today: TODAY,
    }).catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(AppError)
    const error = thrown as AppError
    expect(error.code).toBe('gate_blocked')
    expect(error.status).toBe(409)
    expect(error.details).toMatchObject({ gate: 'ud_balance', shortfall: '500.00' })

    // And nothing was written — a blocked gate leaves no trace in the ledger.
    const ledger = await db.select().from(udConsumptions).where(eq(udConsumptions.udId, UD_A))
    expect(ledger).toHaveLength(1)
  })

  it('blocks an item the declaration never authorised', async () => {
    await expect(
      drawUdStandalone(ctxA, { udId: UD_A, itemRef: 'FAB-NOT-ON-UD', qty: '1.00', unit: 'M', today: TODAY }),
    ).rejects.toMatchObject({ messageKey: 'commercial.ud.item_not_authorized' })
  })

  it('blocks a draw in the wrong unit rather than converting it', async () => {
    await expect(
      drawUdStandalone(ctxA, { udId: UD_A, itemRef: 'FAB-COTTON-160GSM', qty: '10.00', unit: 'KG', today: TODAY }),
    ).rejects.toMatchObject({ messageKey: 'commercial.ud.unit_mismatch' })
  })

  it('an owner-approved override writes the draw AND flags it as an overdraw', async () => {
    const { decision, consumptionId } = await drawUdStandalone(ownerA, {
      udId: UD_A,
      itemRef: 'TRM-BUTTON-18L',
      qty: '50000.00',
      unit: 'PCS',
      today: TODAY,
      approvedOverride: true,
    })

    // The decision still says no — the override does not rewrite the finding, it records
    // that a human overrode it. An auditor needs both facts.
    expect(decision.allowed).toBe(false)
    expect(decision.shortfall).toBe('2000.00')

    const [row] = await db.select().from(udConsumptions).where(eq(udConsumptions.id, consumptionId))
    expect(row?.overrideOf).toBe(UD_A)
  })
})

describe('2.2 · concurrency (architecture §9)', () => {
  it('two simultaneous draws for the last of a roll cannot both succeed', async () => {
    // 100m free; two storekeepers each try 60m at the same moment.
    const attempts = await Promise.allSettled([
      drawUdStandalone(ctxA, { udId: UD_TIGHT, itemRef: 'FAB-RIB-2X1', qty: '60.00', unit: 'M', today: TODAY }),
      drawUdStandalone(ctxA, { udId: UD_TIGHT, itemRef: 'FAB-RIB-2X1', qty: '60.00', unit: 'M', today: TODAY }),
    ])

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled')
    const rejected = attempts.filter((a) => a.status === 'rejected')

    // Exactly one gets through. Without the FOR UPDATE lock both would read 100m free
    // and both would commit, leaving the factory 20m overdrawn against customs.
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'gate_blocked' })

    const ledger = await db.select().from(udConsumptions).where(eq(udConsumptions.udId, UD_TIGHT))
    expect(ledger).toHaveLength(1)

    const balance = await getUdBalance(ctxA, UD_TIGHT)
    expect(balance.items[0]?.free).toBe('40.00')
  })
})

describe('2.2 · lifecycle', () => {
  it('blocks against a lapsed UD and the nightly job marks it expired', async () => {
    const decision = await checkUdBalance(ctxA, {
      udId: UD_LAPSED,
      itemRef: 'FAB-OLD',
      qty: '1.00',
      unit: 'M',
      today: TODAY,
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonKey).toBe('commercial.ud.expired')

    const { expired } = await expireLapsedUds(ctxA, { today: TODAY })
    expect(expired).toBeGreaterThanOrEqual(1)

    const [row] = await db.select().from(uds).where(eq(uds.id, UD_LAPSED))
    expect(row?.status).toBe('expired')
  })

  it('a reconciliation snapshot is frozen and cannot be taken twice for a period', async () => {
    const snapshot = await snapshotReconciliation(ownerA, { udId: UD_A, period: '2026-06' })
    expect(snapshot.items.length).toBeGreaterThan(0)

    // Regenerating a customs submission must produce the same figures, so the period is
    // taken once and the snapshot is what the PDF renders from.
    await expect(
      snapshotReconciliation(ownerA, { udId: UD_A, period: '2026-06' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})
