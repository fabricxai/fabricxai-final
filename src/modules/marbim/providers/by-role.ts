/**
 * The real provider: three vendors, one per role (plan 6.4, audit AI-B1).
 *
 * `ModelRole` has been `'extract' | 'reason' | 'embed'` since the seam was written, and the
 * seam's own header says "models by role, never hardcoded provider ids". This is that
 * sentence made real — each role goes to the vendor that can actually do it:
 *
 *  - **extract → Gemini.** The only one of the three returning per-token log-probabilities
 *    with a schema-constrained response, and therefore the only one from which a per-field
 *    confidence can be DERIVED rather than typed (plan 6.3). OCR joins it at 6.6.
 *  - **reason → Anthropic.** The department primers are the product; this is the model that
 *    reads nineteen of them and answers a merchandiser.
 *  - **embed → OpenAI.** `text-embedding-3-*` into the `vector(1536)` column 1.6 searches.
 *
 * ## Each role is constructed only if its key is present
 *
 * A factory that has bought reasoning but not document intake is a real configuration, and
 * it should get a working copilot that refuses extraction — not a boot failure, and not an
 * extraction path that fails per document at 3am. A missing role throws with the env var
 * that would fix it, at the point of use, saying which of the three is not configured.
 *
 * ## `id` is the reason model, and `models` carries the rest
 *
 * `providerId()` captions the assistant panel. A composite id like `gemini+claude+openai`
 * would be accurate and useless there; captioning it `by-role` would be the small lie the
 * seam's own comment warns about ("a panel captioned `marbim-large` over a deterministic
 * answer"). The panel shows an answer, answers come from the reason model, so that is what
 * it is captioned with — and every result already carries the specific `model` that produced
 * it, which is what gets recorded on the job and the draft.
 */
import {
  ProviderError,
  type EmbedRequest,
  type EmbedResult,
  type ExtractRequest,
  type ExtractResult,
  type MarbimProvider,
  type ModelRole,
  type TextRequest,
  type TextResult,
} from '../provider'

import { anthropicReasoner } from './anthropic'
import { geminiExtractor } from './gemini'
import { openAiEmbedder } from './openai'

export interface ByRoleConfig {
  anthropicApiKey?: string | undefined
  geminiApiKey?: string | undefined
  openAiApiKey?: string | undefined
  models: { reason: string; extract: string; embed: string }
}

/** Which env var configures which role, for an error a person can act on. */
const KEY_FOR: Record<ModelRole, string> = {
  reason: 'ANTHROPIC_API_KEY',
  extract: 'GEMINI_API_KEY',
  embed: 'OPENAI_API_KEY',
}

function missing(role: ModelRole): ProviderError {
  return new ProviderError(
    `MARBIM has no ${role} model configured — set ${KEY_FOR[role]}, or this capability stays off`,
    { retryable: false },
  )
}

/**
 * Build the provider from whatever keys are present.
 *
 * Returns null when NONE of the three is configured. That is not an error here: `register.ts`
 * decides what to do about it, and the answer differs between dev (leave MARBIM unregistered,
 * it refuses politely) and production (refuse to boot — see `assertProviderConfigured`).
 */
export function byRoleProvider(config: ByRoleConfig): MarbimProvider | null {
  const extractor = config.geminiApiKey
    ? geminiExtractor({ apiKey: config.geminiApiKey, model: config.models.extract })
    : null
  const reasoner = config.anthropicApiKey
    ? anthropicReasoner({ apiKey: config.anthropicApiKey, model: config.models.reason })
    : null
  const embedder = config.openAiApiKey
    ? openAiEmbedder({ apiKey: config.openAiApiKey, model: config.models.embed })
    : null

  if (!extractor && !reasoner && !embedder) return null

  const models: Partial<Record<ModelRole, string>> = {
    ...(extractor ? { extract: extractor.model } : {}),
    ...(reasoner ? { reason: reasoner.model } : {}),
    ...(embedder ? { embed: embedder.model } : {}),
  }

  return {
    // The model that answers a question, because that is what the panel showing this id is
    // displaying. Null-safe: a copilot with no reasoner still names what it does have.
    id: models.reason ?? models.extract ?? models.embed ?? 'marbim/unconfigured',
    models,

    async extract<T>(request: ExtractRequest<T>): Promise<ExtractResult<T>> {
      if (!extractor) throw missing('extract')
      return extractor.extract(request)
    },

    async generate(request: TextRequest): Promise<TextResult> {
      if (!reasoner) throw missing('reason')
      return reasoner.generate(request)
    },

    async embed(request: EmbedRequest): Promise<EmbedResult> {
      if (!embedder) throw missing('embed')
      return embedder.embed(request)
    },
  }
}

/** Which roles this configuration can actually serve. For the boot assertion and for tests. */
export function configuredRoles(config: ByRoleConfig): ModelRole[] {
  const roles: ModelRole[] = []
  if (config.geminiApiKey) roles.push('extract')
  if (config.anthropicApiKey) roles.push('reason')
  if (config.openAiApiKey) roles.push('embed')
  return roles
}
