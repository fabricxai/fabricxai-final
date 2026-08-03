'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Card } from '@/components/fx/data'
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
      setError(err.message ?? 'That did not go through.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <EmptyState
        title="Confirm your email"
        body={`We sent a link to ${email}. It expires in 24 hours, and you cannot sign in until it is used.`}
        action={
          <Button variant="secondary" onClick={() => setSent(false)}>
            Use a different address
          </Button>
        }
      />
    )
  }

  return (
    <Card padding={32}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: "600 26px/1.15 var(--fx-font-sans)", margin: 0 }}>Create an account</h1>
          <p style={{ font: "400 15px/1.55 var(--fx-font-sans)", color: 'var(--fx-text-secondary)', margin: 0 }}>
            This also creates your factory. You will be its owner.
          </p>
        </div>

        <TextInput
          label="Your name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          label="Factory name"
          hint="The legal name can be set later in Settings."
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? <MarbimMark state="thinking" size={20} label="Creating" /> : 'Create account'}
        </Button>

        <div style={{ font: "400 14px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
          Already have one? <Link href="/login">Sign in</Link>
        </div>
      </form>
    </Card>
  )
}
