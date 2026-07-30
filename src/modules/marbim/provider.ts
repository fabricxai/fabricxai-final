/**
 * The model seam.
 *
 * MARBIM never imports a vendor SDK. It declares the two shapes it needs — structured
 * extraction and a text turn — and something registers an implementation. Three reasons,
 * in order of how much they matter:
 *
 *  1. **Every test in this module runs offline and deterministically.** A test suite that
 *     needs a network and a key is a test suite that gets skipped, and the logic being
 *     guarded here is the logic that decides whether a model may write to an ERP.
 *  2. `MARBIM_MOCK` becomes real. It was validated at boot and did nothing (docs/STUBS.md);
 *     now it selects the deterministic provider.
 *  3. Swapping Anthropic for anything else is a file, not a refactor. Models by role, never
 *     hardcoded provider ids.
 *
 * **No provider is registered by default, and the default is not "pretend".** An unconfigured
 * MARBIM refuses rather than silently returning plausible-looking output — the same reason
 * 5.1's PP gate fails closed.
 */
import type { ZodType } from 'zod'

export class ProviderError extends Error {
  override readonly name = 'ProviderError'
  /** False for a bad input, true for a timeout or a rate limit. Drives retry vs reject. */
  readonly retryable: boolean

  constructor(message: string, options: { retryable: boolean }) {
    super(message)
    this.retryable = options.retryable
  }
}

/** What a model is asked for, by ROLE rather than by name. */
export type ModelRole = 'extract' | 'reason' | 'embed'

export interface ExtractRequest<T> {
  role: ModelRole
  schema: ZodType<T>
  /** The document text or message being read. Already redacted. */
  input: string
  /** What the extractor is for — becomes part of the prompt. */
  instruction: string
}

export interface ExtractResult<T> {
  value: T
  /**
   * Per FIELD, from the model. Not optional and not a constant — `assertExtractionConfidence`
   * refuses both, which is the point of the whole seam.
   */
  fieldConfidence: Record<string, number>
  /** How these numbers were produced. Recorded on the job and grouped by in the report. */
  method: string
  uniformConfidenceJustification?: string
  model: string
}

export interface TextRequest {
  role: ModelRole
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** Tool descriptions the model may choose from. */
  tools?: { name: string; description: string }[]
}

export interface TextResult {
  text: string
  /** Tools the model asked to run, in order. */
  toolCalls: { name: string; args: Record<string, unknown> }[]
  model: string
}

export interface MarbimProvider {
  readonly id: string
  extract<T>(request: ExtractRequest<T>): Promise<ExtractResult<T>>
  generate(request: TextRequest): Promise<TextResult>
}

let provider: MarbimProvider | null = null

export function registerProvider(next: MarbimProvider): void {
  provider = next
}

/** Test-only: the provider is module-global, so suites must be able to reset it. */
export function resetProvider(): void {
  provider = null
}

/**
 * The provider in force.
 *
 * Throws when none is registered rather than falling back to a mock. A system that quietly
 * answers with invented data when its model is unconfigured is worse than one that says it
 * cannot answer — the first is discovered by somebody acting on a fabricated number.
 */
export function getProvider(): MarbimProvider {
  if (!provider) {
    throw new ProviderError(
      'no MARBIM provider is registered — set MARBIM_MOCK for the deterministic one, or register a real model provider',
      { retryable: false },
    )
  }
  return provider
}

export const hasProvider = (): boolean => provider !== null
