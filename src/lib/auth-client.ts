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

/**
 * Password recovery, reached through the client object rather than destructured.
 *
 * Better Auth builds these lazily on a Proxy, so they exist at runtime but are not on the
 * destructurable inferred type — destructuring them fails to typecheck while
 * `authClient.requestPasswordReset(...)` does not. `requestPasswordReset` is the current
 * name; `forgetPassword` is its older alias and still routes.
 */
export const requestPasswordReset = authClient.requestPasswordReset
export const resetPassword = authClient.resetPassword
