import { join } from 'node:path'

import type { Page } from '@playwright/test'

/**
 * Shared sign-in for the e2e suite (plan 7.2).
 *
 * The seeded people, by role. `pnpm seed` gives every one of them the same password so a
 * walkthrough does not mean looking up eight of them — the same reason this can use them.
 */
export const SEED_PASSWORD = 'FabricXai-seed-2026'

/**
 * Only the roles a test actually uses.
 *
 * Every entry costs a sign-in, and `LIMITS.signIn` allows ten per five minutes by IP. A
 * merchandiser sat here for a while, signed in on every run, used by nothing.
 */
export const PEOPLE = {
  owner: 'owner@seed-apparels.test',
  store: 'store@seed-apparels.test',
  production: 'production@seed-apparels.test',
  quality: 'quality@seed-apparels.test',
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
