'use client'

/**
 * "I cannot get in."
 *
 * There was no such page. Email verification gates login, so a factory owner who forgot
 * their password had no path at all that did not go through somebody with database access
 * — a support call to the vendor, for the one account that cannot be recovered by an
 * admin because it IS the admin.
 *
 * **It always says the same thing.** Whether or not the address exists, the answer is
 * "check your inbox". A form that distinguishes the two is an account-enumeration oracle,
 * and this one is unauthenticated and rate-limited precisely because it is reachable by
 * anyone who can see the login page.
 */
import Link from 'next/link'
import { useState } from 'react'

import { Card } from '@/components/fx/data'
import { InlineAlert } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { MarbimMark } from '@/components/fx/mark'
import { Button } from '@/components/fx/primitives'
import { requestPasswordReset } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error: err } = await requestPasswordReset({
      email,
      // Where the emailed link lands. Better Auth appends the token, and appends
      // `?error=INVALID_TOKEN` instead when it has already rejected it.
      redirectTo: '/reset-password',
    })

    setBusy(false)

    // 429 is the one failure worth distinguishing: it is about the request, not the
    // account, so saying so tells an attacker nothing and tells a real user to wait
    // rather than to keep pressing a button that will not work.
    if (err?.status === 429) {
      setError('Too many attempts. Wait a few minutes and try again.')
      return
    }

    // Everything else — including an address with no account — reports success.
    setSent(true)
  }

  if (sent) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, font: '600 22px/1.25 var(--fx-font-sans)' }}>Check your inbox</h1>
          <p
            style={{
              margin: 0,
              font: '400 14.5px/1.6 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            If an account exists for <strong>{email}</strong>, a link to set a new password is
            on its way. It expires in one hour and can be used once.
          </p>
          <p
            style={{
              margin: 0,
              font: '400 13px/1.55 var(--fx-font-sans)',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            Nothing arrived? Check the spam folder, and confirm the address is the one the
            account was created with.
          </p>
          <Link href="/login" style={{ font: '500 14px/1.4 var(--fx-font-sans)' }}>
            Back to sign in
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: '600 22px/1.25 var(--fx-font-sans)' }}>
            Reset your password
          </h1>
          <p
            style={{
              margin: 0,
              font: '400 14px/1.55 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            Enter the address your account was created with and we will send a link to set a
            new password.
          </p>
        </div>

        <TextInput
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? <MarbimMark state="thinking" size={20} label="Sending" /> : 'Send the link'}
        </Button>

        <div
          style={{ font: '400 14px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}
        >
          Remembered it? <Link href="/login">Sign in</Link>
        </div>
      </form>
    </Card>
  )
}
