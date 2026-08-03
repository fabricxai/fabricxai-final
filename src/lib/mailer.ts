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

/**
 * The "I cannot get in" email.
 *
 * Until this existed there was no self-service recovery at all: `requireEmailVerification`
 * is on, so a factory owner who forgot their password — or whose 24-hour verification link
 * expired — had no path that did not involve somebody with database access. For a pilot
 * that is a support call per user, and for the owner it is a support call to the vendor.
 *
 * Says plainly that an unrequested one can be ignored, because the message somebody did
 * not ask for is the one that worries them.
 */
export async function sendPasswordResetEmail(input: {
  to: string
  name?: string | null
  url: string
}): Promise<void> {
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hi,'

  await send({
    to: input.to,
    subject: 'Reset your FabricXAI password',
    text: `${greeting}\n\nUse this link to set a new password for your FabricXAI account:\n\n${input.url}\n\nThe link expires in one hour and can be used once. If you did not ask to reset your password, ignore this message — nothing has changed and your current password still works.\n`,
    html: `<p>${greeting}</p>
<p>Use this link to set a new password for your FabricXAI account.</p>
<p><a href="${input.url}">Set a new password</a></p>
<p>The link expires in one hour and can be used once.</p>
<p>If you did not ask to reset your password, ignore this message — nothing has changed and your current password still works.</p>`,
  })
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
