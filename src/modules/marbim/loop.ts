/**
 * The tool execution loop (plan 6.5, audit AI-B3).
 *
 * Until this existed, `chat` handed the model a list of tool names, recorded which ones it
 * asked for, and returned the answer it had written without them. Ninety tools across
 * twenty-one modules were prompt text; `runDraftTool` — the only path from a tool to
 * `pending_changes` — had no caller. 6.2 made the screen say so. This is what makes it stop
 * being true.
 *
 * ## The shape
 *
 *   ask → the model asks for tools → validate + execute each → results back → ask again
 *
 * until the model answers without asking for anything, or the iteration cap stops it.
 *
 * ## Every call is validated HERE, and the tool's own zod is the validator
 *
 * The args come from a model. They are parsed by `ModuleTool.input` before the runner sees
 * them, exactly as a server action parses a browser's body — a model is an untrusted client
 * that happens to be helpful, and the schema handed to the vendor is guidance rather than
 * enforcement.
 *
 * The parse is in this function rather than in the injected runner, and that was a red test's
 * doing: written with the parse in the runner, a test runner that forgot it passed
 * `{wrong: 'shape'}` straight into a tool executor and the suite went green. A safety
 * property that depends on every caller remembering to opt in is not a safety property.
 *
 * A tool the model invented, or one outside the caller's scope, is refused and the refusal
 * goes back INTO the conversation so the model can say it could not look rather than answer
 * as though it had.
 *
 * ## A failed tool is not a failed turn
 *
 * A read that throws comes back as `isError` with its message, and the model carries on. The
 * alternative — failing the whole question because one of four reads timed out — throws away
 * three good results and an answer that would have been worth having with a caveat.
 *
 * ## The cap, and what happens at it
 *
 * Four rounds. At the cap the model is asked once more **with no tools at all**, which forces
 * an answer from what it has. Offering tools on the final turn would invite a request nobody
 * will run, which is the state 6.2 had to write copy for.
 */
import type { AnyCtx, RequestCtx } from '../core/ctx'

import { redactForPrompt } from './marbim'
import type { TextMessage, ToolCall, ToolResult } from './provider'
import type { DraftTool, ModuleTool } from './tools'

/**
 * How many times the model may ask for tools before it must answer.
 *
 * Four is enough for a real chain — find the order, read its breakdown, check the LC, then
 * answer — and small enough that a model stuck in a loop costs four calls rather than a
 * conversation. Every round is a full provider call at the price of the whole transcript so
 * far, so this number is a cost ceiling as much as a correctness one.
 */
export const MAX_TOOL_ITERATIONS = 4

/** Beyond this a tool result is truncated: a 2,000-row read is a bug, not context. */
const MAX_RESULT_CHARS = 8_000

export interface ExecutedCall {
  name: string
  args: Record<string, unknown>
  ok: boolean
  ms: number
  /** Present when a draft tool proposed something. The link from a sentence to a draft. */
  pendingChangeId?: string
  /** Present when it failed — shown to the reviewer, and sent back to the model. */
  error?: string
}

/**
 * How to actually run a tool.
 *
 * Injected so this file can be tested without a database or a provider. It deliberately does
 * NOT own validation — see the header — so a runner is only ever handed args that the tool's
 * own schema has already accepted.
 */
export interface ToolRunner {
  /** Read tools. `args` is already parsed. Returns whatever the tool returns. */
  read: (ctx: AnyCtx, tool: ModuleTool, args: unknown) => Promise<unknown>
  /** Draft tools. The ONLY path to `pending_changes`, and it stays that way. */
  draft: (ctx: RequestCtx, tool: DraftTool, args: unknown, moduleId: string) => Promise<{
    pendingChangeId: string
  }>
}

/**
 * Serialise a tool result for a model to read.
 *
 * Redacted on the way out. A read tool returns rows from this factory's database, and those
 * rows go into a prompt — the same redaction the QUESTION gets, for the same reason, because
 * a credential pasted into a note field is a credential in a row.
 */
function serialise(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  const redacted = redactForPrompt(json)

  if (redacted.length <= MAX_RESULT_CHARS) return redacted

  // Said out loud rather than silently cut. A model reading a truncated list and reporting a
  // total from it would be confidently wrong, and it has no other way to know.
  return `${redacted.slice(0, MAX_RESULT_CHARS)}\n\n[truncated — ${redacted.length} characters, ask for a narrower slice]`
}

export interface RunToolsResult {
  /** For `chat_turns.tool_calls` and the surface's strip. */
  executed: ExecutedCall[]
  /** For the next provider turn. */
  results: ToolResult[]
  /** Drafts proposed this round, for `chat_turns.proposed_change_ids`. */
  pendingChangeIds: string[]
}

/**
 * Execute one round of tool calls.
 *
 * Sequential, not `Promise.all`. Two reasons, and the second is the real one: a draft tool
 * writes to `pending_changes`, and running an unknown number of concurrent writes from a
 * model's suggestion is a way to find out what the connection pool does under load at the
 * worst possible time. The rounds are capped at four and the calls per round are few.
 */
export async function runToolCalls(
  ctx: RequestCtx,
  calls: readonly ToolCall[],
  scope: {
    /** Tools this caller may use, already role-filtered by the action. */
    tools: readonly ModuleTool[]
    /** tool name → the module that registered it, for `runDraftTool`. */
    moduleOf: (name: string) => string | undefined
  },
  runner: ToolRunner,
): Promise<RunToolsResult> {
  const executed: ExecutedCall[] = []
  const results: ToolResult[] = []
  const pendingChangeIds: string[] = []

  for (const call of calls) {
    const startedAt = Date.now()
    const tool = scope.tools.find((candidate) => candidate.name === call.name)

    if (!tool) {
      /*
       * Either a name the model invented, or a real tool this person's roles do not reach
       * (AI-H6). Both are refused identically and both go back into the conversation.
       *
       * Deliberately NOT distinguished in the message. "That tool exists but you may not use
       * it" tells a model — and through it, a user — that a `workforce.payroll_run` tool is
       * there to be asked for, which is a small disclosure of the shape of what they cannot
       * see. "No such tool in this scope" is true either way.
       */
      const error = `no tool named "${call.name}" is available in this scope`
      executed.push({ name: call.name, args: call.args, ok: false, ms: 0, error })
      results.push({ id: call.id, content: error, isError: true })
      continue
    }

    try {
      // Before anything runs, and before the runner is even consulted.
      const args = tool.input.parse(call.args)

      if (tool.kind === 'draft') {
        const moduleId = scope.moduleOf(tool.name)
        if (!moduleId) throw new Error(`no module owns ${tool.name}`)

        // `runDraftTool` parses the args with the tool's zod, checks the proposal's target
        // against the module's whitelist, and calls `propose`. It is the only write path
        // and this is its only caller.
        const { pendingChangeId } = await runner.draft(ctx, tool, args, moduleId)

        pendingChangeIds.push(pendingChangeId)
        executed.push({
          name: call.name,
          args: call.args,
          ok: true,
          ms: Date.now() - startedAt,
          pendingChangeId,
        })
        results.push({
          id: call.id,
          // Said precisely, because the model must not tell somebody the change is made.
          // X.2's system prompt says MARBIM never claims an action is done; this is the
          // sentence that keeps that true when a tool actually ran.
          content: `Drafted. It is waiting in the approve inbox as ${pendingChangeId} and nothing has been written yet — a person has to approve it.`,
        })
        continue
      }

      const value = await runner.read(ctx, tool, args)
      executed.push({ name: call.name, args: call.args, ok: true, ms: Date.now() - startedAt })
      results.push({ id: call.id, content: serialise(value) })
    } catch (error) {
      // Not fatal to the turn. One read that timed out should not throw away three good ones
      // and the answer they would have supported.
      const message = error instanceof Error ? error.message : String(error)
      executed.push({
        name: call.name,
        args: call.args,
        ok: false,
        ms: Date.now() - startedAt,
        error: message,
      })
      results.push({ id: call.id, content: `That failed: ${message}`, isError: true })
    }
  }

  return { executed, results, pendingChangeIds }
}

/**
 * The transcript the model is given, bounded (audit AI-H3).
 *
 * `chat` sent ONE message — the current question — so MARBIM had no memory within a
 * conversation at all: "and for the blue one?" was unanswerable, and the surface's
 * conversation id recorded turns nothing read back.
 *
 * Bounded by CHARACTERS rather than tokens, and knowingly. An exact token count needs the
 * vendor's tokeniser, which is a network call to get right and a second dependency to
 * approximate; the thing being prevented here is unbounded growth — a fiftieth turn carrying
 * forty-nine predecessors and a document's worth of tool results — and ~4 characters per
 * token is close enough for a budget that exists to have a ceiling at all.
 *
 * Newest first, then reversed. Dropping the OLDEST turns is what keeps "and for the blue
 * one?" answerable, which is the entire reason for having history.
 *
 * Tool results are excluded from replayed history on purpose: they were a snapshot of a
 * moving factory, and re-showing yesterday's WIP as though it were current is worse than not
 * having it. The model can ask again, and the answer will be true.
 */
export function budgetedHistory(
  turns: readonly { question: string; answer: string | null }[],
  budgetChars: number,
): TextMessage[] {
  const messages: TextMessage[] = []
  let spent = 0

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]!
    if (!turn.answer) continue // An unanswered turn is a failure, not context.

    // Named for what it is. Called `cost`, it tripped `no-float-money` — correctly, since
    // that rule cannot tell a budget in characters from a budget in taka, and the one time
    // it should stay noisy is around a word that usually does mean money.
    const chars = turn.question.length + turn.answer.length
    if (spent + chars > budgetChars) break

    spent += chars
    // Unshifted in pairs so the transcript stays in order and every question keeps its
    // answer. A question whose answer was dropped would read as one MARBIM ignored.
    messages.unshift(
      { role: 'user', content: turn.question },
      { role: 'assistant', content: turn.answer },
    )
  }

  return messages
}
