/**
 * Transactional email.
 *
 * Dev goes to Mailpit over SMTP (nothing leaves the machine, and the message is
 * inspectable at http://localhost:8025 and via its REST API, which is how the Phase 0
 * gate-A test reads the verification link without a browser).
 *
 * Production uses a transactional provider — never self-hosted SMTP (dev-plan §1).
 * Resend is wired here; the `send` seam is deliberately narrow so swapping to SES is a
 * one-function change.
 */
import nodemailer, { type Transporter } from 'nodemailer'

import { env, isProduction } from './env'

interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

let transport: Transporter | undefined

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST ?? 'localhost',
    port: env.SMTP_PORT ?? 1025,
    // Mailpit speaks plaintext SMTP on 1025 and accepts any credentials.
    secure: false,
    ignoreTLS: true,
  })
  return transport
}

async function send(mail: Mail): Promise<void> {
  if (isProduction && env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    })

    if (!response.ok) {
      // Surface the provider's reason — a silent send failure means a user who can never
      // verify their account and no trace of why.
      throw new Error(`resend failed (${response.status}): ${await response.text()}`)
    }
    return
  }

  await getTransport().sendMail({ from: env.EMAIL_FROM, ...mail })
}

/**
 * Send an already-rendered notification.
 *
 * Deliberately dumb: subject and body arrive resolved and localised from
 * `modules/core/delivery`, because deciding what a message says is that module's job and
 * knowing how to reach an SMTP server is this one's. It is passed in as the `send` seam, so
 * the delivery logic is testable without a mail server.
 */
export async function sendNotificationEmail(input: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<void> {
  await send(input)
}

export async function sendVerificationEmail(input: {
  to: string
  name?: string | null
  url: string
}): Promise<void> {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hi,'

  await send({
    to: input.to,
    subject: 'Confirm your FabricXAI account',
    text: `${greeting}\n\nConfirm your email address to finish setting up your FabricXAI account:\n\n${input.url}\n\nThis link expires in 24 hours. If you did not create an account, ignore this message.\n`,
    html: `<p>${greeting}</p>
<p>Confirm your email address to finish setting up your FabricXAI account.</p>
<p><a href="${input.url}">Confirm my email</a></p>
<p>This link expires in 24 hours. If you did not create an account, ignore this message.</p>`,
  })
}
