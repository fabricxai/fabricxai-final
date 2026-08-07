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
import { openAiEmbedder, openAiExtractor } from './openai'

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

/**
 * Which vendor reads documents — decided by the model id, not by a fourth env var.
 *
 * `extract` was Gemini's alone because it was the only vendor returning per-token
 * log-probabilities with a schema-constrained response. Both halves of that changed: OpenAI
 * does return them, and no Gemini model on AI Studio currently does. Rather than pick a
 * winner in code, the role follows `MARBIM_MODEL_EXTRACT` — the variable that already names
 * the model, and therefore already names its vendor.
 *
 *   MARBIM_MODEL_EXTRACT=gemini-…   →  Gemini, needs GEMINI_API_KEY   (the default, unchanged)
 *   MARBIM_MODEL_EXTRACT=gpt-… / o…  →  OpenAI, needs OPENAI_API_KEY
 *
 * Nothing about the confidence contract moves with it. Both extractors derive per-field
 * scores through `field-confidence.ts`, and both refuse outright when the tokens are absent.
 * Switching vendor changes who reads the document, not whether the number is real.
 */
const OPENAI_MODEL_RE = /^(gpt-|o\d)/i

/**
 * Who would read documents under this configuration, and with which key.
 *
 * Resolved without constructing anything, so `configuredRoles` — which answers "what can this
 * deployment do" for a status surface — and the provider itself cannot disagree about whether
 * extraction is available. Two places deciding that separately is how a screen offers a
 * button the seam then refuses.
 */
function extractVendor(config: ByRoleConfig): {
  vendor: 'openai' | 'gemini'
  keyName: string
  apiKey: string | undefined
} {
  if (OPENAI_MODEL_RE.test(config.models.extract)) {
    // Named so a misconfiguration reports the variable actually missing, rather than sending
    // somebody to add a Gemini key for an OpenAI model.
    return { vendor: 'openai', keyName: 'OPENAI_API_KEY', apiKey: config.openAiApiKey }
  }
  return { vendor: 'gemini', keyName: KEY_FOR.extract, apiKey: config.geminiApiKey }
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
  const extract = extractVendor(config)
  const model = config.models.extract
  const extractor = !extract.apiKey
    ? null
    : extract.vendor === 'openai'
      ? openAiExtractor({ apiKey: extract.apiKey, model })
      : geminiExtractor({ apiKey: extract.apiKey, model })

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
      if (!extractor) {
        throw new ProviderError(
          `MARBIM has no extract model configured — MARBIM_MODEL_EXTRACT is "${model}", ` +
            `so set ${extract.keyName}, or this capability stays off`,
          { retryable: false },
        )
      }
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
  // Not `if (geminiApiKey)`: which key enables extraction depends on the model, so this asks
  // the same resolver the provider does rather than assuming the vendor.
  if (extractVendor(config).apiKey) roles.push('extract')
  if (config.anthropicApiKey) roles.push('reason')
  if (config.openAiApiKey) roles.push('embed')
  return roles
}
