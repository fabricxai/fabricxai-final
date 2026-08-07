import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { SEED_PASSWORD, seedEmail } from '@/db/seed/identity'

/**
 * Shared sign-in for the e2e suite (plan 7.2).
 *
 * The seeded people, by role. `pnpm seed` gives every one of them the same password so a
 * walkthrough does not mean looking up eight of them — the same reason this can use them.
 */
export { SEED_PASSWORD }

/**
 * Only the roles a test actually uses.
 *
 * Every entry costs a sign-in, and `LIMITS.signIn` allows ten per five minutes by IP. A
 * merchandiser sat here for a while, signed in on every run, used by nothing.
 *
 * Addresses are DERIVED, not written out. They were literals here until the seed started
 * scoping them per tenant, at which point this file went on asking for
 * `owner@seed-apparels.test` — an address that no longer existed — and every sign-in failed
 * with "That email and password did not match". It passed locally on databases seeded
 * before the change and failed on every fresh one, so `seedEmail` is now the only thing
 * that decides what these are.
 */
export const PEOPLE = {
  owner: seedEmail('owner'),
  store: seedEmail('store'),
  production: seedEmail('production'),
  quality: seedEmail('quality'),
} as const

/**
 * Sign in through the form a person actually uses.
 *
 * Not by posting to the API and injecting the cookie: the login screen is part of the golden
 * path, and a suite that skips it would keep passing after the form stopped working. The k6
 * harness makes the opposite trade for the opposite reason — it is provisioning, not testing.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(SEED_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // The shell, not merely a URL change — a redirect that lands on a broken page is still a
  // failed sign-in.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

/**
 * Where a role's saved session lives.
 *
 * Gitignored: real session cookies for accounts with a published password, on a database that
 * is by definition not production — but tokens all the same.
 */
export const statePath = (role: string): string => join('e2e', '.auth', `${role}.json`)
