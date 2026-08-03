/**
 * Next.js instrumentation hook — runs once per server process, before any request.
 * Phase 0 job: prove the environment is valid at boot rather than at first request.
 * Sentry init lands here too (dev-plan §8).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { env } = await import('./lib/env')
  console.log(`[fabricxai] env ok · NODE_ENV=${env.NODE_ENV} · app=${env.APP_URL}`)

  // Populate the module registry before the first request. Nothing discovers
  // modules at runtime — importing `register.ts` IS the registration — so
  // without this the pending-change whitelist, the offline sync handlers and
  // MARBIM's department primers are all empty in the running app.
  const { registeredSummary } = await import('./modules/registry')
  const { modules, syncHandlers } = registeredSummary()
  console.log(`[fabricxai] registered ${modules} modules · ${syncHandlers} sync handlers`)
}
