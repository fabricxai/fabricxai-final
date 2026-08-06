'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Card } from '@/components/fx/data'
import { useT } from '@/components/fx/locale'
import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { Button } from '@/components/fx/primitives'
import { MarbimMark } from '@/components/fx/mark'
import { signUp } from '@/lib/auth-client'

/**
 * Signup creates the factory as well as the user — a database hook makes the
 * company and grants the owner role in the same transaction, because an ERP
 * user with no company has nothing to look at.
 */
export default function SignupPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error: err } = await signUp.email({
      email,
      password,
      name,
      // Read by the user-create hook to name the company.
      companyName: company,
    } as Parameters<typeof signUp.email>[0] & { companyName: string })

    setBusy(false)
    if (err) {
      setError(err.message ?? t('ui.auth.signup_failed'))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <EmptyState
        title={t('ui.auth.confirm_email')}
        body={t('ui.auth.confirm_email_body', { email })}
        action={
          <Button variant="secondary" onClick={() => setSent(false)}>
            {t('ui.auth.different_address')}
          </Button>
        }
      />
    )
  }

  return (
    <Card padding={32}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: "600 26px/1.15 var(--fx-font-sans)", margin: 0 }}>{t('ui.auth.create_account')}</h1>
          <p style={{ font: "400 15px/1.55 var(--fx-font-sans)", color: 'var(--fx-text-secondary)', margin: 0 }}>
            {t('ui.auth.create_account_tagline')}
          </p>
        </div>

        <TextInput
          label={t('ui.auth.your_name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          label={t('ui.auth.factory_name')}
          hint={t('ui.auth.factory_name_hint')}
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <TextInput
          label={t('ui.auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label={t('ui.auth.password')}
          type="password"
          autoComplete="new-password"
          hint={t('ui.auth.password_hint', { count: 10 })}
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? (
            <MarbimMark state="thinking" size={20} label={t('ui.auth.creating')} />
          ) : (
            t('ui.auth.create_button')
          )}
        </Button>

        <div style={{ font: "400 14px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
          {t('ui.auth.already_have')} <Link href="/login">{t('ui.auth.sign_in')}</Link>
        </div>
      </form>
    </Card>
  )
}
