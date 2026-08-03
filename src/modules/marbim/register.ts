/**
 * Module registration for X.2.
 *
 * `pendingTargets` is empty. MARBIM has no tables a model may draft into — it is the thing
 * that CREATES drafts for other modules, and a MARBIM that could propose changes to its own
 * extraction records would be a model editing the evidence of what it did.
 *
 * The provider is selected here: `MARBIM_MOCK` picks the deterministic one, which is what
 * makes the flag mean something. With neither the flag nor a registered provider, MARBIM
 * refuses rather than inventing output — the same shape as 5.1's PP gate failing closed.
 */
import { env } from '@/lib/env'

import { registerModule } from '../core/registry'

import { marbimToolPack } from './tool-pack'

import { mockProvider } from './mock-provider'
import { registerProvider } from './provider'
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
}
