/**
 * OpenAI — the `embed` role (plan 6.4, audit AI-B1).
 *
 * 1.6 Order Memory fingerprints a style so a merchandiser quoting a new enquiry can be shown
 * what the factory actually achieved on the three most similar styles it has made. That is a
 * vector search over a `vector(1536)` column, and it is the one role with a hard numeric
 * contract: the width that comes back must be the width the column is.
 *
 * ## The width is checked here as well as by the caller
 *
 * `EmbedRequest.dimensions` exists because a model that quietly returns 768 dims for a
 * vector(1536) column fails per row inside a background job nobody is watching. The seam's
 * comment puts that check on the caller; it is also done here, because the two failures read
 * completely differently — from here it says "the model is configured wrong", from the
 * caller it says "this style could not be fingerprinted", and the first is the one an
 * operator can act on.
 *
 * `text-embedding-3-*` supports a `dimensions` parameter, so the width is requested rather
 * than hoped for. A model that ignores it still gets caught.
 */
import OpenAI from 'openai'

import { ProviderError, type EmbedRequest, type EmbedResult } from '../provider'

function classify(error: unknown): ProviderError {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number })?.status
  const retryable =
    status === 429 ||
    status === 408 ||
    (typeof status === 'number' && status >= 500) ||
    /timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)

  return new ProviderError(`openai: ${message}`, { retryable })
}

export interface OpenAiOptions {
  apiKey: string
  model: string
}

export function openAiEmbedder({ apiKey, model }: OpenAiOptions) {
  const client = new OpenAI({ apiKey })

  return {
    model,

    async embed(request: EmbedRequest): Promise<EmbedResult> {
      if (request.inputs.length === 0) {
        throw new ProviderError('nothing to embed', { retryable: false })
      }
      if (request.dimensions <= 0) {
        throw new ProviderError(`cannot embed into ${request.dimensions} dimensions`, {
          retryable: false,
        })
      }
      if (request.inputs.some((input) => !input.trim())) {
        // An empty string embeds to a vector that is near every other empty string, so a
        // blank style would come back as the closest match to every future blank one.
        throw new ProviderError('cannot embed an empty input', { retryable: false })
      }

      let response
      try {
        response = await client.embeddings.create({
          model,
          input: [...request.inputs],
          dimensions: request.dimensions,
        })
      } catch (error) {
        throw classify(error)
      }

      // Sorted by index rather than trusted in order. The seam's contract is "the result
      // vectors come back in the same order", and every caller zips them against its own
      // list of styles — a silent reordering would attach each fingerprint to the wrong
      // garment, which no test downstream could tell from a bad embedding.
      const vectors = [...response.data]
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding)

      if (vectors.length !== request.inputs.length) {
        throw new ProviderError(
          `openai returned ${vectors.length} vectors for ${request.inputs.length} inputs`,
          { retryable: true },
        )
      }

      const wrong = vectors.find((vector) => vector.length !== request.dimensions)
      if (wrong) {
        throw new ProviderError(
          `openai ${model} returned ${wrong.length}-dimension vectors, and the column is ` +
            `${request.dimensions} — the embedding model is misconfigured`,
          { retryable: false },
        )
      }

      return { vectors, model: response.model }
    },
  }
}
