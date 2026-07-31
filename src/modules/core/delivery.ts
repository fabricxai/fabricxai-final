/**
 * Notification delivery — turning a `notifications` row into an email somebody reads.
 *
 * Every scheduled job in this system writes a notification and stops. Until now that was
 * where it ended: the row sat in the bell, and anybody not looking at the app was not told.
 * A certificate that lapsed on a Friday reached nobody until somebody happened to open the
 * dashboard.
 *
 * ## Two channels, because one would be wrong
 *
 * **Critical goes immediately, one email per notification.** A lapsed fire licence or a
 * corrective action reaching the owner is worth an interruption.
 *
 * **Everything else goes in a daily digest, one email per person.** This is the same
 * discipline the dedupe keys enforce inside the jobs: forty separate emails is exactly the
 * failure that forty separate bell entries would have been, and a factory that mutes the
 * digest has muted the criticals too, because they came from the same sender.
 *
 * ## What it does when something is missing
 *
 * A key with no string renders as the key — `missingKeys` counts them and the result
 * reports them, so a message that went out wrong is not also a message nobody knew about.
 * A recipient with no email address is counted and skipped rather than throwing: one
 * unreachable user must not stop the other four being told.
 *
 * ## Ordering
 *
 * Emails are sent BEFORE `emailed_at` is written. A crash in between re-sends on the next
 * run, so somebody may receive a duplicate; marking first would instead lose the message
 * entirely. For an alert that is the right way round — the same reasoning the outbox
 * consumers use, and for the same reason.
 */
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'

import { DEFAULT_LOCALE, missingKeys, resolveLocale, t, type Locale } from '@/lib/i18n'
import { notifications, profiles, roles, users } from '@/db/schema/core'

import type { AnyCtx } from './ctx'
import { withTenantRead, withTenantTx } from './tenancy'

/** What a notification becomes on its way out. Injected so tests need no SMTP. */
export interface OutboundMail {
  to: string
  subject: string
  text: string
  html: string
}

export type SendMail = (mail: OutboundMail) => Promise<void>

export interface DeliveryPolicy {
  /** Severities that earn an immediate email. Everything else waits for the digest. */
  emailSeverities: readonly ('info' | 'warning' | 'critical')[]
  /** Notifications in one digest before it is truncated with a count. */
  digestLimit: number
  /** Where a deep link points. */
  appUrl: string
}

export interface DeliveryResult {
  considered: number
  sent: number
  /** Notifications whose recipients had no email address at all. */
  unreachable: number
  /** i18n keys with no string behind them — these went out as dotted keys. */
  missingKeys: string[]
}

type NotificationRow = typeof notifications.$inferSelect

interface Recipient {
  userId: string
  email: string
  locale: Locale
}

/**
 * Who a notification is addressed to.
 *
 * A row names a user OR a role. A role-addressed one reaches everybody holding that role in
 * the company — "somebody in commercial needs to look at this LC" is not a question of who
 * is on shift, and picking one person would mean picking wrong on the day they are away.
 */
async function recipientsFor(ctx: AnyCtx, row: NotificationRow): Promise<Recipient[]> {
  return withTenantRead(ctx, async (tx) => {
    // `locale` lives on the profile, and a user may not have one — a fresh account, or a
    // seeded one. `resolveLocale` turns the resulting null into the default rather than
    // dropping the recipient.
    if (row.userId) {
      const [user] = await tx
        .select({ id: users.id, email: users.email, locale: profiles.locale })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(users.id, row.userId))

      if (!user?.email) return []
      return [{ userId: user.id, email: user.email, locale: resolveLocale(user.locale) }]
    }

    if (!row.role) return []

    const holders = await tx
      .select({ id: users.id, email: users.email, locale: profiles.locale })
      .from(roles)
      .innerJoin(users, eq(users.id, roles.userId))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(roles.role, row.role))

    return holders
      .filter((holder) => Boolean(holder.email))
      .map((holder) => ({
        userId: holder.id,
        email: holder.email,
        locale: resolveLocale(holder.locale),
      }))
  })
}

/** One notification as a subject and a body, in the reader's language. */
export function renderNotification(
  row: Pick<NotificationRow, 'titleKey' | 'bodyKey' | 'params' | 'href'>,
  locale: Locale,
  appUrl: string,
): { subject: string; text: string; html: string } {
  const subject = t(locale, row.titleKey, row.params)
  const body = row.bodyKey ? t(locale, row.bodyKey, row.params) : ''
  const link = row.href ? `${appUrl}${row.href}` : null

  const text = [subject, body, link].filter(Boolean).join('\n\n')
  const html = [
    `<p><strong>${escapeHtml(subject)}</strong></p>`,
    body ? `<p>${escapeHtml(body)}</p>` : '',
    link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, text, html }
}

/** Params come from jobs and can contain a machine serial or a pasted note. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Send the critical ones now, one email each.
 *
 * Selects by SEVERITY rather than by the row's `channels` array. Severity is the property a
 * company can reason about and configure in one place; `channels` records what each
 * notification asked for and defaults to in-app everywhere, so keying off it would have
 * meant editing every emitting job to opt in and no single place to change the rule.
 */
export async function deliverCritical(
  ctx: AnyCtx,
  policy: DeliveryPolicy,
  send: SendMail,
  now = new Date(),
): Promise<DeliveryResult> {
  const pending = await withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(notifications)
      .where(
        and(
          isNull(notifications.emailedAt),
          inArray(notifications.severity, [...policy.emailSeverities]),
        ),
      )
      .orderBy(notifications.createdAt),
  )

  const result: DeliveryResult = {
    considered: pending.length,
    sent: 0,
    unreachable: 0,
    missingKeys: [],
  }

  const missing = new Set<string>()

  for (const row of pending) {
    for (const key of missingKeys([row.titleKey, ...(row.bodyKey ? [row.bodyKey] : [])])) {
      missing.add(key)
    }

    const recipients = await recipientsFor(ctx, row)

    if (recipients.length === 0) {
      // Marked anyway. A notification addressed to a role nobody holds will never become
      // deliverable by being retried every five minutes, and leaving it unmarked would make
      // it a permanent item in every future run's backlog.
      result.unreachable += 1
      await markEmailed(ctx, [row.id], now)
      continue
    }

    for (const recipient of recipients) {
      const mail = renderNotification(row, recipient.locale, policy.appUrl)
      await send({ to: recipient.email, ...mail })
      result.sent += 1
    }

    await markEmailed(ctx, [row.id], now)
  }

  result.missingKeys = [...missing].sort()
  return result
}

/**
 * One email per person, covering everything they have not been told about.
 *
 * Grouped by recipient rather than by notification, which is the whole point: a merchandiser
 * with nine at-risk milestones gets one email listing nine lines, not nine emails. The
 * digest is capped — a factory that generated four hundred notifications overnight has a
 * problem the digest cannot solve, and a four-hundred-line email would bury the ten that
 * matter — and the truncation is stated rather than silent.
 */
export async function deliverDigest(
  ctx: AnyCtx,
  policy: DeliveryPolicy,
  send: SendMail,
  now = new Date(),
): Promise<DeliveryResult> {
  const pending = await withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(notifications)
      .where(
        and(
          isNull(notifications.emailedAt),
          // Bound, not interpolated. These values come from Settings and are zod-validated,
          // but building a predicate by string concatenation is the shape of the bug rather
          // than the bug itself, and this file has no reason to be the exception.
          policy.emailSeverities.length > 0
            ? notInArray(notifications.severity, [...policy.emailSeverities])
            : undefined,
        ),
      )
      .orderBy(notifications.createdAt),
  )

  const result: DeliveryResult = {
    considered: pending.length,
    sent: 0,
    unreachable: 0,
    missingKeys: [],
  }
  if (pending.length === 0) return result

  const missing = new Set<string>()
  // recipient → what they are owed
  const byRecipient = new Map<string, { recipient: Recipient; rows: NotificationRow[] }>()
  const unreachableIds: string[] = []

  for (const row of pending) {
    for (const key of missingKeys([row.titleKey, ...(row.bodyKey ? [row.bodyKey] : [])])) {
      missing.add(key)
    }

    const recipients = await recipientsFor(ctx, row)
    if (recipients.length === 0) {
      result.unreachable += 1
      unreachableIds.push(row.id)
      continue
    }

    for (const recipient of recipients) {
      const entry = byRecipient.get(recipient.userId) ?? { recipient, rows: [] }
      entry.rows.push(row)
      byRecipient.set(recipient.userId, entry)
    }
  }

  const delivered: string[] = []

  for (const { recipient, rows } of byRecipient.values()) {
    const shown = rows.slice(0, policy.digestLimit)
    const hidden = rows.length - shown.length

    const lines = shown.map(
      (row) => `• ${t(recipient.locale, row.titleKey, row.params)}`,
    )
    if (hidden > 0) lines.push(`… and ${hidden} more`)

    const subject = `FabricXAI: ${rows.length} update(s)`

    await send({
      to: recipient.email,
      subject,
      text: lines.join('\n'),
      html: `<ul>${shown
        .map((row) => `<li>${escapeHtml(t(recipient.locale, row.titleKey, row.params))}</li>`)
        .join('')}</ul>${hidden > 0 ? `<p>… and ${hidden} more</p>` : ''}`,
    })

    result.sent += 1
    delivered.push(...rows.map((row) => row.id))
  }

  // Everything that reached somebody, plus the ones that can never reach anybody.
  await markEmailed(ctx, [...new Set([...delivered, ...unreachableIds])], now)

  result.missingKeys = [...missing].sort()
  return result
}

async function markEmailed(ctx: AnyCtx, ids: readonly string[], now: Date): Promise<void> {
  if (ids.length === 0) return

  await withTenantTx(ctx, async (tx) => {
    await tx
      .update(notifications)
      .set({ emailedAt: now })
      .where(inArray(notifications.id, [...ids]))
  })
}

export { DEFAULT_LOCALE }
