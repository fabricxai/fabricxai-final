/**
 * Better Auth's rate limiter, actually running (audit INFRA-H7 / plan 1.6).
 *
 * The limiter is off outside production, and for a good reason that is written down in
 * `lib/auth.ts`: signup is capped at three per hour per IP, and the integration suite
 * signs up nine owners from one address. Turning it on for the whole suite would fail
 * unrelated tests with a 429 that has nothing to do with the code under test — so
 * "just set the flag in CI" is not available.
 *
 * The gap that leaves is real though: the numbers in `LIMITS` had never been observed
 * refusing anything. A limiter nobody has watched work is a configuration file.
 *
 * So this file runs ALONE, in its own CI job, against a server started with
 * `RATE_LIMIT_ENFORCE=1`. It skips itself otherwise, which keeps `pnpm test:integration`
 * meaning the same thing it did before.
 *
 * Sign-in is the probe rather than sign-up: a refused password has no side effects, while
 * ten signups would provision ten companies to prove a counter works.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeRedis, getRedis } from '@/lib/redis'

const BASE_URL = process.env.APP_URL ?? `http://localhost:${process.env.INTEGRATION_PORT ?? 3100}`
const ENFORCING = process.env.RATE_LIMIT_ENFORCE === '1'

/**
 * Start from an empty bucket.
 *
 * The counter is keyed by IP, not by the email being tried — which is correct (it is a
 * guessing loop from one address that matters, not one account) and makes the test
 * stateful: every run from this machine shares one five-minute window, so a second run
 * inside it begins already refused. Found by running it twice.
 */
beforeAll(async () => {
  const redis = getRedis()
  const keys = await redis.keys('ba:*')
  if (keys.length > 0) await redis.del(...keys)
})

afterAll(async () => {
  // Leave nothing behind for whatever runs next in this job.
  const redis = getRedis()
  const keys = await redis.keys('ba:*')
  if (keys.length > 0) await redis.del(...keys)
  await closeRedis()
})

/** From LIMITS.signIn — ten attempts per five minutes. */
const SIGN_IN_LIMIT = 10

async function attemptSignIn(email: string): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'definitely-not-the-password' }),
  })
  return response.status
}

describe.skipIf(!ENFORCING)('the auth limiter refuses a guessing loop', () => {
  it('lets a mistyped password through, then stops the eleventh attempt', async () => {
    const email = `limiter-${Math.random().toString(36).slice(2, 10)}@fabricxai.test`
    const statuses: number[] = []

    // One more than the limit. Sequential on purpose: a burst of eleven in flight at once
    // could all read the counter before any of them increments it, and this asserts the
    // limit, not the race.
    for (let attempt = 0; attempt <= SIGN_IN_LIMIT; attempt += 1) {
      statuses.push(await attemptSignIn(email))
    }

    const refusedEarly = statuses.slice(0, SIGN_IN_LIMIT).filter((s) => s === 429)
    const last = statuses[statuses.length - 1]

    // A limiter that refuses too early is as broken as one that never refuses: a
    // storekeeper who mistypes twice must still be able to sign in.
    expect(refusedEarly, `refused before the limit: ${statuses.join(',')}`).toEqual([])
    expect(last, `attempt ${SIGN_IN_LIMIT + 1} of ${SIGN_IN_LIMIT} should be refused`).toBe(429)
  })

  it('is enforcing because the flag says so, not by accident', () => {
    // Guards the guard. If this file ever runs without the flag, `describe.skipIf` skips
    // it and the job passes having asserted nothing — so the job also greps for the skip.
    expect(ENFORCING).toBe(true)
  })
})

describe.skipIf(ENFORCING)('the limiter is off by default, which the rest of the suite needs', () => {
  it('does not refuse repeated sign-in attempts', async () => {
    // The property the other 630 tests depend on: nine signups and their logins from one
    // address must not start returning 429 halfway through a run.
    const email = `unlimited-${Math.random().toString(36).slice(2, 10)}@fabricxai.test`
    const statuses: number[] = []

    for (let attempt = 0; attempt <= SIGN_IN_LIMIT; attempt += 1) {
      statuses.push(await attemptSignIn(email))
    }

    expect(statuses.filter((s) => s === 429)).toEqual([])
  })
})
