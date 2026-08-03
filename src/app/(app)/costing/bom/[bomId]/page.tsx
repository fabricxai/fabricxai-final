import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { Breadcrumbs } from '@/components/fx/data'
import { InlineAlert } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { bomDetail } from '@/modules/costing/queries'

/**
 * One bill of materials, read-only.
 *
 * **Not editable, and that is the design.** A cost sheet pins the BOM it was costed
 * against, so editing a BOM in place restates what an approved quote was built on — with
 * nothing recording that it moved. The factory has already sent the buyer a price. A
 * changed bill of materials is a new one.
 *
 * The per-line basis is shown on every row rather than summarised, because it varies within
 * a BOM: 1.6 seeds from a past order and falls back to the old estimate for any line nothing
 * was issued against. "Mostly measured" is not a thing anybody can act on; which lines are
 * is.
 */
export const dynamic = 'force-dynamic'

const SOURCE_LABEL: Record<string, string> = {
  manual: 'typed by hand',
  tech_pack_extract: 'read from a tech pack',
  seeded: 'seeded from a past order',
}

export default async function BomDetailPage({
  params,
}: {
  params: Promise<{ bomId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { bomId } = await params
  const detail = await bomDetail(ctx, bomId)
  if (!detail) notFound()

  const { bom, lines } = detail
  const estimated = lines.filter((l) => l.consumptionBasis !== 'actual')

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Breadcrumbs
          trail={[
            { label: 'Costing studio', href: '/costing' },
            { label: 'Bills of materials', href: '/costing/bom' },
            { label: bom.styleCode },
          ]}
        />
      </div>

      <PageHeader
        eyebrow={`Bill of materials · ${SOURCE_LABEL[bom.source] ?? bom.source}`}
        title={bom.styleCode}
        meta={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`}
        ownsAmber
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {bom.usedByApprovedSheet ? (
          <InlineAlert tone="info">
            An approved cost sheet is priced against this bill of materials. It cannot be
            edited — the buyer has been quoted on these numbers, and changing them here would
            restate that quote with nothing recording the change. Build a new one instead.
          </InlineAlert>
        ) : null}

        {estimated.length === lines.length ? (
          <InlineAlert tone="warning">
            Every consumption here is an estimate. That is normal for a style nobody has made
            yet, and it is worth knowing before quoting a thin margin on it — the figures
            become measured only once material is issued against a real order.
          </InlineAlert>
        ) : null}

        <section>
          <SectionHeading eyebrow="fabric first — it is most of the cost">
            What the garment is made of
          </SectionHeading>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...row, background: 'transparent', border: 'none' }}>
              <span style={{ ...head, flex: '0 0 120px' }}>Group</span>
              <span style={{ ...head, flex: '1 1 220px' }}>Item</span>
              <span style={{ ...head, flex: '0 0 140px', textAlign: 'right' }}>Per garment</span>
              <span style={{ ...head, flex: '0 0 100px', textAlign: 'right' }}>Wastage</span>
              <span style={{ ...head, flex: '0 0 130px' }}>Basis</span>
            </div>

            {lines.map((line) => (
              <div key={line.id} style={row}>
                <span style={{ flex: '0 0 120px' }}>
                  <Badge>{line.lineGroup}</Badge>
                </span>

                <span
                  style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 3 }}
                >
                  {line.itemRef ? <Ident size={13}>{line.itemRef}</Ident> : null}
                  {line.spec ? (
                    <span
                      style={{
                        font: "400 12.5px/1.45 var(--fx-font-sans)",
                        color: 'var(--fx-text-secondary)',
                      }}
                    >
                      {line.spec}
                      {line.sourcePage ? ` · tech pack p.${line.sourcePage}` : ''}
                    </span>
                  ) : null}
                </span>

                <span
                  data-numeric
                  style={{
                    flex: '0 0 140px',
                    textAlign: 'right',
                    font: "500 14px/1.3 var(--fx-font-mono)",
                  }}
                >
                  {line.consumption} {line.uom}
                </span>

                <span
                  data-numeric
                  style={{
                    flex: '0 0 100px',
                    textAlign: 'right',
                    font: "400 13px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-secondary)',
                  }}
                >
                  {line.wastagePct}%
                </span>

                {/* Per line, never rolled up: a seeded BOM mixes measured lines with
                    fallbacks, and which is which is the whole question. */}
                <span style={{ flex: '0 0 130px' }}>
                  {line.consumptionBasis === 'actual' ? (
                    <Badge tone="success">measured</Badge>
                  ) : (
                    <Badge tone="neutral">estimated</Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <p
          style={{
            margin: 0,
            font: "400 12px/1.6 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          No prices here on purpose. A bill of materials is what the garment is made of; what it
          costs is a cost sheet, priced at today&rsquo;s rates in the costing studio. The same
          fabric is quoted at two prices six weeks apart, and a rate buried in here would make
          the older sheet impossible to explain.
        </p>
      </div>
    </>
  )
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flexWrap: 'wrap',
  padding: '12px 18px',
  minHeight: 'var(--fx-row-height)',
  background: 'var(--fx-bg-surface)',
  border: '1px solid var(--fx-border-subtle)',
  borderRadius: 'var(--fx-radius-md)',
}

const head: React.CSSProperties = {
  font: "500 11px/1.3 var(--fx-font-mono)",
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--fx-text-tertiary)',
}
