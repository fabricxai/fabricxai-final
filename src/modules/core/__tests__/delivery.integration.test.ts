/**
 * Notification delivery, against a real database and a collected mailbox.
 *
 * The `send` seam means no SMTP is involved — what is asserted is everything except the
 * socket:
 *
 *  - a critical notification goes out at once, one email per notification;
 *  - a role-addressed one reaches EVERY holder of that role, not a chosen one;
 *  - nothing is ever emailed twice, and a second run sends nothing;
 *  - non-critical notifications wait for the digest and arrive as ONE email per person;
 *  - a recipient reads it in their own locale;
 *  - a notification nobody can receive is marked rather than retried forever;
 *  - a key with no string is reported rather than silently mailed;
 *  - another company's notifications are invisible.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, notifications, profiles, roles, users } from '@/db/schema/core'
import type { SystemCtx } from '@/modules/core/ctx'
import {
  deliverCritical,
  deliverDigest,
  renderNotification,
  type DeliveryPolicy,
  type OutboundMail,
} from '@/modules/core/delivery'
import { notify } from '@/modules/core/notifications'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const OWNER_A = `own-a-${randomUUID().slice(0, 6)}`
const OWNER_B = `own-b-${randomUUID().slice(0, 6)}`
const FLOOR = `flr-${randomUUID().slice(0, 8)}`
const SILENT = `sil-${randomUUID().slice(0, 8)}`

const ctx: SystemCtx = { companyId: COMPANY, userId: null, roles: ['owner'], system: true }
const otherCtx: SystemCtx = { companyId: OTHER, userId: null, roles: ['owner'], system: true }

const POLICY: DeliveryPolicy = {
  emailSeverities: ['critical'],
  digestLimit: 20,
  appUrl: 'https://app.fabricxai.test',
}

/** A mailbox, in place of a mail server. */
let outbox: OutboundMail[] = []
const collect = async (mail: OutboundMail) => {
  outbox.push(mail)
}

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Mail Co', slug: `mail-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])

  await db.insert(users).values([
    { id: OWNER_A, email: `${OWNER_A}@fabricxai.test`, name: 'Owner A' },
    { id: OWNER_B, email: `${OWNER_B}@fabricxai.test`, name: 'Owner B' },
    { id: FLOOR, email: `${FLOOR}@fabricxai.test`, name: 'Floor Supervisor' },
    // Deliberately has no email address at all.
    { id: SILENT, email: '', name: 'No Address' },
  ])

  // The floor reads Bangla; the office reads English against the same rows.
  await db.insert(profiles).values([
    { userId: FLOOR, locale: 'bn' },
    { userId: OWNER_A, locale: 'en' },
  ])

  await db.insert(roles).values([
    { companyId: COMPANY, userId: OWNER_A, role: 'owner' },
    { companyId: COMPANY, userId: OWNER_B, role: 'owner' },
    { companyId: COMPANY, userId: FLOOR, role: 'maintenance' },
  ])
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  for (const id of [OWNER_A, OWNER_B, FLOOR, SILENT]) {
    await db.delete(users).where(eq(users.id, id))
  }
  await client.end()
})

beforeEach(async () => {
  outbox = []
  await db.delete(notifications).where(eq(notifications.companyId, COMPANY))
  await db.delete(notifications).where(eq(notifications.companyId, OTHER))
})

describe('critical notifications go out at once', () => {
  it('emails every holder of the addressed role', async () => {
    await notify(ctx, {
      role: 'owner',
      kind: 'compliance.certificate.expired',
      severity: 'critical',
      titleKey: 'compliance.notifications.certificate_expired.title',
      params: { kind: 'fire', expiresOn: '2026-02-01' },
    })

    const result = await deliverCritical(ctx, POLICY, collect)

    // "Somebody in commercial needs to look at this" is not a question of who is on shift,
    // and choosing one person means choosing wrong on the day they are away.
    expect(result.sent).toBe(2)
    expect(outbox.map((mail) => mail.to).sort()).toEqual(
      [`${OWNER_A}@fabricxai.test`, `${OWNER_B}@fabricxai.test`].sort(),
    )
    // The key was rendered, not mailed.
    expect(outbox[0]!.subject).toContain('fire')
    expect(outbox[0]!.subject).not.toContain('compliance.notifications')
  })

  it('NEVER sends the same notification twice', async () => {
    await notify(ctx, {
      role: 'owner',
      kind: 'compliance.certificate.expired',
      severity: 'critical',
      titleKey: 'compliance.notifications.certificate_expired.title',
      params: { kind: 'fire', expiresOn: '2026-02-01' },
    })

    await deliverCritical(ctx, POLICY, collect)
    const afterFirst = outbox.length

    const second = await deliverCritical(ctx, POLICY, collect)

    // Runs every five minutes. Without `emailed_at` this would be the same alert 288 times
    // a day, which is worse than never sending it.
    expect(second.considered).toBe(0)
    expect(outbox).toHaveLength(afterFirst)
  })

  it('leaves a WARNING for the digest', async () => {
    await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.parts.low',
      severity: 'warning',
      titleKey: 'maintenance.notifications.parts_low.title',
      params: { name: 'Looper', onHand: 2, minLevel: 5 },
    })

    const result = await deliverCritical(ctx, POLICY, collect)
    expect(result.considered).toBe(0)
    expect(outbox).toHaveLength(0)
  })

  it('renders in the reader’s own language', async () => {
    await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.pm.due',
      severity: 'critical',
      titleKey: 'maintenance.notifications.pm_due.title',
      params: { machineType: 'overlock', dueOn: '2026-03-01', daysOverdue: 9 },
    })

    await deliverCritical(ctx, POLICY, collect)

    // The floor supervisor's profile says Bangla.
    expect(outbox).toHaveLength(1)
    expect(outbox[0]!.to).toBe(`${FLOOR}@fabricxai.test`)
    expect(outbox[0]!.subject).toContain('overlock')
    expect(outbox[0]!.subject).toMatch(/[ঀ-৿]/)
  })

  it('marks a notification NOBODY can receive, rather than retrying it forever', async () => {
    await notify(ctx, {
      // A role nobody in this company holds.
      role: 'hr',
      kind: 'compliance.certificate.expired',
      severity: 'critical',
      titleKey: 'compliance.notifications.certificate_expired.title',
      params: { kind: 'fire', expiresOn: '2026-02-01' },
    })

    const first = await deliverCritical(ctx, POLICY, collect)
    expect(first.unreachable).toBe(1)
    expect(outbox).toHaveLength(0)

    // Being retried every five minutes will not make it deliverable, and it would sit in
    // every future run's backlog forever.
    const second = await deliverCritical(ctx, POLICY, collect)
    expect(second.considered).toBe(0)
  })

  it('REPORTS a key with no string rather than mailing it silently', async () => {
    await notify(ctx, {
      role: 'owner',
      kind: 'made.up',
      severity: 'critical',
      titleKey: 'nothing.defines.this.title',
      params: {},
    })

    const result = await deliverCritical(ctx, POLICY, collect)

    // It still goes out — the alert matters more than its wording — but nobody has to
    // notice the dotted key in an inbox to find out.
    expect(result.missingKeys).toEqual(['nothing.defines.this.title'])
    expect(outbox[0]!.subject).toBe('nothing.defines.this.title')
  })

  it('another company’s notifications are invisible', async () => {
    await notify(otherCtx, {
      role: 'owner',
      kind: 'compliance.certificate.expired',
      severity: 'critical',
      titleKey: 'compliance.notifications.certificate_expired.title',
      params: { kind: 'fire', expiresOn: '2026-02-01' },
    })

    const result = await deliverCritical(ctx, POLICY, collect)
    expect(result.considered).toBe(0)
    expect(outbox).toHaveLength(0)
  })
})

describe('the daily digest is ONE email per person', () => {
  it('collapses nine notifications into one email', async () => {
    for (let i = 0; i < 9; i += 1) {
      await notify(ctx, {
        role: 'maintenance',
        kind: 'maintenance.parts.low',
        severity: 'warning',
        titleKey: 'maintenance.notifications.parts_low.title',
        params: { name: `Part ${i}`, onHand: 0, minLevel: 5 },
        dedupeKey: `part-${i}`,
      })
    }

    const result = await deliverDigest(ctx, POLICY, collect)

    // Nine emails is the same failure as nine bell entries, and a factory that mutes the
    // digest has muted the criticals with it — same sender.
    expect(result.considered).toBe(9)
    expect(result.sent).toBe(1)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]!.text.split('\n').filter((line) => line.startsWith('•'))).toHaveLength(9)
  })

  it('truncates a flood and SAYS that it did', async () => {
    for (let i = 0; i < 25; i += 1) {
      await notify(ctx, {
        role: 'maintenance',
        kind: 'maintenance.parts.low',
        severity: 'warning',
        titleKey: 'maintenance.notifications.parts_low.title',
        params: { name: `Part ${i}`, onHand: 0, minLevel: 5 },
        dedupeKey: `flood-${i}`,
      })
    }

    await deliverDigest(ctx, { ...POLICY, digestLimit: 20 }, collect)

    // A 25-line email buries the ten that matter; silently dropping five is worse.
    expect(outbox[0]!.text).toContain('and 5 more')
  })

  it('sends each person their own digest', async () => {
    await notify(ctx, {
      role: 'owner',
      kind: 'notifications.approve.waiting',
      severity: 'info',
      titleKey: 'notifications.approve.waiting.title',
      params: { count: 3 },
    })
    await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.parts.low',
      severity: 'warning',
      titleKey: 'maintenance.notifications.parts_low.title',
      params: { name: 'Looper', onHand: 0, minLevel: 5 },
    })

    await deliverDigest(ctx, POLICY, collect)

    // Two owners and one maintenance supervisor.
    expect(outbox).toHaveLength(3)
    expect(new Set(outbox.map((mail) => mail.to)).size).toBe(3)
  })

  it('does not re-send a digest the next day', async () => {
    await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.parts.low',
      severity: 'warning',
      titleKey: 'maintenance.notifications.parts_low.title',
      params: { name: 'Looper', onHand: 0, minLevel: 5 },
    })

    await deliverDigest(ctx, POLICY, collect)
    const second = await deliverDigest(ctx, POLICY, collect)

    expect(second.considered).toBe(0)
    expect(outbox).toHaveLength(1)
  })

  it('leaves criticals alone — they were already sent', async () => {
    await notify(ctx, {
      role: 'owner',
      kind: 'compliance.certificate.expired',
      severity: 'critical',
      titleKey: 'compliance.notifications.certificate_expired.title',
      params: { kind: 'fire', expiresOn: '2026-02-01' },
    })

    const result = await deliverDigest(ctx, POLICY, collect)
    expect(result.considered).toBe(0)
  })
})

describe('renderNotification', () => {
  it('includes the deep link when there is one', () => {
    const rendered = renderNotification(
      {
        titleKey: 'maintenance.notifications.downtime_no_rate.title',
        bodyKey: null,
        params: { month: '2026-02-01' },
        href: '/settings/maintenance',
      },
      'en',
      'https://app.fabricxai.test',
    )

    expect(rendered.text).toContain('https://app.fabricxai.test/settings/maintenance')
    expect(rendered.subject).toContain('2026-02-01')
  })

  it('ESCAPES a parameter that contains markup', () => {
    // Params come from jobs and carry machine serials, part names and pasted notes.
    const rendered = renderNotification(
      {
        titleKey: 'maintenance.notifications.parts_low.title',
        bodyKey: null,
        params: { name: '<script>alert(1)</script>', onHand: 0, minLevel: 5 },
        href: null,
      },
      'en',
      'https://app.fabricxai.test',
    )

    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
  })
})
