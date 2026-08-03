'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/fx/primitives'

type Outcome = 'approved' | 'rejected' | 'undecided'

/**
 * The search box.
 *
 * **The query lives in the URL, not in component state.** A merchandiser who finds the
 * rejection that explains a problem needs to send it to somebody, and a result you cannot
 * link to is a result you have to describe over the phone. It also survives the back button,
 * which is how people actually move between a hit and the sample behind it.
 *
 * **Submitted, not typed-ahead.** Every keystroke re-running a scan over every comment in the
 * factory would be slower than the person types, and a list that reshuffles under a cursor is
 * hard to read. Enter searches.
 */
export function LibrarySearch({
  query,
  type,
  outcome,
  types,
}: {
  query: string
  type: string | undefined
  outcome: Outcome | undefined
  types: readonly string[]
}) {
  const router = useRouter()
  const [text, setText] = useState(query)

  function go(next: { q?: string; type?: string; outcome?: string }) {
    const params = new URLSearchParams()
    const q = next.q ?? text
    const t = next.type ?? type
    const o = next.outcome ?? outcome

    if (q?.trim()) params.set('q', q.trim())
    // An explicit empty string clears the filter; undefined leaves it as it was.
    if (t && next.type !== '') params.set('type', t)
    if (o && next.outcome !== '') params.set('outcome', o)

    const qs = params.toString()
    router.push(qs ? `/sampling/library?${qs}` : '/sampling/library')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 320px' }}>
          <span style={labelStyle}>Style, request, buyer, or what the buyer said</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go({})
            }}
            placeholder="puckering · collar stand · SHRT-4410"
            style={control}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={labelStyle}>Type</span>
          <select
            value={type ?? ''}
            onChange={(e) => go({ type: e.target.value })}
            style={{ ...control, width: 140 }}
          >
            <option value="">Any</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={labelStyle}>Outcome</span>
          <select
            value={outcome ?? ''}
            onChange={(e) => go({ outcome: e.target.value })}
            style={{ ...control, width: 170 }}
          >
            <option value="">Any</option>
            <option value="rejected">Rejected</option>
            {/* Includes approved-with-comments: the buyer accepted it either way, and
                hiding those would send somebody to remake a sample that passed. */}
            <option value="approved">Approved</option>
            <option value="undecided">No verdict yet</option>
          </select>
        </label>

        <Button variant="primary" onClick={() => go({})}>
          Search
        </Button>

        {query || type || outcome ? (
          <button
            onClick={() => {
              setText('')
              router.push('/sampling/library')
            }}
            style={linkButton}
          >
            Clear
          </button>
        ) : null}
      </div>

      <span style={{ font: "400 12px/1.6 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        Matching is literal — it finds samples containing these words, not ones that resemble
        them. Style similarity lives in Order memory, which knows that a tee and a t-shirt are
        the same garment; this does not, and would disagree with it if it pretended to.
      </span>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  font: "500 11px/1.3 var(--fx-font-mono)",
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--fx-text-tertiary)',
}

const control: React.CSSProperties = {
  minWidth: 0,
  padding: '9px 12px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 14px/1.4 var(--fx-font-sans)",
}

const linkButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  font: "400 13px/1.4 var(--fx-font-sans)",
  color: 'var(--fx-text-tertiary)',
  textDecoration: 'underline',
  cursor: 'pointer',
}
