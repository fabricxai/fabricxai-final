import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end and accessibility (plan 7.2, audit TEST-H8).
 *
 * One golden path and an axe sweep, and the restraint is deliberate: a broad Playwright suite
 * over a product still gaining screens is a maintenance bill paid in flaky reruns. What is
 * here is the journey that, if it breaks, means the product does not work at all — sign in,
 * record a receipt on the floor, see it waiting in the approve inbox — plus the floor screens
 * a person uses in gloves under bad light, checked against WCAG.
 *
 * ## Against a production build, like the k6 harness
 *
 * `next dev` compiles per request; 7.1 measured the same dashboard at 2,887ms in dev and
 * 296ms built. That difference is enough to turn a real timeout into a passing test or a
 * passing test into a flake, so `webServer` builds first.
 *
 * `MARBIM_MOCK=false` because `env.ts` refuses the mock in production — which is 6.4's boot
 * assertion doing its job, and the reason the k6 harness starts the server the same way.
 */
export default defineConfig({
  testDir: './e2e',
  // Serial. The suite signs in as seeded users and writes to a shared dev database; parallel
  // workers would be two storekeepers racing on one factory's stock.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'e2e-results.xml' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3000',
    // Kept only for a failure. A trace per passing test is gigabytes nobody opens.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Signs in once per role and saves the session. Everything else depends on it — see
      // `auth.setup.ts` for why that is a correctness requirement rather than a speed-up.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      /*
       * The floor runs on tablets, and 4.4 fixed the layout for exactly that viewport while
       * recording in STUBS that nobody had opened it in a browser. This is that check.
       *
       * Chromium at an iPad's viewport rather than `devices['iPad (gen 7)']`, which defaults
       * to WebKit: what 4.4 changed is a CSS breakpoint at 900px, so the viewport is the
       * variable and the engine is not. Using the device profile would also mean downloading
       * and maintaining a second browser to test a media query.
       */
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      dependencies: ['setup'],
      testMatch: /floor-a11y\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'MARBIM_MOCK=false pnpm build && MARBIM_MOCK=false pnpm start',
    /*
     * `/login` and NOT `/api/health`.
     *
     * Health answers **503** until the scheduler has ticked, which is correct — it is a
     * readiness signal, not a liveness one — but Playwright waits for a 2xx and therefore
     * never sees the server as up. Pointed there it ignored a perfectly running instance,
     * tried to start a second, and failed on EADDRINUSE.
     *
     * `/login` is also the better probe: it is the first page of the golden path, so a server
     * that answers it is one the suite can actually begin against.
     */
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
