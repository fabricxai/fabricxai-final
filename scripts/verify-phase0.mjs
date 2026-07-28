#!/usr/bin/env node
/**
 * Phase 0 exit-criteria runner — `pnpm verify:phase0`.
 * Definition of each gate: docs/runbooks/phase-0-exit.md
 *
 * Runs every gate whose proof artifact exists; reports BLOCKED (with the session that
 * unblocks it) for the rest. Deliberately thin: the real assertions live in test files
 * and the CI workflow, not here. A gate this script cannot run is a gate that has no
 * artifact yet — which is exactly the thing worth reporting.
 *
 * Exit 0 only when all four gates are green.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const has = (p) => existsSync(path.join(root, p))

/** Exit code a placeholder uses to say "not built yet" rather than "failed". */
const EX_NOT_IMPLEMENTED = 78

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false })
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

const AUTH_TEST = 'src/modules/core/__tests__/auth-flow.integration.test.ts'
const PENDING_TEST = 'src/modules/core/__tests__/pending-flow.integration.test.ts'

const integration = (file) => () =>
  run('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts', file])

const gates = [
  {
    id: 'A',
    name: 'signup → verify → login',
    unblockedBy: 'session 2 (Better Auth)',
    ready: () => has(AUTH_TEST),
    check: integration(AUTH_TEST),
  },
  {
    id: 'B',
    name: 'pending_change inserts → approves → commits → audits',
    unblockedBy: 'session 3 (modules/core services)',
    ready: () => has(PENDING_TEST),
    check: integration(PENDING_TEST),
  },
  {
    id: 'C',
    name: 'seed --scale=pilot runs (twice — must be re-runnable)',
    unblockedBy: 'session 3/4 (seed generator)',
    // The placeholder seed exits EX_NOT_IMPLEMENTED on purpose; treat that as blocked
    // rather than failed, so the report stays readable.
    ready: () => has('src/db/seed/index.ts'),
    check: () => {
      const first = run('pnpm', ['seed', '--scale=pilot'])
      if (first.status === EX_NOT_IMPLEMENTED) return { blocked: true }
      if (!first.ok) return first
      const second = run('pnpm', ['seed', '--scale=pilot'])
      return second.ok
        ? second
        : { ok: false, output: `second run failed — seed is not re-runnable\n${second.output}` }
    },
  },
  {
    id: 'D',
    name: 'CI green',
    unblockedBy: 'session 4 (workflow + custom lint rules)',
    // Runnable locally in full only once the workflow exists; until then run the jobs
    // that already have commands, so regressions in them surface now rather than later.
    ready: () => true,
    check: () => {
      const jobs = [
        { name: 'lint (incl. no-float-money, analytics-no-writes)', fn: () => run('pnpm', ['lint']) },
        { name: 'typecheck', fn: () => run('pnpm', ['typecheck']) },
        { name: 'unit tests', fn: () => run('pnpm', ['test']) },
        { name: 'migrate-check (chain)', fn: () => run('pnpm', ['exec', 'drizzle-kit', 'check']) },
        {
          // Drift = someone edited schema.ts and forgot to generate the migration.
          // Detected by asking drizzle-kit to generate and checking whether it produced
          // anything new — not via `git ls-files --others`, which cannot tell a genuinely
          // new migration from a repo that simply has nothing committed yet.
          name: 'migrate-check (drift)',
          fn: () => {
            const dir = path.join(root, 'src/db/migrations')
            const before = new Set(readdirSync(dir).filter((f) => f.endsWith('.sql')))
            const generated = run('pnpm', ['exec', 'drizzle-kit', 'generate'])
            if (!generated.ok) return generated

            const added = readdirSync(dir).filter((f) => f.endsWith('.sql') && !before.has(f))
            if (added.length) {
              return {
                ok: false,
                output:
                  'schema.ts changed without a generated migration — drizzle-kit just wrote:\n' +
                  `  ${added.join('\n  ')}\n` +
                  'Commit it (and review the SQL) rather than deleting it.',
              }
            }

            // Also catch edits to an already-applied migration file (forward-fix only,
            // PLAYBOOK §5). Scoped to *.sql deliberately: `meta/_journal.json` changes
            // every time a migration is legitimately added, so including it would flag
            // normal work as tampering and train everyone to ignore this check.
            const diff = run('git', [
              'diff',
              '--exit-code',
              '--stat',
              '--',
              'src/db/migrations/*.sql',
            ])
            return diff.ok
              ? { ok: true, output: '' }
              : { ok: false, output: `an applied migration file was modified:\n${diff.output}` }
          },
        },
      ]

      const failures = []
      for (const job of jobs) {
        const result = job.fn()
        console.log(`      ${result.ok ? '✓' : '✗'} ${job.name}`)
        if (!result.ok) failures.push(`${job.name}:\n${result.output}`)
      }

      const missing = [
        !has('.github/workflows/ci.yml') && 'no .github/workflows/ci.yml',
        !has('eslint.config.mjs') && 'no lint config (no-float-money, analytics-no-writes)',
        !has('Dockerfile') && 'no Dockerfile for the docker-build job',
      ].filter(Boolean)

      if (failures.length) return { ok: false, output: failures.join('\n\n') }
      if (missing.length) {
        return { ok: false, partial: true, output: `local jobs pass; still missing:\n  - ${missing.join('\n  - ')}` }
      }
      return { ok: true, output: '' }
    },
  },
]

console.log('\nPhase 0 exit criteria — docs/runbooks/phase-0-exit.md\n')

let green = 0
for (const gate of gates) {
  if (!gate.ready()) {
    console.log(`  ⬜ ${gate.id} · ${gate.name}`)
    console.log(`      BLOCKED — ${gate.unblockedBy}\n`)
    continue
  }

  console.log(`  ▶  ${gate.id} · ${gate.name}`)
  const result = gate.check()

  if (result.blocked) {
    console.log(`      BLOCKED — ${gate.unblockedBy}\n`)
  } else if (result.ok) {
    green += 1
    console.log(`      PASS\n`)
  } else if (result.partial) {
    console.log(`      PARTIAL — ${gate.unblockedBy}`)
    console.log(`${result.output.replace(/^/gm, '      ')}\n`)
  } else {
    console.log(`      FAIL`)
    console.log(`${result.output.replace(/^/gm, '      ')}\n`)
  }
}

console.log(`  ${green}/${gates.length} gates green\n`)
process.exit(green === gates.length ? 0 : 1)
