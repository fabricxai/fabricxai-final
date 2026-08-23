import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { StatusChip } from '@/components/fx/status-chip'
import { RouteHeader } from '@/components/shell/route-header'
import { canWrite, NAV } from '@/components/shell/nav'
import { getCtx } from '@/modules/core/session'
import { INPUT_CATEGORY_WORDS } from '@/modules/orders/inputs'
import { inputsMatrix } from '@/modules/orders/queries'
import { INPUT_CATEGORIES } from '@/modules/orders/zod'
import { companyProfile } from '@/modules/settings/service'
import { factoryToday } from '@/lib/dates'

import { InputCellButton } from './matrix-client'

/**
 * 1.3 Order Desk — the In-House Check List, off the spreadsheet.
 *
 * The merchandising department's most-lived-in sheet: one row per PO, one column per
 * input category, each cell a date OR a word OR a note. The app tracked the two
 * milestone-level facts (fabric in-house, trims in-house) and none of the twelve
 * material-level ones, so the sheet survived every demo — it held detail the product
 * had no cell for. This screen is that sheet, with the one honesty fix the paper
 * version cannot make: the roll-up counts only the categories a style actually uses.
 */
export const dynamic = 'force-dynamic'

export default async function InputsMatrixPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const today = factoryToday()
  const rows = await inputsMatrix(ctx, { today })

  const profile = await companyProfile(ctx)
  const mayWrite = canWrite(
    NAV.find((n) => n.id === 'orders')!,
    ctx.roles,
    profile?.factoryType ?? 'woven',
  )

  const blocked = rows.filter((r) => r.rollup.late > 0).length

  return (
    <>
      <RouteHeader
        path="/orders/inputs"
        eyebrow="Order desk · in-house checklist"
        title="Inputs readiness"
        meta={
          rows.length === 0
            ? undefined
            : `${rows.length} open order${rows.length === 1 ? '' : 's'} · ${INPUT_CATEGORIES.length} input categories${blocked > 0 ? ` · ${blocked} with late inputs` : ''}`
        }
        ownsAmber
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No open orders to track"
          body="Cells appear here the moment an order does — one row per PO, one column per input, each cell holding a date, a word, or a note. Type whichever you have."
        />
      ) : (
        <div
          className="fx-scroll-x"
          tabIndex={0}
          style={{
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-subtle)',
            borderRadius: 'var(--fx-radius-md)',
            overflowY: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `150px repeat(${INPUT_CATEGORIES.length}, minmax(64px, 1fr)) 84px`,
              minWidth: 1080,
              gap: 4,
              padding: '10px 14px',
              background: 'var(--fx-bg-sunken)',
              font: '500 10px/1 var(--fx-font-mono)',
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
              alignItems: 'center',
            }}
          >
            <div>PO</div>
            {INPUT_CATEGORIES.map((category) => (
              <div key={category} style={{ textAlign: 'center' }}>
                {INPUT_CATEGORY_WORDS[category]}
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>In-house</div>
          </div>

          {rows.map((row) => (
            <div
              key={row.orderId}
              style={{
                display: 'grid',
                gridTemplateColumns: `150px repeat(${INPUT_CATEGORIES.length}, minmax(64px, 1fr)) 84px`,
                minWidth: 1080,
                gap: 4,
                padding: '6px 14px',
                alignItems: 'center',
                borderTop: '1px solid var(--fx-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <a
                  href={`/orders/${row.orderId}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <Ident>{row.poNumber ?? row.orderId.slice(0, 8)}</Ident>
                </a>
                <span
                  style={{
                    font: '400 10.5px/1.3 var(--fx-font-mono)',
                    color: 'var(--fx-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[row.buyerName, row.plannedExFactoryDate].filter(Boolean).join(' · ')}
                </span>
              </div>

              {row.cells.map((cell) => (
                <InputCellButton
                  key={cell.category}
                  orderId={row.orderId}
                  poNumber={row.poNumber}
                  cell={cell}
                  canWrite={mayWrite}
                />
              ))}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  alignItems: 'flex-end',
                  textAlign: 'right',
                }}
              >
                <span data-numeric data-mono style={{ font: '500 12.5px/1 var(--fx-font-mono)' }}>
                  {row.rollup.inHouse}/{row.rollup.applicable}
                </span>
                <StatusChip
                  status={
                    row.rollup.complete
                      ? 'on-track'
                      : row.rollup.late > 0
                        ? 'late'
                        : 'at-risk'
                  }
                >
                  {row.rollup.complete ? 'all in' : row.rollup.late > 0 ? `${row.rollup.late} late` : 'open'}
                </StatusChip>
              </div>
            </div>
          ))}

          <div
            style={{
              display: 'flex',
              gap: 18,
              alignItems: 'center',
              padding: '10px 14px',
              borderTop: '1px solid var(--fx-border-subtle)',
              font: '400 11.5px/1.4 var(--fx-font-mono)',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            <span>a cell holds a date, a word, or a note — type whichever you have</span>
            <span style={{ marginLeft: 'auto' }}>
              the count ignores categories a style does not use
            </span>
          </div>
        </div>
      )}
    </>
  )
}
