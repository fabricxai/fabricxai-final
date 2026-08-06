/**
 * Anthropic — the `reason` role (plan 6.4, audit AI-B1).
 *
 * This is the model that answers a merchandiser's question with the department primers in
 * front of it. The primers are the product: nineteen modules' worth of craft about UD
 * balances, LC latest-shipment conflicts, gazette wage grades and what DHU means on a line —
 * and the value of the copilot is almost entirely how well the model uses them, which is why
 * reasoning is the role that gets the strongest model rather than the cheapest.
 *
 * ## The tool round trip
 *
 * Since 6.5 this carries the real per-tool JSON schema (from the tool's own zod) and replays
 * the conversation properly: an assistant turn that asked for three tools goes back with its
 * OWN `tool_use` blocks, and the answers follow as `tool_result` blocks referencing them by
 * id. Anything else is rewriting the conversation underneath the model, and the API rejects
 * it — correctly.
 *
 * A tool with no schema still gets a permissive object rather than being dropped. Dropping
 * it would silently shrink what the model can ask for; the loop validates every call against
 * the tool's zod before executing it regardless, so the schema here is guidance to the model,
 * never the enforcement.
 */
import Anthropic from '@anthropic-ai/sdk'

import { ProviderError, type TextMessage, type TextRequest, type TextResult } from '../provider'

/**
 * One of our messages as the Messages API wants it.
 *
 * A turn carrying tool calls or tool results becomes a CONTENT ARRAY; a plain turn stays a
 * string. Both are valid, and keeping the simple case simple means the overwhelming majority
 * of turns — a question and an answer — read as what they are on the wire.
 */
function toAnthropicMessage(message: TextMessage): Anthropic.MessageParam {
  const blocks: Anthropic.ContentBlockParam[] = []

  // Results first. Anthropic requires every `tool_result` at the START of the user turn that
  // follows the `tool_use`, before any other content.
  for (const result of message.toolResults ?? []) {
    blocks.push({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.content,
      ...(result.isError ? { is_error: true } : {}),
    })
  }

  if (message.content) blocks.push({ type: 'text', text: message.content })

  for (const call of message.toolCalls ?? []) {
    blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args })
  }

  if (blocks.length === 0) {
    // An empty turn is rejected by the API. This is only reachable from a bug in the loop,
    // and a placeholder is a kinder failure than a 400 with no context.
    blocks.push({ type: 'text', text: '(no content)' })
  }

  return { role: message.role, content: blocks }
}

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
          messages: request.messages.map(toAnthropicMessage),
          ...(request.tools && request.tools.length > 0
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: (tool.schema as Anthropic.Tool['input_schema']) ?? {
                    type: 'object' as const,
                    additionalProperties: true,
                  },
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
          id: block.id,
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

      return {
        text,
        toolCalls,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        ...(response.stop_reason ? { stopReason: response.stop_reason } : {}),
      }
    },
  }
}
