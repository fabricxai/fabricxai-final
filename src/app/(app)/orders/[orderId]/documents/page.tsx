import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { Card } from '@/components/fx/data'
import { EmptyState } from '@/components/fx/feedback'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { FactPair } from '@/components/fx/tna'
import { RouteHeader } from '@/components/shell/route-header'
import { documentsFor, type AttachedDocument } from '@/modules/core/documents'
import { getCtx } from '@/modules/core/session'
import { orderDetail } from '@/modules/orders/queries'
import { FACTORY_TIMEZONE } from '@/lib/dates'
import { requestLocale } from '@/lib/ui-locale'

/**
 * 1.3 Order desk — the paper behind one order.
 *
 * A merchandiser's order does not live in the order table. It lives in a buyer's tech
 * pack, a measurement chart, a costing sheet, a signed confirmation and a sales contract,
 * and until now the app could hold every one of those files and show none of them next to
 * the order they belong to. Intake has been writing `entityTable='orders'` since it
 * shipped; this is the screen that reads it back.
 *
 * The TNA and the breakdown stay on the order page itself — they are what a merchandiser
 * opens an order FOR. This is the second drawer: the style's own facts, and the documents
 * that decided them.
 */
export const dynamic = 'force-dynamic'

/** Words for the `kind` intake stamps on a file. An unknown kind shows as itself. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  buyer_po: 'Buyer PO',
  buyer_enquiry: 'Enquiry',
  tech_pack: 'Tech pack',
  measurement_chart: 'Measurement chart',
  costing: 'Costing',
  sales_contract: 'Sales contract',
  lc: 'Letter of credit',
}

function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * `uploaded` and `ready` are the file's own progress through extraction, not something a
 * merchandiser asked about — only the two that mean "this file is not usable" get a word.
 */
function statusTone(status: string): { tone: 'danger' | 'warning' | 'neutral'; word: string } | null {
  if (status === 'quarantined') return { tone: 'danger', word: 'quarantined' }
  if (status === 'failed') return { tone: 'danger', word: 'could not be read' }
  if (status === 'processing') return { tone: 'warning', word: 'still reading' }
  return null
}

export default async function OrderDocumentsPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { orderId } = await params
  const locale = await requestLocale()

  const order = await orderDetail(ctx, orderId)
  if (!order) notFound()

  const docs = await documentsFor(ctx, { entityTable: 'orders', entityId: order.id })
  const po = order.poNumbers[0] ?? order.id.slice(0, 8)

  return (
    <>
      <RouteHeader
        path={`/orders/${orderId}/documents`}
        labels={{ orderId: po }}
        locale={locale}
        eyebrow={order.buyerName ?? 'Order'}
        title="Style and documents"
        meta={docs.length === 1 ? '1 file' : `${docs.length} files`}
        ownsAmber
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <Card>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <FactPair label="Style">{order.style?.styleCode ?? '—'}</FactPair>
            <FactPair label="Description">{order.style?.description ?? '—'}</FactPair>
            <FactPair label="Contracted">
              <span data-numeric>
                {order.style?.contractedQty?.toLocaleString() ?? '—'} pcs
              </span>
            </FactPair>
            <FactPair label="Grid revision">
              {order.style ? `rev ${order.style.activeRevision}` : '—'}
            </FactPair>
            <FactPair label="Ex-factory">{order.plannedExFactoryDate ?? '—'}</FactPair>
          </div>
        </Card>

        <section>
          <SectionHeading eyebrow="what the buyer sent, and what we filed">
            Documents on this order
          </SectionHeading>
          {docs.length === 0 ? (
            <EmptyState
              title="No files on this order yet"
              body="Drop a buyer's document on MARBIM and it files itself here — the tech pack, the measurement chart, the amendment mail. Anything read for this order lands on this page."
            />
          ) : (
            <DocumentList docs={docs} />
          )}
        </section>
      </div>
    </>
  )
}

function DocumentList({ docs }: { docs: readonly AttachedDocument[] }) {
  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        overflow: 'hidden',
      }}
    >
      {docs.map((doc, i) => {
        const flag = statusTone(doc.status)
        return (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '13px 18px',
              minHeight: 'var(--fx-row-height)',
              borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
            }}
          >
            <span style={{ font: '500 14px/1.3 var(--fx-font-sans)', minWidth: 0 }}>
              {doc.filename}
            </span>
            {doc.kind ? <Badge>{KIND_WORDS[doc.kind] ?? doc.kind}</Badge> : null}
            {flag ? <Badge tone={flag.tone}>{flag.word}</Badge> : null}
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                font: '400 12px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              <span data-numeric>{sizeWords(doc.sizeBytes)}</span>
              <span>
                {new Intl.DateTimeFormat('en-GB', {
                  timeZone: FACTORY_TIMEZONE,
                  day: '2-digit',
                  month: 'short',
                }).format(doc.uploadedAt)}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
