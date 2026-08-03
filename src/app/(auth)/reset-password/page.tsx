'use client'

/**
 * Where the reset link lands.
 *
 * Two states worth building properly rather than one:
 *
 *  - **the token is missing or spent.** A reset link is single-use and expires in an hour,
 *    so arriving at a dead one is the common case, not the edge — somebody opens the email
 *    the next morning. It says which of the two it is and offers the way to get a fresh
 *    one, because "invalid token" tells a person nothing they can act on.
 *  - **the password is too short.** Checked here as well as at the server, so the answer
 *    arrives as they type rather than after a round trip that clears the field.
 */
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { Card } from '@/components/fx/data'
import { InlineAlert } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { MarbimMark } from '@/components/fx/mark'
import { Button } from '@/components/fx/primitives'
import { resetPassword } from '@/lib/auth-client'

/** Mirrors `minPasswordLength` in lib/auth.ts. */
const MIN_LENGTH = 10

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Better Auth appends `?error=INVALID_TOKEN` when it rejects the link before this page
  // renders, so distinguish "the link is spent" from "you arrived with no link at all".
  const linkProblem = params.get('error')

  if (!token || linkProblem) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, font: '600 22px/1.25 var(--fx-font-sans)' }}>
            That link no longer works
          </h1>
          <p
            style={{
              margin: 0,
              font: '400 14.5px/1.6 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            {token
              ? 'It has already been used, or it expired — a reset link lasts one hour and works once.'
              : 'This page is opened from the link in a password-reset email.'}{' '}
            Ask for a new one and use it straight away.
          </p>
          <Link href="/forgot-password" style={{ font: '500 14px/1.4 var(--fx-font-sans)' }}>
            Send a new link
          </Link>
        </div>
      </Card>
    )
  }

  if (done) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, font: '600 22px/1.25 var(--fx-font-sans)' }}>
            Your password is set
          </h1>
          <p
            style={{
              margin: 0,
              font: '400 14.5px/1.6 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            Sign in with the new one. If you are on a shared floor tablet, sign out when you
            hand it over — what you do is recorded against your name.
          </p>
          <Button variant="primary" size="lg" full onClick={() => router.push('/login')}>
            Sign in
          </Button>
        </div>
      </Card>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setBusy(true)
    const { error: err } = await resetPassword({ newPassword: password, token: token! })
    setBusy(false)

    if (err) {
      // A rejection at this point is almost always the token, since the password was
      // checked above — say that rather than repeating the rules.
      setError(
        err.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : 'That did not work. The link may have expired — ask for a new one.',
      )
      return
    }

    setDone(true)
  }

  return (
    <Card>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: '600 22px/1.25 var(--fx-font-sans)' }}>
            Set a new password
          </h1>
          <p
            style={{
              margin: 0,
              font: '400 14px/1.55 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            At least {MIN_LENGTH} characters. Every other session stays signed in — sign out
            of shared devices yourself.
          </p>
        </div>

        <TextInput
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <TextInput
          label="New password again"
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? <MarbimMark state="thinking" size={20} label="Saving" /> : 'Save the password'}
        </Button>
      </form>
    </Card>
  )
}
