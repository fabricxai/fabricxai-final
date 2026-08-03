/**
 * Boot-time guard for the tenancy walls.
 *
 * Every RLS policy in the schema targets `fabricxai_app`, and a superuser — or the
 * table owner, or anything with BYPASSRLS — walks straight through them. Nothing else
 * at runtime checks which role the pool actually connected as: `setup-db-roles.mjs`
 * asserts it at provisioning time, but a deployment that later points DATABASE_URL at
 * the owner credential (the same string sitting right there in DIRECT_DATABASE_URL)
 * would run with tenancy silently off. That exact misconfiguration shipped in this
 * repo's own compose file, so this is not a theoretical guard.
 *
 * Called from `instrumentation.ts` (app) and `worker/index.ts` — refuses to boot
 * rather than serve one request cross-tenant.
 */
import { sql } from 'drizzle-orm'

import { db } from './client'
import { env } from '@/lib/env'

export async function assertAppRoleConnection(): Promise<void> {
  const pooledUser = new URL(env.DATABASE_URL).username
  const directUser = new URL(env.DIRECT_DATABASE_URL).username
  if (pooledUser && pooledUser === directUser) {
    throw new Error(
      `DATABASE_URL and DIRECT_DATABASE_URL both connect as "${pooledUser}" — ` +
        'the pooled runtime role must be the RLS-bound app role, never the migration owner',
    )
  }

  const result = await db.execute<{
    role: string
    rolsuper: boolean
    rolbypassrls: boolean
  }>(sql`
    select current_user as role, rolsuper, rolbypassrls
    from pg_roles where rolname = current_user
  `)
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const role = rows[0] as { role: string; rolsuper: boolean; rolbypassrls: boolean } | undefined

  if (!role) throw new Error('could not read pg_roles for the connected role')
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `refusing to start: runtime database role "${role.role}" has ` +
        `${role.rolsuper ? 'SUPERUSER' : 'BYPASSRLS'} — RLS would not apply and every ` +
        'tenant could read every other tenant. Point DATABASE_URL at the app role.',
    )
  }
}
