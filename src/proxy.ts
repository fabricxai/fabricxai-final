import { NextResponse, type NextRequest } from 'next/server'

/**
 * Tells the server components which path they are rendering.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`; the file is `src/proxy.ts`
 * and the export is `proxy` for that reason, not because it proxies anything.
 *
 * A layout cannot ask Next for the current pathname — it is not passed one, and reading it
 * from a client hook would put the answer on the wrong side of the boundary. So the proxy
 * stamps it on the request and `src/app/(app)/layout.tsx` reads it back out of `headers()`.
 *
 * This exists to make the role check possible in ONE place. The alternative was a `canSee`
 * call at the top of every page, which is twenty-three copies of the same four lines: the
 * first one somebody forgets is a screen a role can open by typing its address, and nothing
 * fails when they forget it. Doing it in the shell also covers nested routes — `/lcs/{id}`
 * resolves to the LC register's entry — which per-page checks would each have had to repeat.
 *
 * Deliberately NOT the place the check itself happens. It would have to read the
 * session and the caller's roles from the database on every request, including every static
 * asset; the shell already has both.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)

  return NextResponse.next({ request: { headers } })
}

export const config = {
  /*
   * Everything except Next's own assets and the API. `/api` is excluded because it does its
   * own authorisation per route and has no shell to render a refusal into — a redirect there
   * would answer a fetch with an HTML login page, which is the confusing failure.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand).*)'],
}
