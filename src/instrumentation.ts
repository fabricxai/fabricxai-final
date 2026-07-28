/**
 * Next.js instrumentation hook — runs once per server process, before any request.
 * Phase 0 job: prove the environment is valid at boot rather than at first request.
 * Sentry init lands here too (dev-plan §8).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { env } = await import('./lib/env')
  console.log(`[fabricxai] env ok · NODE_ENV=${env.NODE_ENV} · app=${env.APP_URL}`)
}
