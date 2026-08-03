'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Card } from '@/components/fx/data'
import { InlineAlert } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { Button } from '@/components/fx/primitives'
import { MarbimMark } from '@/components/fx/mark'
import { signIn } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error: err } = await signIn.email({ email, password })

    if (err) {
      setBusy(false)
      // Better Auth returns the unverified case explicitly; everything else
      // stays deliberately vague so this form cannot be used to enumerate users.
      setError(
        err.status === 403
          ? 'That account still needs its email confirmed. Check your inbox.'
          : 'That email and password did not match.',
      )
      return
    }

    /*
     * To the root, which resolves the landing screen from the caller's roles. This form is
     * a client component and cannot know them — naming `/approve` here sent every viewer
     * and member to a screen they cannot open, which is a poor first thing to be told.
     */
    router.push('/')
  }

  return (
    <Card padding={32}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: "600 26px/1.15 var(--fx-font-sans)", margin: 0 }}>Sign in</h1>
          <p style={{ font: "400 15px/1.55 var(--fx-font-sans)", color: 'var(--fx-text-secondary)', margin: 0 }}>
            Your factory, your orders, your floor.
          </p>
        </div>

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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? <MarbimMark state="thinking" size={20} label="Signing in" /> : 'Sign in'}
        </Button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            font: "400 14px/1.5 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
          }}
        >
          {/* First, not last: somebody reading this form twice is here because they cannot
              get in, not because they want to create a second factory. */}
          <Link href="/forgot-password">Forgotten your password?</Link>
          <span>
            New factory? <Link href="/signup">Create an account</Link>
          </span>
        </div>
      </form>
    </Card>
  )
}
