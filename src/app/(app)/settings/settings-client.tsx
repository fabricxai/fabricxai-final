'use client'

import { useState, useTransition } from 'react'

import { Card } from '@/components/fx/data'
import { InlineAlert, Toast } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Select, TextInput } from '@/components/fx/forms'
import { Button } from '@/components/fx/primitives'
import { saveCompanyProfile } from '@/modules/settings/actions'

type FactoryType = 'woven' | 'knit' | 'knit-composite'

export interface ProfileView {
  legalName: string
  addressLines: string[]
  country: string
  binNumber: string | null
  tinNumber: string | null
  bondLicenceNo: string | null
  factoryType: FactoryType
  timezone: string
  locale: string
  baseCurrency: string
  localCurrency: string
}

export function ProfileForm({
  profile,
  canEdit,
}: {
  profile: ProfileView | null
  canEdit: boolean
}) {
  const [form, setForm] = useState<ProfileView>(
    profile ?? {
      legalName: '',
      addressLines: [],
      country: 'BD',
      binNumber: null,
      tinNumber: null,
      bondLicenceNo: null,
      factoryType: 'woven',
      timezone: 'Asia/Dhaka',
      locale: 'en',
      baseCurrency: 'USD',
      localCurrency: 'BDT',
    },
  )
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof ProfileView>(key: K, value: ProfileView[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  if (!canEdit) {
    return (
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          <Fact label="Legal name">{form.legalName || '—'}</Fact>
          <Fact label="BIN" mono>
            {form.binNumber ?? '—'}
          </Fact>
          <Fact label="TIN" mono>
            {form.tinNumber ?? '—'}
          </Fact>
          <Fact label="Bond licence" mono>
            {form.bondLicenceNo ?? '—'}
          </Fact>
          <Fact label="Factory type">{form.factoryType}</Fact>
          <Fact label="Currencies" mono>
            {form.baseCurrency} buyer-facing · {form.localCurrency} local
          </Fact>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            try {
              await saveCompanyProfile({
                ...form,
                binNumber: form.binNumber || undefined,
                tinNumber: form.tinNumber || undefined,
                bondLicenceNo: form.bondLicenceNo || undefined,
              })
              setSaved(true)
            } catch (e) {
              setError(actionErrorMessage(e, 'That did not save'))
            }
          })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          <TextInput
            label="Legal name"
            hint="What goes on an invoice, a UD and a bank submission."
            required
            value={form.legalName}
            onChange={(e) => set('legalName', e.target.value)}
          />
          <TextInput
            label="BIN"
            hint="Business Identification Number."
            mono
            value={form.binNumber ?? ''}
            onChange={(e) => set('binNumber', e.target.value)}
          />
          <TextInput
            label="TIN"
            mono
            value={form.tinNumber ?? ''}
            onChange={(e) => set('tinNumber', e.target.value)}
          />
          <TextInput
            label="Bond licence"
            hint="UDs are drawn against it."
            mono
            value={form.bondLicenceNo ?? ''}
            onChange={(e) => set('bondLicenceNo', e.target.value)}
          />
          {/*
            * The control that was missing (plan 5.8, audit FE-S14).
            *
            * The form initialised with a hardcoded `locale: 'en'` and offered no way to
            * change it, so the FIRST profile save wrote English into the company record
            * with nobody having chosen it — a setting decided by a default. It is now the
            * shell's fallback for any device that has not picked a language itself, which
            * is what a wall-mounted tablet on a cutting floor actually is.
            */}
          <Select
            label="Default language"
            hint="What a device that has not chosen one shows. A person switching language on a shared tablet still wins."
            value={form.locale}
            onChange={(e) => set('locale', e.target.value)}
          >
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </Select>
          <Select
            label="Factory type"
            hint="Decides which modules exist for this unit."
            value={form.factoryType}
            onChange={(e) => set('factoryType', e.target.value as FactoryType)}
          >
            <option value="woven">Woven</option>
            <option value="knit">Knit</option>
            <option value="knit-composite">Knit · composite</option>
          </Select>
          <TextInput
            label="Buyer-facing currency"
            mono
            maxLength={3}
            value={form.baseCurrency}
            onChange={(e) => set('baseCurrency', e.target.value.toUpperCase())}
          />
          <TextInput
            label="Local currency"
            hint="Wages, local purchases, utilities."
            mono
            maxLength={3}
            value={form.localCurrency}
            onChange={(e) => set('localCurrency', e.target.value.toUpperCase())}
          />
          <TextInput
            label="Timezone"
            hint="Every date in this system is a calendar fact here."
            mono
            value={form.timezone}
            onChange={(e) => set('timezone', e.target.value)}
          />
        </div>

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          {saved ? <Toast message="Saved" /> : null}
        </div>
      </form>
    </Card>
  )
}

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ font: "400 12px/1 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}>
        {label}
      </span>
      <span
        data-mono={mono || undefined}
        style={{
          font: mono ? '500 14px/1.3 var(--fx-font-mono)' : '500 14px/1.3 var(--fx-font-sans)',
          color: 'var(--fx-text-primary)',
        }}
      >
        {children}
      </span>
    </div>
  )
}

/**
 * What changing the factory type actually does.
 *
 * This is not decoration. The setting adds and removes whole modules, so the
 * screen states which ones before somebody changes it — a nav that silently
 * loses the UD workbench is a support ticket, not a preference.
 */
const EFFECT: Record<FactoryType, { shows: string[]; hides: string[] }> = {
  woven: {
    shows: [
      'The UD workbench — bonded shell fabric is drawn against a customs Utilization Declaration',
      'Fabric inspection as a gate before any issue to cutting',
      'Wash approval as a TNA milestone, and a wash stage on the sampling board',
      'Woven TNA templates, including the wash variant',
    ],
    hides: [
      'The knitting section on the planning board',
      'Yarn and greige as store categories',
      'Dyeing subcontractors as a supplier type',
    ],
  },
  knit: {
    shows: [
      'Finished knit fabric as the only fabric category',
      'Knit TNA templates',
      'Shade-group emphasis on roll intake',
    ],
    hides: [
      'The UD workbench — knit units buy their fabric rather than importing it bonded',
      'The knitting section and the dye house',
      'Yarn and greige as store categories',
      'The fabric-inspection gate and wash-approval milestones',
    ],
  },
  'knit-composite': {
    shows: [
      'The knitting section on the planning board, planned in kg per day',
      'Yarn, greige and dyed fabric as three separate stock states',
      'Yarn spinners and dyeing subcontractors as supplier types',
    ],
    hides: [
      'The UD workbench in its woven form — a composite unit draws UDs against yarn in kilos',
      'The wash-approval milestone and the sampling wash stage',
      'The fabric-inspection gate before issue',
    ],
  },
}

export function FactoryTypePanel({ current }: { current: FactoryType }) {
  const effect = EFFECT[current]

  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span
            style={{
              font: "500 11px/1 var(--fx-font-mono)",
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--fx-success)',
            }}
          >
            This unit has
          </span>
          {effect.shows.map((s) => (
            <div
              key={s}
              style={{
                font: "400 13.5px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
                textWrap: 'pretty',
              }}
            >
              {s}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span
            style={{
              font: "500 11px/1 var(--fx-font-mono)",
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            And does not
          </span>
          {effect.hides.map((s) => (
            <div
              key={s}
              style={{
                font: "400 13.5px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-tertiary)',
                textWrap: 'pretty',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
