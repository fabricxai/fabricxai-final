/**
 * Module registration for X.2.
 *
 * `pendingTargets` is empty. MARBIM has no tables a model may draft into — it is the thing
 * that CREATES drafts for other modules, and a MARBIM that could propose changes to its own
 * extraction records would be a model editing the evidence of what it did.
 *
 * The provider is selected here (plan 6.4). `MARBIM_MOCK` picks the deterministic one;
 * otherwise the real by-role provider is built from whichever vendor keys are present —
 * Gemini reads documents, Anthropic answers questions, OpenAI embeds styles. With neither the
 * flag nor a key, nothing is registered and MARBIM refuses rather than inventing output, the
 * same shape as 5.1's PP gate failing closed.
 *
 * ## Why the mock wins when both are set
 *
 * `MARBIM_MOCK` is a deliberate instruction to not call anybody's paid API, and it is banned
 * in production by `env.ts`. Somebody who sets it while their keys happen to be in `.env`
 * means the mock; charging them for a demo would be the surprising reading.
 *
 * ## The boot assertion
 *
 * In production with the copilot enabled, a missing provider is not a degraded state to
 * discover at 3am — it is a deployment that should not have started. `env.ts` already refuses
 * a build with no reasoning key; this is the second wall, after registration, and it catches
 * the case that check cannot see: a key that is present but produced no usable provider.
 */
import { env } from '@/lib/env'

import { registerModule } from '../core/registry'

import { marbimToolPack } from './tool-pack'

import { mockProvider } from './mock-provider'
import { byRoleProvider } from './providers/by-role'
import { hasProvider, registerProvider } from './provider'
import { MARBIM_ZOD_MAP } from './zod'

export const marbimModule = registerModule({
  id: 'marbim',

  pendingTargets: [],

  /** Its own record — chiefly the correction rate, the honest basis for trusting it more. */
  toolPack: marbimToolPack,
  zodMap: MARBIM_ZOD_MAP,

  approvalDefaults: { requiredRoles: ['owner', 'admin'] },

  domainPrimer: {
    version: 'X.2.0',
    text: `You are MARBIM's own platform module. You are asked about extractions, drafts and
how confident the system is in what it read.

CONFIDENCE MEANS SOMETHING HERE
Every drafted field carries a score that came from the extraction that produced it. When
somebody asks how reliable a draft is, quote the WEAKEST field, not an average — an average
hides the one field the extractor was unsure about, which is the field a reviewer needs to
look at.

Never present a confidence number as though it were an accuracy. It is how sure the
extractor was, which is a different thing from how often it turns out right. The correction
rate per extractor version is the second number, and it is the honest one.

WHAT YOU CANNOT DO
You cannot approve a draft, and you cannot raise your own confidence. If somebody wants a
draft through, the answer is who can approve it — never a way around the queue.`,
  },
})

// The flag was validated at boot and did nothing. Now it selects a provider.
if (env.MARBIM_MOCK) {
  registerProvider(mockProvider)
} else {
  const real = byRoleProvider({
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    openAiApiKey: env.OPENAI_API_KEY,
    models: {
      reason: env.MARBIM_MODEL_REASON,
      extract: env.MARBIM_MODEL_EXTRACT,
      embed: env.MARBIM_MODEL_EMBED,
    },
  })

  // Null when no vendor key is set at all — a dev machine, or a factory that has not bought
  // the copilot. Registering nothing is the honest outcome: `hasProvider()` is false, the
  // three screens refuse, and the poller records a skip rather than a success (plan 6.1).
  if (real) registerProvider(real)
}

if (env.NODE_ENV === 'production' && env.MARBIM_ENABLED && !hasProvider()) {
  /*
   * Refuse to start rather than serve a broken copilot.
   *
   * Throwing at module load is what makes this an exit: this file is imported by the module
   * registry, which every request path and the worker both load at boot. A deployment in this
   * state has the assistant button on every screen and nothing behind it.
   *
   * Reachable only through a mistake `env.ts` cannot catch — a key present but empty after
   * trimming, or a future role wired without its constructor — which is exactly why it is
   * worth having as a second wall.
   */
  throw new Error(
    'MARBIM_ENABLED is on in production but no model provider could be built from the ' +
      'configured keys. Check ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY, or unset ' +
      'MARBIM_ENABLED to ship without the copilot.',
  )
}
