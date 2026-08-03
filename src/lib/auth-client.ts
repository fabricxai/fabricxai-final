import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser-side auth. The server is still the only place a session becomes
 * tenancy: this client signs in and out, and `modules/core/session` turns the
 * resulting cookie into `ctx` on every request. Nothing here ever names a
 * company or a role.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
