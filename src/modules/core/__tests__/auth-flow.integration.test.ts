/**
 * Phase 0 exit criterion A — signup → verify → login works locally.
 * Definition: docs/runbooks/phase-0-exit.md
 *
 * API-level, no browser. What is under test is Better Auth plus real SMTP delivery, not a
 * UI; Playwright is a Phase 4 tool and would make this slower and flakier while proving
 * strictly less. The verification link is read from Mailpit's REST API, so nothing here
 * needs a human.
 *
 * The assertions that matter are the refusals — sign-in before verification, a garbage
 * token, a request with no cookie — and the fact that a session resolves all the way to
 * `{companyId, userId, roles}`. A manual click-through checks none of those.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles, users } from '@/db/schema/core'
import { sessions } from '@/db/schema/auth'

// Set by the global setup, which owns an exclusive port (see vitest.globalsetup.integration.ts).
const BASE_URL = process.env.APP_URL ?? `http://localhost:${process.env.INTEGRATION_PORT ?? 3100}`
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025'

// Unique per run so repeated local runs never collide on the unique email index.
const RUN_ID = Math.random().toString(36).slice(2, 10)
const EMAIL = `gate-a-${RUN_ID}@fabricxai.test`
const PASSWORD = 'correct-horse-battery-staple'
const FACTORY_NAME = `Gate A Apparels ${RUN_ID}`

const client = createDirectClient()
const db = createDirectDb(client)

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
  Subject: string
}

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
}

/** Poll Mailpit until the verification message for `address` shows up. */
async function waitForMail(address: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const listed = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`)
    const { messages } = (await listed.json()) as { messages: MailpitMessage[] }
    const match = messages.find((m) =>
      m.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
    )

    if (match) {
      const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)
      const { Text, HTML } = (await detail.json()) as { Text: string; HTML: string }
      // Prefer the plaintext part — the HTML one carries &amp;-escaped query strings.
      const found = /https?:\/\/[^\s"'<>]*verify-email[^\s"'<>]*/.exec(Text || HTML)
      if (found?.[0]) return found[0]
      throw new Error(`no verification link in the message to ${address}:\n${Text}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`no verification email for ${address} within ${timeoutMs}ms`)
}

/** Better Auth returns several Set-Cookie headers; the session one is what we need. */
function sessionCookie(response: Response): string {
  const raw = response.headers.getSetCookie()
  const pairs = raw.map((c) => c.split(';')[0]).filter(Boolean)
  expect(pairs.length, 'expected at least one Set-Cookie').toBeGreaterThan(0)
  return pairs.join('; ')
}

describe('gate A · signup → verify → login', () => {
  let cookie: string

  beforeAll(async () => {
    // Start from a clean inbox so waitForMail cannot match an earlier run's message.
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  })

  afterAll(async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    if (user) {
      const memberships = await db
        .select({ companyId: roles.companyId })
        .from(roles)
        .where(eq(roles.userId, user.id))
      // Company first: roles/sessions cascade from both sides.
      for (const m of memberships) await db.delete(companies).where(eq(companies.id, m.companyId))
      await db.delete(users).where(eq(users.id, user.id))
    }
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
    await client.end()
  })

  it('1 · signs up and creates an unverified user', async () => {
    const response = await post('/api/auth/sign-up/email', {
      email: EMAIL,
      password: PASSWORD,
      name: FACTORY_NAME,
    })

    expect(response.status, await response.clone().text()).toBe(200)

    const [user] = await db
      .select({ id: users.id, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, EMAIL))

    expect(user).toBeDefined()
    expect(user?.emailVerified).toBe(false)
  })

  it('2 · refuses sign-in before the email is verified', async () => {
    // The half of the flow that actually matters. A verification step that does not gate
    // login is decoration.
    const response = await post('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD })

    expect(response.ok).toBe(false)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.getSetCookie().join(';')).not.toMatch(/session/i)
  })

  it('3 · refuses a garbage verification token', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/verify-email?token=not-a-real-token`, {
      redirect: 'manual',
    })
    // Better Auth may 4xx or redirect to an error page; what must NOT happen is a
    // session being minted, which is the actual risk in a forged verification link.
    expect(response.headers.getSetCookie().join(';')).not.toMatch(/session_token/i)
    expect(response.status).not.toBe(200)

    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, EMAIL))
    expect(user?.emailVerified).toBe(false)

    // And no session row exists for this user yet, by any route.
    const live = await db
      .select({ id: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(users.email, EMAIL))
    expect(live).toHaveLength(0)
  })

  it('4 · delivers a verification email and verifies the account', async () => {
    const link = await waitForMail(EMAIL)
    expect(link).toContain('/api/auth/verify-email')

    const response = await fetch(link, { redirect: 'manual' })
    // Better Auth redirects to callbackURL on success.
    expect([200, 302, 307]).toContain(response.status)

    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, EMAIL))

    expect(user?.emailVerified).toBe(true)
  })

  it('5 · signs in after verification and issues a session cookie', async () => {
    const response = await post('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD })
    expect(response.status, await response.clone().text()).toBe(200)

    const raw = response.headers.getSetCookie().join('\n')
    expect(raw).toMatch(/HttpOnly/i)

    cookie = sessionCookie(response)
    expect(cookie).toBeTruthy()
  })

  it('6 · signup created the company and made the user its owner', async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    expect(user).toBeDefined()

    const memberships = await db
      .select({ companyId: roles.companyId, role: roles.role })
      .from(roles)
      .where(eq(roles.userId, user!.id))

    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.role).toBe('owner')

    const [company] = await db
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, memberships[0]!.companyId))

    expect(company?.name).toBe(FACTORY_NAME)
    expect(company?.slug).toBeTruthy()

    // The session must be bound to that company, or ctx has nothing to resolve from.
    const [session] = await db
      .select({ activeOrganizationId: sessions.activeOrganizationId })
      .from(sessions)
      .where(eq(sessions.userId, user!.id))

    expect(session?.activeOrganizationId).toBe(company?.id)
  })

  it('7 · resolves the session all the way to ctx {companyId, userId, roles}', async () => {
    // This is the part every later module depends on, and the part a manual
    // click-through never actually checks.
    const response = await fetch(`${BASE_URL}/api/me`, { headers: { cookie } })
    expect(response.status, await response.clone().text()).toBe(200)

    const ctx = (await response.json()) as {
      userId: string
      companyId: string
      roles: string[]
    }

    expect(ctx.userId).toBeTruthy()
    expect(ctx.companyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(ctx.roles).toEqual(['owner'])
  })

  it('8 · refuses the same route without a cookie', async () => {
    const response = await fetch(`${BASE_URL}/api/me`)
    expect(response.status).toBe(401)
  })
})
