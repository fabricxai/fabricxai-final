import Image from 'next/image'

/**
 * Phase 0 landing page. It exists to prove the shell is wired — theme tokens, fonts,
 * brand assets — and to point the next session at what is already standing.
 * The real app starts at the Approve Inbox (X.1) in Phase 2.
 */

const foundations = [
  { label: 'Next.js 16 · app router · TS strict', done: true },
  { label: 'Modular-monolith tree (architecture §2.1)', done: true },
  { label: 'Postgres 16 · pgvector · pg_trgm · btree_gin', done: true },
  { label: 'PgBouncer transaction pooling', done: true },
  { label: 'Redis · MinIO · Mailpit', done: true },
  { label: 'Zod env validation at boot', done: true },
  { label: 'Drizzle + core schema + RLS policies', done: true },
  { label: 'Better Auth (email verify, org → companies/roles)', done: false },
  { label: 'modules/core services (tenancy, pending, outbox, audit)', done: false },
  { label: 'CI: lint · typecheck · vitest · migrate-check', done: false },
]

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '3rem 1.5rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '46rem' }}>
        <Image
          src="/brand/fabricxai-logo-dark.png"
          alt="FabricXAI"
          width={220}
          height={52}
          priority
          style={{ height: 'auto', width: '220px' }}
        />

        <div className="thread-rule" style={{ margin: '1.5rem 0 2rem' }} />

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: '.5rem',
          }}
        >
          Phase 0 — foundation
        </h1>
        <p style={{ color: 'var(--text-mute)', marginBottom: '2rem' }}>
          Scaffold is up. No business modules yet — those arrive one HANDOFF at a time.
        </p>

        <ul style={{ display: 'grid', gap: '.5rem', listStyle: 'none', padding: 0 }}>
          {foundations.map((item) => (
            <li
              key={item.label}
              className="selvage"
              data-status={item.done ? 'done' : 'at-risk'}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-md)',
                padding: '.75rem 1rem .75rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                alignItems: 'center',
                color: item.done ? 'var(--text-dim)' : 'var(--text)',
              }}
            >
              <span>{item.label}</span>
              <span
                data-numeric
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.75rem',
                  color: item.done ? 'var(--color-done)' : 'var(--color-at-risk)',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.done ? 'done' : 'next session'}
              </span>
            </li>
          ))}
        </ul>

        <p style={{ color: 'var(--text-mute)', fontSize: '.8125rem', marginTop: '2rem' }}>
          Health check:{' '}
          <a href="/api/health" style={{ color: 'var(--brand)' }}>
            /api/health
          </a>{' '}
          · Mail:{' '}
          <a href="http://localhost:8025" style={{ color: 'var(--brand)' }}>
            Mailpit
          </a>{' '}
          · Storage:{' '}
          <a href="http://localhost:9001" style={{ color: 'var(--brand)' }}>
            MinIO
          </a>
        </p>
      </div>
    </main>
  )
}
