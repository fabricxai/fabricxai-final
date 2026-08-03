import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Card } from '@/components/fx/data'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { companyProfile, listPolicies, roleMatrix } from '@/modules/settings/service'

import { FactoryTypePanel, ProfileForm } from './settings-client'

/**
 * X.3 Settings & Admin ⚖.
 *
 * Everything here is read for any signed-in user and editable only by owner or
 * admin — the service enforces that, so a non-admin sees the same figures and
 * simply has no form.
 */
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const canEdit = ctx.roles.includes('owner') || ctx.roles.includes('admin')

  const [profile, policies, matrix] = await Promise.all([
    companyProfile(ctx),
    listPolicies(ctx),
    roleMatrix(ctx),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title={profile?.legalName ?? 'This factory'}
        meta={canEdit ? undefined : 'read-only'}
        ownsAmber={!canEdit}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <section>
          <SectionHeading>Identity</SectionHeading>
          <ProfileForm
            canEdit={canEdit}
            profile={
              profile
                ? {
                    legalName: profile.legalName,
                    addressLines: profile.addressLines,
                    country: profile.country,
                    binNumber: profile.binNumber,
                    tinNumber: profile.tinNumber,
                    bondLicenceNo: profile.bondLicenceNo,
                    factoryType: profile.factoryType,
                    timezone: profile.timezone,
                    locale: profile.locale,
                    baseCurrency: profile.baseCurrency,
                    localCurrency: profile.localCurrency,
                  }
                : null
            }
          />
        </section>

        <section>
          <SectionHeading eyebrow="changes which modules exist">What this unit makes</SectionHeading>
          <FactoryTypePanel current={profile?.factoryType ?? 'woven'} />
        </section>

        <section>
          <SectionHeading eyebrow={`${policies.length} modules`}>Policy</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {policies.map((p) => {
              const overridden = Object.keys(p.overrides).length
              return (
                <Card key={p.moduleId} padding="18px 20px">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ font: "600 15px/1.3 var(--fx-font-sans)" }}>{p.label}</span>
                    <span data-mono style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                      {p.moduleId}
                    </span>
                    {/* Effective and overridden are shown apart, because a
                        deliberate 2% and a default 2% are different answers to
                        the question asked when the number turns out to be wrong. */}
                    <span style={{ marginLeft: 'auto' }}>
                      {p.unresolvable ? (
                        <Badge tone="danger">will not resolve</Badge>
                      ) : overridden > 0 ? (
                        <Badge tone="info">{overridden} overridden</Badge>
                      ) : (
                        <Badge>all defaults</Badge>
                      )}
                    </span>
                  </div>

                  {/* Says which value is wrong and where, because the person
                      reading this is the one who has to correct it. */}
                  {p.unresolvable ? (
                    <div
                      style={{
                        marginTop: 12,
                        font: "400 13px/1.55 var(--fx-font-sans)",
                        color: 'var(--fx-danger)',
                        textWrap: 'pretty',
                      }}
                    >
                      {p.unresolvable}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    {Object.entries(p.effective).map(([key, value]) => {
                      const isOverride = key in p.overrides
                      return (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span
                            style={{
                              font: "400 11.5px/1.3 var(--fx-font-mono)",
                              color: 'var(--fx-text-tertiary)',
                            }}
                          >
                            {key}
                          </span>
                          <span
                            data-numeric
                            style={{
                              font: "500 13px/1.3 var(--fx-font-mono)",
                              color: isOverride ? 'var(--fx-text-primary)' : 'var(--fx-text-secondary)',
                            }}
                          >
                            {formatValue(value)}
                            {isOverride ? (
                              <span style={{ color: 'var(--fx-text-tertiary)', marginLeft: 6 }}>
                                (set)
                              </span>
                            ) : null}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow={`${matrix.length} people`}>Who can do what</SectionHeading>
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
                gridTemplateColumns: '1.2fr 1.6fr 2fr',
                gap: 14,
                padding: '10px 18px',
                background: 'var(--fx-bg-sunken)',
                font: "500 11px/1 var(--fx-font-mono)",
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              <div>Name</div>
              <div>Email</div>
              <div>Roles</div>
            </div>
            {matrix.map((row) => (
              <div
                key={row.userId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1.6fr 2fr',
                  gap: 14,
                  padding: '13px 18px',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  alignItems: 'center',
                  minHeight: 'var(--fx-row-height)',
                }}
              >
                <span style={{ font: "500 14px/1.3 var(--fx-font-sans)" }}>{row.name ?? '—'}</span>
                <span
                  data-mono
                  style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
                >
                  {row.email ?? '—'}
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {row.roles.filter((r) => !r.revokedAt).map((r) => (
                    <Badge key={r.role}>{r.role}</Badge>
                  ))}
                  {/* A revoked role is shown struck rather than removed: "was an
                      admin until Tuesday" is the question an audit actually asks. */}
                  {row.roles
                    .filter((r) => r.revokedAt)
                    .map((r) => (
                      <span
                        key={`${r.role}-revoked`}
                        style={{
                          font: "500 11px/1 var(--fx-font-mono)",
                          letterSpacing: '.05em',
                          textTransform: 'uppercase',
                          color: 'var(--fx-text-tertiary)',
                          textDecoration: 'line-through',
                          padding: '5px 8px',
                        }}
                      >
                        {r.role}
                      </span>
                    ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
