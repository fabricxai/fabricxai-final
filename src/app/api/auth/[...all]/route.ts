import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/auth'

/**
 * Better Auth mounts its whole surface here: sign-up, sign-in, email verification,
 * session, and the organization plugin's endpoints.
 *
 * This is the one route handler in the codebase that is not "parse → auth → zod →
 * service" — the library owns the boundary. Everything else obeys the layer rule.
 */
export const { GET, POST } = toNextJsHandler(auth)
