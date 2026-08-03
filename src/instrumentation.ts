/**
 * Next.js instrumentation hook — runs once per server process, before any request.
 *
 * Everything here is a refusal to start rather than a check at first request: an invalid
 * environment, a database role that bypasses RLS, or an empty module registry are all
 * conditions under which serving one request is worse than serving none.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { env } = await import('./lib/env')

  // Error tracking first, so anything that fails below is reported rather than only
  // printed. A no-op without SENTRY_DSN, which it warns about.
  const { initObservability } = await import('./lib/observability')
  initObservability('app')

  const { logger } = await import('./lib/logger')
  logger.info({ nodeEnv: env.NODE_ENV, appUrl: env.APP_URL }, 'environment validated')

  // Tenancy wall check: the pooled role must be the RLS-bound app role. A superuser
  // here means every policy in the schema is decoration. Skipped during `next build`
  // (no database there); enforced in every running server process.
  const { assertAppRoleConnection } = await import('./db/assert-app-role')
  await assertAppRoleConnection()
  logger.info('database role verified — RLS applies to this connection')

  // Populate the module registry before the first request. Nothing discovers
  // modules at runtime — importing `register.ts` IS the registration — so
  // without this the pending-change whitelist, the offline sync handlers and
  // MARBIM's department primers are all empty in the running app.
  const { registeredSummary } = await import('./modules/registry')
  const { modules, syncHandlers } = registeredSummary()
  logger.info({ modules, syncHandlers }, 'module registry populated')
}
