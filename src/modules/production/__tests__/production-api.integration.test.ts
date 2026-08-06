/**
 * 6.1 over HTTP (plan 5.7, audit BE-B6 / TEST-B2).
 *
 * `k6/production_burst.js` has targeted `/api/production/outputs` and `/api/production/board`
 * since it was written and had nothing to hit, so the flagship load scenario could not run
 * at all. These are the routes, exercised the way k6 exercises them: real requests, real
 * cookies, and the assertion k6 cannot make from response codes.
 *
 * ## The one that matters is the row count
 *
 * The scenario's own header says it: "zero lost or duplicated rows — asserted from row
 * counts after the run, not from response codes. A 200 that wrote nothing is the failure
 * this is looking for." `(line, produced_on, hour_slot)` is a natural key and the write is
 * `ON CONFLICT DO UPDATE`, so posting the same hour twice must leave one row holding the
 * SECOND value. That is what makes a burst safe to replay, and it is asserted here rather
 * than left to a human running SQL after a load test.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles, users } from '@/db/schema/core'
import { lines } from '@/modules/planning/schema'
import { hourlyOutputs } from '@/modules/production/schema'

const BASE_URL = process.env.APP_URL ?? `http://localhost:${process.env.INTEGRATION_PORT ?? 3100}`
const PASSWORD = 'correct horse battery staple'
const RUN = randomUUID().slice(0, 8)

const client = createDirectClient()
const db = createDirectDb(client)

/** Every company a signup provisioned, so `afterAll` leaves none behind for other suites. */
const provisioned = new Set<string>()

let companyId = ''
let lineId = ''
let supervisor = ''
let planner = ''
let storekeeper = ''

const PRODUCED_ON = '2026-08-04'

/**
 * Sign somebody up, verify them, and give them exactly one role on the shared company.
 *
 * Verification by UPDATE rather than through Mailpit: this suite is about two HTTP routes,
 * and routing every actor through SMTP would make it fail for a reason that has nothing to
 * do with them.
 */
async function makeActor(role: string, label: string): Promise<string> {
  const email = `prod-${label}-${RUN}@fabricxai.test`

  await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      name: `Prod ${label}`,
      companyName: `tmp-${label}-${RUN}`,
    }),
  })

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error(`signup did not create ${email}`)

  await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id))

  const own = await db.select({ companyId: roles.companyId }).from(roles).where(eq(roles.userId, user.id))
  for (const row of own) provisioned.add(row.companyId)

  await db.delete(roles).where(eq(roles.userId, user.id))
  await db.insert(roles).values({ companyId, userId: user.id, role: role as never })

  const signIn = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })

  const cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) throw new Error(`no session cookie for ${label}`)

  return cookie
}

async function postOutputs(cookie: string, body: unknown) {
  const response = await fetch(`${BASE_URL}/api/production/outputs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

async function readBoard(cookie: string, producedOn?: string) {
  const url = producedOn
    ? `${BASE_URL}/api/production/board?producedOn=${producedOn}`
    : `${BASE_URL}/api/production/board`

  const response = await fetch(url, { headers: { cookie } })
  return { status: response.status, body: await response.json().catch(() => null) }
}

beforeAll(async () => {
  // The first signup makes the company every other actor is moved onto, so all three see
  // the same board and only the ROLE differs.
  const ownerEmail = `prod-owner-${RUN}@fabricxai.test`
  await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: ownerEmail,
      password: PASSWORD,
      name: 'Prod Owner',
      companyName: `Prod Co ${RUN}`,
    }),
  })

  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail))
  const [ownerRole] = await db
    .select({ companyId: roles.companyId })
    .from(roles)
    .where(eq(roles.userId, owner!.id))

  companyId = ownerRole!.companyId
  provisioned.add(companyId)

  const [line] = await db
    .insert(lines)
    .values({ companyId, code: `L-${RUN.slice(0, 4)}`, name: 'Burst line' })
    .returning({ id: lines.id })
  lineId = line!.id

  supervisor = await makeActor('production', 'supervisor')
  planner = await makeActor('planner', 'planner')
  storekeeper = await makeActor('store', 'store')
}, 120_000)

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id = ${companyId}`)
  for (const id of provisioned) {
    await db.delete(companies).where(eq(companies.id, id))
  }
  await db.execute(sql`delete from users where email like ${`prod-%-${RUN}@fabricxai.test`}`)
  await client.end()
})

describe('POST /api/production/outputs', () => {
  it('accepts a supervisor’s hour and writes the cell', async () => {
    const { status, body } = await postOutputs(supervisor, {
      entries: [{ lineId, producedOn: PRODUCED_ON, hourSlot: 9, target: 120, actual: 104 }],
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ written: 1 })

    const [cell] = await db
      .select()
      .from(hourlyOutputs)
      .where(and(eq(hourlyOutputs.lineId, lineId), eq(hourlyOutputs.hourSlot, 9)))

    expect(cell?.actual).toBe(104)
    expect(cell?.target).toBe(120)
  })

  it('rewrites the same cell rather than adding a second one', async () => {
    /*
     * The assertion the k6 scenario asks a human to make in SQL afterwards, made here.
     *
     * Ten supervisors submitting the same hour, or one supervisor correcting a count, take
     * the identical path: `(line, produced_on, hour_slot)` is unique and the write is
     * `ON CONFLICT DO UPDATE`. So the row count is bounded by lines × 24 however many
     * requests were sent — and a burst that silently duplicated a factory's output figures
     * would be invisible in the response codes k6 checks.
     */
    await postOutputs(supervisor, {
      entries: [{ lineId, producedOn: PRODUCED_ON, hourSlot: 14, target: 120, actual: 98 }],
    })
    await postOutputs(supervisor, {
      entries: [{ lineId, producedOn: PRODUCED_ON, hourSlot: 14, target: 120, actual: 111 }],
    })

    const cells = await db
      .select()
      .from(hourlyOutputs)
      .where(and(eq(hourlyOutputs.lineId, lineId), eq(hourlyOutputs.hourSlot, 14)))

    expect(cells).toHaveLength(1)
    // The SECOND value. A correction that left the first would make the board disagree with
    // the person who typed it.
    expect(cells[0]?.actual).toBe(111)
  })

  it('takes a whole burst in one request', async () => {
    // Fifty lines at 17:00 is the shape the scenario models; the service writes the batch as
    // a single multi-row upsert rather than fifty round trips.
    const entries = Array.from({ length: 12 }, (_, i) => ({
      lineId,
      producedOn: '2026-08-05',
      hourSlot: i,
      target: 120,
      actual: 100 + i,
    }))

    const { status, body } = await postOutputs(supervisor, { entries })

    expect(status).toBe(200)
    expect(body).toMatchObject({ written: 12 })
  })

  it('names the entry it cannot take, not just "invalid"', async () => {
    // A terminal posting fifty lines needs to know WHICH one is wrong, or it retries the
    // whole hour forever.
    const { status, body } = await postOutputs(supervisor, {
      entries: [{ lineId, producedOn: '2026-02-31', hourSlot: 9, actual: 10 }],
    })

    expect(status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
    expect(JSON.stringify(body.error.issues)).toContain('producedOn')
  })

  it('refuses a body that is not JSON at all', async () => {
    const { status, body } = await postOutputs(supervisor, 'not json')

    expect(status).toBe(400)
    expect(body.error.code).toBe('invalid_json')
  })

  it('refuses a role that does not run a line', async () => {
    // The sync handler for the same operation gates on `production` too, so the two doors
    // into this write cannot disagree about who may use them.
    const { status } = await postOutputs(storekeeper, {
      entries: [{ lineId, producedOn: PRODUCED_ON, hourSlot: 3, actual: 10 }],
    })

    expect(status).toBe(403)
  })

  it('refuses a caller with no session', async () => {
    const response = await fetch(`${BASE_URL}/api/production/outputs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    })

    expect(response.status).toBe(401)
  })
})

describe('GET /api/production/board', () => {
  it('serves the day the caller asked for', async () => {
    const { status, body } = await readBoard(supervisor, PRODUCED_ON)

    expect(status).toBe(200)
    expect(body.producedOn).toBe(PRODUCED_ON)
    expect(body.cells.length).toBeGreaterThan(0)
    expect(body.cells.every((c: { producedOn: string }) => c.producedOn === PRODUCED_ON)).toBe(true)
  })

  it('defaults to the factory’s today rather than everything', async () => {
    /*
     * `hourly_outputs` is partitioned by month and the query filters on an equality over
     * `produced_on`, which is what removes the other partitions from the plan. A caller that
     * omits the date must stay on that path — and the default is the FACTORY's day, because
     * UTC answers with yesterday's board for six hours every night, which is exactly the
     * window a night shift is posting into.
     */
    const { status, body } = await readBoard(supervisor)

    expect(status).toBe(200)
    expect(body.producedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.cells.every((c: { producedOn: string }) => c.producedOn === body.producedOn)).toBe(
      true,
    )
  })

  it('lets a planner read the floor without writing to it', async () => {
    // `nav.ts` says exactly this for `/lines`: planning and quality read the floor's
    // progress, and the write above is production's alone.
    expect((await readBoard(planner, PRODUCED_ON)).status).toBe(200)

    const { status } = await postOutputs(planner, {
      entries: [{ lineId, producedOn: PRODUCED_ON, hourSlot: 4, actual: 10 }],
    })
    expect(status).toBe(403)
  })

  it('refuses a malformed date instead of scanning every partition', async () => {
    const { status, body } = await readBoard(supervisor, 'august')

    expect(status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
  })

  it('shows a role from another department nothing', async () => {
    expect((await readBoard(storekeeper, PRODUCED_ON)).status).toBe(403)
  })
})
