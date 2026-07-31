/**
 * Scheduled work for 10.2 (brief §Jobs: certificate alerts 90/60/30, CAP deadline
 * escalations, critical-open → owner exceptions feed).
 *
 * Both jobs live or die on their dedupe keys, and for a sharper reason than usual. A
 * compliance alert that repeats nightly is not merely annoying — it is the mechanism by
 * which a factory learns to ignore compliance alerts, and the one that finally matters
 * arrives looking exactly like the ninety that did not.
 *
 * So:
 *
 *  - a certificate alerts once per RUNG crossed. Ninety days out is one notification;
 *    sixty is a new one; thirty is a new one. In between, nothing.
 *  - an expired certificate alerts once on the day it lapses, and then it is on the
 *    exceptions feed rather than in the bell every morning.
 *  - a corrective action alerts once per ESCALATION LEVEL. Reaching a manager is one
 *    notification; reaching the owner is another. Staying overdue is not.
 */
import type { SystemCtx } from '../core/ctx'
import { notify } from '../core/notifications'

import { capExceptions, certificateLadder, type CompliancePolicy } from './service'

export interface CertificateAlertResult {
  scanned: number
  expired: number
  expiring: number
  alerted: number
}

/**
 * Walk the expiry ladder and tell compliance what is coming.
 *
 * Expired certificates are notified at CRITICAL and separately from the rungs, because they
 * are a different kind of problem: a fire licence expiring in thirty days is a task, and one
 * that lapsed last month is a factory operating without it.
 */
export async function runCertificateAlerts(
  ctx: SystemCtx,
  input: { today: string },
  policy: CompliancePolicy,
): Promise<CertificateAlertResult> {
  const ladder = await certificateLadder(ctx, input.today, policy)

  let expired = 0
  let expiring = 0
  let alerted = 0

  for (const certificate of ladder) {
    if (certificate.state === 'perpetual' || certificate.state === 'valid') continue

    const isExpired = certificate.state === 'expired'
    if (isExpired) expired += 1
    else expiring += 1

    const created = await notify(ctx, {
      role: 'compliance',
      kind: isExpired ? 'compliance.certificate.expired' : 'compliance.certificate.expiring',
      severity: isExpired ? 'critical' : certificate.state === 'warning' ? 'critical' : 'warning',
      titleKey: isExpired
        ? 'compliance.notifications.certificate_expired.title'
        : 'compliance.notifications.certificate_expiring.title',
      params: {
        kind: certificate.kind,
        expiresOn: certificate.expiresOn,
        daysRemaining: certificate.daysRemaining,
        rung: certificate.rung,
      },
      moduleId: 'compliance',
      entityTable: 'certificates',
      entityId: certificate.certificateId,
      // The RUNG is in the key, so crossing 90 → 60 → 30 is three alerts and sitting
      // between them is none. An expired certificate has no rung and keys on the date it
      // lapsed, which does not move — one alert, then the exceptions feed carries it.
      dedupeKey: isExpired
        ? `certificate.expired:${certificate.certificateId}:${certificate.expiresOn}`
        : `certificate.expiring:${certificate.certificateId}:${certificate.rung}`,
    })

    if (created) alerted += 1
  }

  return { scanned: ladder.length, expired, expiring, alerted }
}

export interface CapEscalationResult {
  escalations: number
  toOwner: number
  alerted: number
}

/**
 * Escalate corrective actions that need somebody senior.
 *
 * `capExceptions` already decides who hears about what — including that an OPEN critical
 * finding reaches the owner before its deadline, because the deadline is when a locked fire
 * exit must be FIXED by, not when the owner may first be told about it. This job's only
 * judgement is not to say it twice.
 */
export async function runCapEscalations(
  ctx: SystemCtx,
  input: { today: string },
): Promise<CapEscalationResult> {
  const exceptions = await capExceptions(ctx, input.today)

  let toOwner = 0
  let alerted = 0

  for (const exception of exceptions) {
    if (exception.escalateTo === 'owner') toOwner += 1

    const created = await notify(ctx, {
      role: exception.escalateTo === 'owner' ? 'owner' : 'admin',
      kind: 'compliance.cap.escalated',
      severity: exception.severity === 'critical' ? 'critical' : 'warning',
      titleKey: 'compliance.notifications.cap_escalated.title',
      params: {
        severity: exception.severity,
        deadline: exception.deadline,
        status: exception.status,
        escalateTo: exception.escalateTo,
      },
      moduleId: 'compliance',
      entityTable: 'caps',
      entityId: exception.capId,
      // Once per level. A CAP that goes none → manager → owner produces two notifications
      // over its life, not one every morning until somebody closes it.
      dedupeKey: `cap.escalation:${exception.capId}:${exception.escalateTo}`,
    })

    if (created) alerted += 1
  }

  return { escalations: exceptions.length, toOwner, alerted }
}
