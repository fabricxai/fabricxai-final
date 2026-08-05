import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Card, StatTile } from '@/components/fx/data'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { factoryInitials } from '@/components/shell/factory-chip'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { companyDisplayName, companyProfile } from '@/modules/settings/service'

/**
 * The factory — a read-first overview of the active unit.
 *
 * Deliberately thin for now: identity and operating context somebody expects
 * when they click the name in the top bar. Editing stays on Settings; this page
 * is the place to look, not to configure.
 */
export const dynamic = 'force-dynamic'

const FACTORY_TYPE_LABEL: Record<string, string> = {
  woven: 'Woven',
  knit: 'Knit',
  'knit-composite': 'Knit composite',
}

export default async function FactoryPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [profile, displayName] = await Promise.all([
    companyProfile(ctx),
    companyDisplayName(ctx),
  ])

  const name = profile?.legalName ?? displayName ?? 'This factory'
  const initials = factoryInitials(name)
  const factoryType = profile?.factoryType ?? 'woven'
  const canEdit = ctx.roles.includes('owner') || ctx.roles.includes('admin')
  const address =
    profile?.addressLines?.filter(Boolean).join(', ') ||
    (profile?.country ? profile.country : 'Address not set yet')

  return (
    <>
      <PageHeader
        eyebrow="Factory"
        title={name}
        meta={FACTORY_TYPE_LABEL[factoryType] ?? factoryType}
        ownsAmber
        actions={
          canEdit ? (
            <Link
              href="/settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 'var(--fx-radius-md)',
                border: '1px solid var(--fx-border-default)',
                background: 'var(--fx-bg-surface)',
                color: 'var(--fx-text-primary)',
                font: '600 13.5px/1 var(--fx-font-sans)',
                textDecoration: 'none',
              }}
            >
              Edit in Settings
            </Link>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Card padding="22px 24px">
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                borderRadius: 'var(--fx-radius-md)',
                background: 'var(--fx-text-primary)',
                color: 'var(--fx-text-inverse)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: '700 24px/1 var(--fx-font-sans)',
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ font: '600 20px/1.25 var(--fx-font-sans)' }}>{name}</span>
                <Badge>{FACTORY_TYPE_LABEL[factoryType] ?? factoryType}</Badge>
              </div>
              <span
                style={{
                  font: '400 14px/1.45 var(--fx-font-sans)',
                  color: 'var(--fx-text-secondary)',
                  textWrap: 'pretty',
                }}
              >
                {address}
              </span>
              <span
                style={{
                  font: '400 12px/1.4 var(--fx-font-mono)',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                Logo plate uses initials until a company logo is uploaded
              </span>
            </div>
          </div>
        </Card>

        <section>
          <SectionHeading>Operating identity</SectionHeading>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <StatTile label="Factory type" value={FACTORY_TYPE_LABEL[factoryType] ?? factoryType} />
            <StatTile label="Country" value={profile?.country ?? '—'} />
            <StatTile label="Timezone" value={profile?.timezone ?? '—'} />
            <StatTile label="Locale" value={profile?.locale ?? '—'} />
            <StatTile
              label="Currencies"
              value={
                profile
                  ? `${profile.baseCurrency} / ${profile.localCurrency}`
                  : '—'
              }
              basis="buyer-facing / local"
            />
          </div>
        </section>

        <section>
          <SectionHeading>Trade identifiers</SectionHeading>
          <Card padding="18px 20px">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              <Fact label="BIN" value={profile?.binNumber} />
              <Fact label="TIN" value={profile?.tinNumber} />
              <Fact label="Bond licence" value={profile?.bondLicenceNo} />
            </div>
          </Card>
        </section>
      </div>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          font: '400 11.5px/1.3 var(--fx-font-mono)',
          color: 'var(--fx-text-tertiary)',
          letterSpacing: '.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: '500 15px/1.35 var(--fx-font-mono)',
          color: value ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)',
        }}
      >
        {value?.trim() || 'Not set'}
      </span>
    </div>
  )
}
