/**
 * Anthropic — the `reason` role (plan 6.4, audit AI-B1).
 *
 * This is the model that answers a merchandiser's question with the department primers in
 * front of it. The primers are the product: nineteen modules' worth of craft about UD
 * balances, LC latest-shipment conflicts, gazette wage grades and what DHU means on a line —
 * and the value of the copilot is almost entirely how well the model uses them, which is why
 * reasoning is the role that gets the strongest model rather than the cheapest.
 *
 * ## Tools are advertised, not executed
 *
 * `TextRequest.tools` carries names and descriptions. The Messages API needs an
 * `input_schema` per tool, and there isn't one here — the tool contract's zod lives in
 * `ModuleTool.input` and is not threaded through the provider seam. Until 6.5 lands the
 * execution loop, nothing runs what the model asks for, so a permissive schema is honest:
 * the model can express which tool it wants, `chat` records that, and the surface says
 * plainly that it was asked for and not run (plan 6.2).
 *
 * When 6.5 lands, the real schemas come through with the executor and this gets replaced by
 * the round trip. Passing a fabricated per-tool schema now would be the same class of
 * mistake 6.2 and 6.3 just finished removing.
 */
import Anthropic from '@anthropic-ai/sdk'

import { ProviderError, type TextRequest, type TextResult } from '../provider'

/**
 * Long enough for a full department answer with a table in it, short enough that a runaway
 * generation is a cost line rather than an incident. 6.5 adds the real ceilings (AI-H4).
 */
const MAX_TOKENS = 4_096

function classify(error: unknown): ProviderError {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number })?.status
  const retryable =
    status === 429 ||
    status === 408 ||
    status === 529 ||
    (typeof status === 'number' && status >= 500) ||
    /timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)

  return new ProviderError(`anthropic: ${message}`, { retryable })
}

export interface AnthropicOptions {
  apiKey: string
  model: string
}

export function anthropicReasoner({ apiKey, model }: AnthropicOptions) {
  const client = new Anthropic({ apiKey })

  return {
    model,

    async generate(request: TextRequest): Promise<TextResult> {
      if (request.messages.length === 0) {
        throw new ProviderError('nothing to answer', { retryable: false })
      }

      let response
      try {
        response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...(request.tools && request.tools.length > 0
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  // Permissive by necessity, and it costs nothing today: nothing executes
                  // what comes back. See the header.
                  input_schema: { type: 'object' as const, additionalProperties: true },
                })),
              }
            : {}),
        })
      } catch (error) {
        throw classify(error)
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()

      const toolCalls = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          name: block.name,
          args: (block.input ?? {}) as Record<string, unknown>,
        }))

      if (!text && toolCalls.length === 0) {
        // An empty turn with nothing asked for is a failure the surface cannot render, and
        // showing a blank answer bubble reads as "MARBIM has nothing to say about your
        // order book" rather than as the fault it is.
        throw new ProviderError(`anthropic returned an empty turn (${response.stop_reason})`, {
          retryable: true,
        })
      }

      return { text, toolCalls, model: response.model }
    },
  }
}
