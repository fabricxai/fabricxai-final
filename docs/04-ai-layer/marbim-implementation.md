# MARBIM — AI Layer Implementation
### The complete spec for FabricXAI's intelligence layer

MARBIM is not a chatbot bolted onto an ERP. It is three pipelines (extraction, copilot, insight) sharing one trust contract: **every write is a draft; every draft is auditable; every confidence is measured.**

---

## 1. Components

```
modules/marbim/
  registry.ts        model registry: task-type → provider/model/params (PLAYBOOK §6a table)
  extraction/        classify → extract → escalate → draft pipeline (worker jobs)
  agent/             streaming chat route glue, context injection, tool composition
  prompts/           versioned prompt files (one per extractor/task, semver'd)
  telemetry.ts       call logs, correction capture, cost accounting
  evals/             golden-document test sets per extractor
Each business module contributes, via register.ts: tools.ts (read + draft tools)
AND a domainPrimer — a versioned prompt fragment (prompts/primer-<module>@semver.md)
holding that department's craft knowledge. Specialization is registered data,
not a separate agent.
```

## 2. Extraction pipeline (the volume workhorse)

1. **Ingest** — any drop zone → document stored (MinIO) → `extract` job with context (module hint if dropped inside one, else none).
2. **Classify** — small/fast model: document type + target module (skipped when context gives it). Cost: negligible; saves running the wrong big extractor.
3. **Extract** — task-specific structured extraction (Gemini default): prompt from `prompts/` + the module's Zod-derived JSON schema. **Per-field confidence** comes from the extraction method (log-prob/self-consistency per field), never a constant.
4. **Escalate once** — fields below threshold re-asked to the higher tier with the source region; merged result keeps the better confidence.
5. **Draft** — `pending_changes` insert (validated by the module's Zod) with `field_confidence` and `source_ref` (document id + page/region coords for click-to-source).
6. **Notify** — the relevant person's inbox badge; failures are retryable job states with honest UI copy.

**Multi-part documents** (tech packs): one ingest fans out to N drafts (style record, BOM, measurement spec, requirement flags) — each its own pending item so approval is granular.

## 3. Copilot (the interactive path)

- Streaming route in the app; model per registry (Sonnet default, Opus-tier tasks flagged by tool).
- **Prompt composition (how the agent becomes a specialist):** system prompt = base MARBIM prompt + the active module's registered domainPrimer + injected screen context. A primer is 200–500 tokens of the department's craft: vocabulary used correctly (SMV, DHU, BTB headroom), the reasoning norms of that role (capacity answers always state assumptions; LC answers always cite clause and date), and the questions that role actually asks. One agent, composable expertise — the "planning specialist" is planning's primer + planning's tools + planning's context, never a second agent.
- **The expertise split, stated plainly:** domain COMPUTATION lives in each module's service functions (capacityQuery, previewRipple, AQL lookup, wage compute) — deterministic, tested, auditable. The primer teaches the agent when to reach for which computation and how to narrate results like a practitioner. An answer the service layer can compute is never left to model reasoning.
- **Context injection:** current module + record ids from client → default tool arguments; the user's `ctx` scopes every tool execution, so RLS bounds all reads.
- **Tool packs:** composed per role + module. Read tools return typed rows; draft tools return a pending_changes payload — the type system makes a direct write inexpressible. Analytics context gets read-only packs, period.
- Answer cards (similar orders, capacity answers, report tables) are structured tool outputs the frontend renders — not markdown blobs — so they're consistent, linkable, and WhatsApp-screenshot-able.
- Bengali I/O: passthrough (models handle bn natively); UI strings around answers via i18n.

## 4. Prompts as versioned artifacts

Every prompt AND every domainPrimer lives in `prompts/<name>@<semver>.md` with: role, schema reference, few-shot examples drawn from REAL approved documents (anonymized), and its eval set reference. Changing a prompt = version bump + eval run in CI. The registry pins task→prompt-version; rollback is a pin change.

## 5. Telemetry, evals, and the honesty loop

- **Call log:** (task, model, prompt-version, tokens in/out, latency, cost, company) — the dataset for §6 cost control and re-routing decisions.
- **Correction capture:** at approve time, field-level diffs between draft and committed values → correction rate per (extractor, field, prompt-version). This is the ground truth behind every confidence bar shown to users.
- **Evals:** `evals/<task>/` holds golden documents (the pilot factory's real POs, LCs, challans — anonymized) with expected extractions; CI runs them on prompt changes; regression blocks merge.
- **The trust footer** ("drafted 214, you approved 196, corrected 31 fields") is a query over this telemetry — it exists because the numbers are real.

## 6. Cost & rate control

Per-company budgets (Settings): extraction jobs/hour, chat requests/min, monthly token ceiling with soft-warning at 80%. Queue-level limits enforce them (BullMQ rate limiters). Cost accounting per company from the call log feeds your own unit economics — you cannot price the product without it. Escalation policy is the single biggest cost lever: measure how often escalation actually changes the committed value before widening it.

## 7. Failure & degradation contract

Provider down → jobs retry/backoff, chat returns an honest typed error; UI never fakes an answer. Partial extraction → draft ships with missing fields explicitly empty + low confidence, never guessed. Rate-limited → queued state visible ("3 documents ahead of yours"). All degradation states have designed UI copy (see X.2 frontend prompt) — no raw errors reach a factory user.

## 8. Order Memory intelligence (1.6 integration)

Embeddings job on style create; HNSW similarity per company; the `find_similar_orders` tool joins fingerprints→outcomes so answers cite actuals ("262 g/pc real vs 255 quoted"), not vibes. Outcome compiler is deterministic aggregation + one optional model call to summarize delay narratives — the numbers are never model-generated.

## 9. Build order

Phase 2: registry, agent route port, tool-pack registration, extraction pipeline v1 (RFQ extractor migrated onto it, killing the 0.85 constant), telemetry tables.
Phase 3+: one extractor per module as it lands (PO, challan, LC SWIFT, comment sheet, audit report, bank advice, measurement sheet, nameplate, proforma), each with its eval set BEFORE first production use.
Phase 5: escalation policy + correction-rate dashboards. Phase 9: cost dashboards + budget enforcement.

## 10. Definition of done — AI layer

Every module with a tool pack also registers a domainPrimer with its own eval questions (golden Q&A against seed data, e.g. "free capacity in September in basic tees?") · every extractor has an eval set with ≥15 golden docs and a CI gate · no constant confidences anywhere (lint rule) · correction telemetry flowing and visible in the trust footer · per-company budgets enforceable · all failure states have designed copy · a pilot factory's real document set passes end-to-end.
