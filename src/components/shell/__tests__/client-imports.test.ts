/**
 * No client component imports a module's service (plan 5.4).
 *
 * A `'use client'` file that imports `modules/<m>/service` pulls in `db/client`, and with it
 * `postgres` — which the browser cannot bundle. The build says so, eventually, in a message
 * about a missing `fs` several files away from the cause. This says so here, by name.
 *
 * It is not a hypothetical: the planning board's buttons need the allocation state machine,
 * the machine lived in `service.ts`, and importing it broke the production build while
 * typecheck, lint and every test stayed green. The fix was to move the machine to
 * `capacity.ts`, which is pure — and the general shape of the fix is always that. A client
 * needs a RULE, not a service: the transition table, the arithmetic, the shape. Those belong
 * in the module's pure file, which both sides can read.
 *
 * ## What a client may import from a module
 *
 * `actions` — that is the point of a server action. `zod` and the pure logic files. Types
 * from anywhere, because a type import is erased. What it may not import is the thing that
 * opens a database connection.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOTS = ['src/app', 'src/components']

/** `import … from '@/modules/x/service'`, in any of its spellings. */
const SERVICE_IMPORT = /from\s+['"](?:@\/modules|\.\.?\/[^'"]*modules)\/[a-z]+\/(service|queries)['"]/g

/** A type-only import is erased before it reaches a bundler, so it costs nothing. */
const TYPE_ONLY = /import\s+type\s/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}

describe('the browser bundle stays out of the database', () => {
  it('has no client component importing a module service or queries file', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const path of sourceFiles(root)) {
        const source = readFileSync(path, 'utf8')
        // Only the directive at the very top makes a file a client component.
        if (!/^\s*['"]use client['"]/.test(source)) continue

        for (const match of source.matchAll(SERVICE_IMPORT)) {
          // Walk back to the start of the statement to see whether it is `import type`.
          const from = source.lastIndexOf('import', match.index)
          if (from >= 0 && TYPE_ONLY.test(source.slice(from, match.index))) continue

          offenders.push(`${path} → ${match[0].replace(/^from\s+/, '')}`)
        }
      }
    }

    expect(
      offenders,
      `these drag the database client into the browser bundle. Move what the client needs — a state machine, an arithmetic helper, a shape — into the module's pure file, and import that:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
