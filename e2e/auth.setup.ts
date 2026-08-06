import { existsSync } from 'node:fs'

import { expect, test as setup } from '@playwright/test'

import { PEOPLE, signIn, statePath } from './support'

/**
 * Sign in once per role, and reuse the session while it still works (plan 7.2).
 *
 * Not an optimisation — a correctness fix, and the same one the k6 harness needed for the
 * same reason. `LIMITS.signIn` allows ten per five minutes **by IP**, so a suite that signs in
 * inside every test spends its whole allowance on the first pass and then reports a healthy
 * product as a wall of 30-second navigation timeouts. Fourteen tests, ten sign-ins.
 *
 * Reusing a session is also what a real person does: they sign in on Sunday and the tablet
 * stays signed in all week.
 *
 * The login FORM is still exercised — here, whenever a session is missing or expired, which
 * is the coverage the golden path needs from it. What is not exercised fourteen times, or
 * four times on every local re-run while chasing a failure, is the rate limiter.
 */
for (const [role, email] of Object.entries(PEOPLE)) {
  setup(`sign in as ${role}`, async ({ page, browser }) => {
    const path = statePath(role)

    if (existsSync(path)) {
      // Probe the saved session against a page that requires one. A stale cookie here would
      // otherwise surface much later as an inexplicable redirect in an unrelated test.
      const context = await browser.newContext({ storageState: path })
      const probe = await context.newPage()
      await probe.goto('/approve').catch(() => undefined)
      const stillIn = !new URL(probe.url()).pathname.startsWith('/login')
      await context.close()

      if (stillIn) return
    }

    await signIn(page, email)
    await page.context().storageState({ path })

    expect(existsSync(path)).toBe(true)
  })
}
