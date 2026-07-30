/**
 * MARBIM logic (brief X.2). Pure — no database, no model, no clock.
 *
 * This is the module that lets a model write to an ERP, so most of what follows is a
 * refusal. Three rules carry the weight:
 *
 *  1. **Confidence comes from the extraction, and constants are forbidden.** A confidence
 *     number that is really a constant is worse than none: it makes the approve inbox look
 *     like it ranks drafts by reliability when it ranks them by nothing, and a reviewer who
 *     learns to trust that ranking stops reading the 0.85s.
 *  2. **Tenancy never comes from the client.** Context ids arrive from a browser to scope a
 *     tool call; `companyId` is not one of them, ever.
 *  3. **The prompt is reproducible.** Primers are versioned and the assembled prompt records
 *     which versions went into it, because "why did it say that last Tuesday" needs an
 *     answer that is not a guess.
 */
export class MarbimError extends Error {
  override readonly name = 'MarbimError'
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfidenceCheck {
  payload: Record<string, unknown>
  fieldConfidence: Record<string, number>
  /** How the numbers were produced — `model_logprobs`, `deterministic_parse`, … */
  method: string
  /**
   * Required only when every field carries the same score. A regex or table extractor
   * genuinely produces one confidence for everything it matched; that is legitimate, but it
   * has to be said out loud rather than inferred from a suspicious-looking result.
   */
  uniformConfidenceJustification?: string
}

/**
 * Refuse an extraction whose confidence is not real.
 *
 * The uniform-value check is the one that matters. Real per-field confidence — from
 * logprobs, from a second pass, from anything that actually measures — is essentially never
 * identical across several fields. When it is, the overwhelmingly likely explanation is a
 * constant somebody typed, which is the exact defect brief 1.2 flags on its extractor.
 *
 * Deliberately not a warning. A drafted row carrying fake confidence looks identical to one
 * carrying real confidence, and the whole approve inbox is built on the difference.
 */
export function assertExtractionConfidence(input: ConfidenceCheck): void {
  if (!input.method.trim()) {
    // "Where did this number come from" must be answerable, and the method is how the
    // correction-rate report groups extractions later.
    throw new MarbimError('an extraction must record the method that produced its confidence')
  }

  const payloadFields = Object.keys(input.payload)
  const scoredFields = Object.keys(input.fieldConfidence)

  if (payloadFields.length === 0) {
    throw new MarbimError('an extraction with no fields is not a draft')
  }

  const missing = payloadFields.filter((field) => !(field in input.fieldConfidence))
  if (missing.length > 0) {
    throw new MarbimError(
      `no confidence for ${missing.join(', ')} — a reviewer cannot tell how hard to look at it`,
    )
  }

  const extra = scoredFields.filter((field) => !(field in input.payload))
  if (extra.length > 0) {
    // A score for a field the extractor did not produce inflates the apparent coverage.
    throw new MarbimError(`confidence for ${extra.join(', ')}, which is not in the payload`)
  }

  for (const [field, value] of Object.entries(input.fieldConfidence)) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      throw new MarbimError(`confidence for ${field} must be between 0 and 1, got ${String(value)}`)
    }
  }

  const values = Object.values(input.fieldConfidence)
  const uniform = values.length > 1 && values.every((value) => value === values[0])

  if (uniform && !input.uniformConfidenceJustification?.trim()) {
    throw new MarbimError(
      `every field scored exactly ${values[0]} — that is a constant, not a measurement. ` +
        'Supply uniformConfidenceJustification if the method genuinely produces one value.',
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

export interface PrimerFragment {
  moduleId: string
  version: string
  text: string
}

export interface PromptScope {
  /** The screen MARBIM was opened from. Narrows which primers lead. */
  moduleId?: string
  [key: string]: string | undefined
}

export interface AssembledPrompt {
  text: string
  /** moduleId → primer version. What makes an answer reproducible. */
  primerVersions: Record<string, string>
}

/**
 * The standing rules, which do not depend on which screen MARBIM was opened from.
 *
 * Deliberately short. A system prompt that lists forty rules is one where the model weights
 * each of them a fortieth as much, and these four are the ones that make the difference
 * between an assistant and an incident.
 */
const STANDING_RULES = `You are MARBIM, the assistant inside a Bangladeshi garment factory's ERP.

FOUR RULES THAT DO NOT BEND
1. Never state a number you did not read from a tool result. Not a price, not a quantity,
   not a date. If you do not have it, say you do not have it and name the tool that would.
2. You cannot write to this system. Everything you propose becomes a pending change that a
   human approves. Never tell somebody an action is done; tell them what you have proposed.
3. Never suggest working around a gate. If a shipment is blocked for a missing EXP number or
   a cut is blocked for an unapproved PP sample, say what would clear it and stop. Those
   controls exist because somebody was hurt by their absence.
4. Say which basis a figure uses when there is more than one — margin on price versus cost,
   a grid versus a total, earnable minutes versus clock minutes. Most bad decisions in this
   business come from two people reading the same number differently.

You may answer in Bengali or English, matching whoever is speaking to you.`

/**
 * Build the system prompt from the modules' own primers.
 *
 * Sorted by module id so the same inputs produce a byte-identical prompt in any order — a
 * prompt that varies with map iteration is a prompt nobody can reproduce, which makes every
 * "why did it say that" unanswerable.
 */
export function assembleSystemPrompt(input: {
  primers: readonly PrimerFragment[]
  scope: PromptScope
}): AssembledPrompt {
  const primerVersions: Record<string, string> = {}

  for (const primer of input.primers) {
    if (!primer.version.trim()) {
      throw new MarbimError(`primer for ${primer.moduleId} has no version`)
    }
    primerVersions[primer.moduleId] = primer.version
  }

  const sorted = [...input.primers].sort((a, b) => a.moduleId.localeCompare(b.moduleId))

  // The scoped module's primer leads, because that is the department the person is standing
  // in. The rest follow so a cross-department question still has the craft behind it.
  const lead = sorted.filter((primer) => primer.moduleId === input.scope.moduleId)
  const rest = sorted.filter((primer) => primer.moduleId !== input.scope.moduleId)

  const sections = [...lead, ...rest].map(
    (primer) => `## ${primer.moduleId} (v${primer.version})\n\n${primer.text}`,
  )

  return {
    text: [STANDING_RULES, ...sections].join('\n\n---\n\n'),
    primerVersions,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool scoping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context keys a client may never supply, whatever a tool declares.
 *
 * `companyId` is the whole ballgame: tenancy comes from the session, and a browser that
 * could set it could read another factory's book. The others are the same shape of mistake —
 * identity and authority are server-side facts.
 */
const CLIENT_FORBIDDEN = new Set(['companyId', 'userId', 'roles', 'actorRole'])

/**
 * Fill a tool's scoped arguments from the client's current context.
 *
 * The brief calls for "current module/record ids from client → scoped tool defaults", and
 * this is the narrow door that does it: only keys the TOOL asked for, only plain scalars,
 * and never anything on the forbidden list.
 */
export function scopeToolDefaults(
  context: Record<string, unknown>,
  scopedArgs: readonly string[],
): Record<string, string> {
  const defaults: Record<string, string> = {}

  for (const key of scopedArgs) {
    if (CLIENT_FORBIDDEN.has(key)) continue
    if (!(key in context)) continue

    const value = context[key]
    if (value === null || value === undefined) continue

    if (typeof value !== 'string' && typeof value !== 'number') {
      // A nested object from a client is a payload, not a scope. Refusing keeps the door
      // exactly as narrow as it looks.
      throw new MarbimError(`context value for "${key}" must be a string or a number`)
    }

    defaults[key] = String(value)
  }

  return defaults
}

// ─────────────────────────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Credential shapes. Long, distinctive prefixes only.
 *
 * Deliberately narrow: over-redaction is its own failure. A prompt with the style code
 * scrubbed out cannot answer the question, and a redactor people learn to distrust gets
 * turned off. These patterns match things that are unambiguously secrets and nothing else.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{30,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s]+/g,
]

/**
 * Strip credentials before text reaches a model.
 *
 * Not a general PII scrubber, and it does not pretend to be: a factory's own order numbers,
 * buyer names and style codes are exactly what MARBIM needs to be useful. What this stops is
 * an operator pasting a connection string or an API key into a chat box, which is the
 * realistic accident.
 */
export function redactForPrompt(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]')
  }
  return out
}
