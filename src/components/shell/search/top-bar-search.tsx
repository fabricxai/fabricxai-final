'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import { runGlobalSearch } from './actions'
import type { SearchHit } from './search-types'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  module: 'Module',
  order: 'Order',
  buyer: 'Buyer',
  lead: 'Lead',
  lc: 'LC',
  sample: 'Sample',
  requisition: 'PR',
  ud: 'UD',
}

/**
 * Centered top-bar search. Debounced server query; results open the module or record.
 * ⌘K stays with MARBIM — this field is focused with `/` when not already typing.
 */
export function TopBarSearch() {
  const router = useRouter()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          return
        }
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) return
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await runGlobalSearch({ query: q })
        if ('hits' in result) {
          setHits(result.hits)
          setActive(0)
        }
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  function go(hit: SearchHit) {
    setOpen(false)
    setQuery('')
    setHits([])
    router.push(hit.href)
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={query}
        placeholder="Search modules, orders, buyers…"
        aria-label="Search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showPanel}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          if (e.target.value.trim().length < 1) setHits([])
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
            return
          }
          if (!showPanel || hits.length === 0) {
            if (e.key === 'Enter') e.preventDefault()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, hits.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const hit = hits[active]
            if (hit) go(hit)
          }
        }}
        style={{
          width: '100%',
          height: 36,
          padding: '0 12px',
          background: 'var(--fx-bg-sunken)',
          color: 'var(--fx-text-primary)',
          border: '1px solid transparent',
          borderRadius: 'var(--fx-radius-sm)',
          font: '400 13px/1 var(--fx-font-sans)',
        }}
      />

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 80,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-md)',
            boxShadow: 'var(--fx-sh2)',
            padding: 6,
          }}
        >
          {pending && hits.length === 0 ? (
            <div
              style={{
                padding: '12px 10px',
                font: '400 12.5px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              Searching…
            </div>
          ) : hits.length === 0 ? (
            <div
              style={{
                padding: '12px 10px',
                font: '400 12.5px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              No matches in what you can open
            </div>
          ) : (
            hits.map((hit, i) => {
              const selected = i === active
              return (
                <button
                  key={`${hit.kind}:${hit.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    padding: '10px 10px',
                    border: 'none',
                    borderRadius: 'var(--fx-radius-sm)',
                    background: selected ? 'var(--fx-bg-selected)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--fx-text-primary)',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'space-between',
                      gap: 10,
                      font: '500 13px/1.3 var(--fx-font-sans)',
                    }}
                  >
                    <span>{hit.title}</span>
                    <span
                      style={{
                        font: '500 11px/1 var(--fx-font-mono)',
                        letterSpacing: '.04em',
                        textTransform: 'uppercase',
                        color: 'var(--fx-text-tertiary)',
                        flexShrink: 0,
                      }}
                    >
                      {KIND_LABEL[hit.kind]}
                    </span>
                  </span>
                  <span
                    style={{
                      font: '400 12px/1.3 var(--fx-font-mono)',
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    {hit.subtitle}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
