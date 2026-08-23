import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'

import { compareDecimalStrings } from '@/lib/quantity'

import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { board as planningBoard } from '@/modules/planning/queries'
import { factoryToday } from '@/lib/dates'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { withTenantRead } from '@/modules/core/tenancy'
import { costSheets } from '@/modules/costing/schema'
import { getPolicy } from '@/modules/settings/service'
import { buildFromBom, type CostingPolicy } from '@/modules/costing/service'

import { CostingStudioDoor, type StudioSeed } from './studio-client'

/**
 * 1.5 Costing Studio.
 *
 * The margin floor is the point of this screen. It is a server-side gate, so
 * the studio previews through a server action rather than computing in the
 * browser — the number a merchandiser sees is the number the approve path will
 * apply, not a friendlier one.
 */
export const dynamic = 'force-dynamic'

export default async function CostingPage({
  searchParams,
}: {
  searchParams: Promise<{ bomId?: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const policy = await getPolicy<CostingPolicy>(ctx, 'costing')

  /*
   * `?bomId=` seeds the studio from an approved bill of materials.
   *
   * `buildFromBom` had existed, tested and documented, since the module landed — and
   * nothing called it. The studio opened on a hardcoded men's shirt, so "cost the style
   * whose BOM you just approved" meant reading consumption figures off one screen and
   * retyping them into another. The tech-pack intake path ended one click short of the
   * screen it feeds.
   *
   * Rates deliberately start at zero: the BOM knows what the garment is made of, not what
   * the material costs today. A zero renders loudly in the preview, which is the prompt to
   * price each line — quietly guessing a rate would put an invented number one approval
   * away from a quote.
   */
  const { bomId } = await searchParams
  let seed: StudioSeed | null = null
  if (bomId) {
    const built = await buildFromBom(ctx, {
      bomId,
      rates: {},
      sections: {
        fxRateLocalToBase: '0.00837',
        cm: { method: 'smv', smv: '18.4', efficiencyPct: '62', labourRatePerMinuteLocal: '3.10' },
        marginPct: '12',
        marginBasis: 'price',
      },
    })
    seed = {
      bomId,
      styleCode: built.styleCode,
      fabric: built.sections.fabric.map((line) => ({ ...line })),
      trims: built.sections.trims.map((line) => ({ ...line })),
    }
  }

  const sheets = await withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: costSheets.id,
        styleCode: costSheets.styleCode,
        version: costSheets.version,
        status: costSheets.status,
        currency: costSheets.currency,
        totalCost: costSheets.totalCost,
        fobPrice: costSheets.fobPrice,
        achievedMarginPct: costSheets.achievedMarginPct,
        updatedAt: costSheets.updatedAt,
      })
      .from(costSheets)
      .orderBy(desc(costSheets.updatedAt))
      .limit(50),
  )

  return (
    <>
      <PageHeader
        eyebrow="Costing studio"
        /* The list is the landing (plan 2.3): the visit a merchandiser makes most is
           checking a sheet that exists, and the 31-input form is one task's destination,
           not a lobby. */
        title={`${sheets.length} cost sheet${sheets.length === 1 ? '' : 's'}`}
        meta={policy.marginFloorPct ? `floor ${policy.marginFloorPct}%` : undefined}
        // The studio's own primary action owns the amber.
        ownsAmber={false}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <CostingStudioDoor marginFloorPct={policy.marginFloorPct ?? null} seed={seed} />

        {/*
          * The floor you are quoting into (design: capacity-aware quoting; the agent's
          * own mail said "I need to manage production space"). Read from the planner's
          * board through their queries (rule 11) — line-days carrying any committed
          * pieces over line-days that exist. Read-only here on purpose: the number is
          * the planner's, and this card only stops a quote selling December twice.
          */}
        <CapacityStrip ctx={ctx} />

        {/* The bill of materials is where consumption comes from; the studio prices it.
            Keeping them on separate screens is what stops a rate being buried in a BOM. */}
        <div>
          <Link
            href="/costing/bom"
            style={{ font: "400 13px/1.4 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}
          >
            Bills of materials — what each style is made of →
          </Link>
        </div>

        <section>
          <SectionHeading eyebrow={`${sheets.length} sheets`}>Saved sheets</SectionHeading>

          {sheets.length === 0 ? (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                padding: 24,
                font: "400 14px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              No cost sheets yet. A sheet becomes the approved basis for a quote once a
              manager signs it — the merchandiser who drafted it cannot.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr .6fr .9fr .9fr .9fr .9fr',
                  gap: 14,
                  padding: '10px 18px',
                  background: 'var(--fx-bg-sunken)',
                  font: "500 11px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                <div>Style</div>
                <div>Ver</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Cost</div>
                <div style={{ textAlign: 'right' }}>FOB</div>
                <div style={{ textAlign: 'right' }}>Margin</div>
              </div>
              {sheets.map((s) => {
                const below =
                  policy.marginFloorPct !== undefined &&
                  compareDecimalStrings(s.achievedMarginPct ?? '0', policy.marginFloorPct) < 0
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr .6fr .9fr .9fr .9fr .9fr',
                      gap: 14,
                      padding: '13px 18px',
                      borderTop: '1px solid var(--fx-border-subtle)',
                      alignItems: 'center',
                      minHeight: 'var(--fx-row-height)',
                    }}
                  >
                    <span data-mono style={{ font: "500 13px/1.3 var(--fx-font-mono)" }}>
                      {s.styleCode}
                    </span>
                    <span data-numeric style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                      v{s.version}
                    </span>
                    <span>
                      <Badge tone={s.status === 'approved' ? 'success' : 'neutral'}>{s.status}</Badge>
                    </span>
                    <span data-numeric data-mono style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right', color: 'var(--fx-text-secondary)' }}>
                      {s.totalCost} {s.currency}
                    </span>
                    <span data-numeric data-mono style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right', color: 'var(--fx-text-secondary)' }}>
                      {s.fobPrice}
                    </span>
                    <span
                      data-numeric
                      style={{
                        font: "500 13px/1.3 var(--fx-font-mono)",
                        textAlign: 'right',
                        color: below ? 'var(--fx-danger)' : 'var(--fx-text-primary)',
                      }}
                    >
                      {s.achievedMarginPct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}


async function CapacityStrip({ ctx }: { ctx: NonNullable<Awaited<ReturnType<typeof getCtx>>> }) {
  const today = factoryToday()
  const months: { label: string; from: string; days: number }[] = []
  for (let i = 0; i < 3; i++) {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    first.setUTCMonth(first.getUTCMonth() + i)
    const next = new Date(first)
    next.setUTCMonth(next.getUTCMonth() + 1)
    months.push({
      label: first.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }),
      from: first.toISOString().slice(0, 10),
      days: Math.round((next.getTime() - first.getTime()) / 86_400_000),
    })
  }

  const boards = await Promise.all(
    months.map((m) => planningBoard(ctx, { from: m.from, days: m.days })),
  )

  // No lines set up yet — say nothing rather than draw three empty bars.
  if ((boards[0]?.length ?? 0) === 0) return null

  const rows = months.map((m, i) => {
    const lines = boards[i] ?? []
    let lineDays = 0
    let busy = 0
    for (const line of lines) {
      for (const day of line.days) {
        if (day.availableMinutes <= 0) continue
        lineDays += 1
        if (day.committed > 0) busy += 1
      }
    }
    const pct = lineDays > 0 ? Math.round((busy * 100) / lineDays) : 0
    return { label: m.label, pct, busy, lineDays }
  })

  return (
    <section>
      <SectionHeading eyebrow="read-only · the planner&rsquo;s number">
        The floor you are quoting into
      </SectionHeading>
      <div
        style={{
          background: 'var(--fx-bg-surface)',
          border: '1px solid var(--fx-border-subtle)',
          borderRadius: 'var(--fx-radius-md)',
          boxShadow: 'var(--fx-sh1)',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 24,
        }}
      >
        {rows.map((row) => (
          <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: '500 13.5px/1 var(--fx-font-sans)' }}>{row.label}</span>
              <span
                data-numeric
                data-mono
                style={{
                  marginLeft: 'auto',
                  font: '400 12.5px/1 var(--fx-font-mono)',
                  color: 'var(--fx-text-secondary)',
                }}
              >
                {row.pct}%
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 4,
                background: 'var(--fx-bg-sunken)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${row.pct}%`,
                  height: '100%',
                  background:
                    row.pct >= 95
                      ? 'var(--fx-danger)'
                      : row.pct >= 80
                        ? 'var(--fx-warning)'
                        : 'var(--fx-success)',
                }}
              />
            </div>
            <span style={{ font: '400 11.5px/1.4 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}>
              {row.busy} of {row.lineDays} line-days carry work
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
