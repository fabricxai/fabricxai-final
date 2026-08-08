# How document extraction works in FabricXAI

Read this before testing intake — the reading rules decide how you test:

> **A PDF or photo (JPEG/PNG/WebP) attached to intake is read by the extract model
> directly** — its own reader sees the pages, scans included, and per-field confidence
> measures the whole journey from pixels to value. **Pasted text, when present, is what
> gets read instead** (a human transcription is deliberate). Types the model cannot read —
> spreadsheets, Word files, HEIC — still need their text pasted, and
> `GETTING-TEXT-OUT.md` covers getting it out faithfully. Every kit PDF ships with a
> `.paste.txt` companion so BOTH paths can be tested against the same ground truth.

## The pipeline

```
/marbim/intake screen
  → choose intake kind  → pickers for context (e.g. which buyer, which audit)
  → paste the text, OR attach a PDF/JPEG/PNG/WebP and paste nothing
  → "Ask MARBIM to read it"  → job queued (worker processes it — keep pnpm worker:dev running)
  → gpt-4o-mini reads the text — or the file itself — into the module's zod schema,
    with token log-probabilities
  → per-field confidence = geometric mean of the tokens that produced each value
  → draft lands in the APPROVE INBOX as a pending change
  → a human reviews field-by-field (can correct values inline), approves or rejects
  → approval writes the real row through the module's own validation
```

The two paths measure different things, and both are worth testing per document:
text-path confidence scores the model's read of *your transcription*; file-path
confidence scores its read of *the pages themselves* — on the kit's scan the blur is
visible in the numbers (a field at 0.998 instead of 1.0). A perfectly clean digital PDF
can come out uniformly certain; the draft then carries the provider's justification for
the uniform map instead of being refused as an invented constant.

## The six intake kinds and this kit's document for each

| Kind (dropdown) | Target | Kit document | Context picker |
|---|---|---|---|
| Buyer PO | orders | `documents/buyer-po/` | Buyer (pick H&M) |
| UD scan | commercial → UDs | `documents/ud-scan/` | — |
| Tech pack | costing → BOM | `documents/tech-pack/` | — |
| Wage gazette | workforce | `documents/wage-gazette/` | — |
| Audit report | compliance → findings | `documents/audit-report/` | Audit (pick BSCI 2026-07-21) |
| Measurement chart | quality → specs | `documents/measurement-chart/` | — |

Each folder: the realistic file, the `.paste.txt` to paste, and `expected.json` — the
ground truth. **The test is a field-by-field diff between the approve-inbox draft and
`expected.json`.** Keys starting with `_` in expected.json are notes, not payload fields.

## What to check on every extraction

1. **Values** match `expected.json` exactly — quantities, decimal strings (`5.60`, not
   `5.6`), dates as `YYYY-MM-DD`, item refs verbatim.
2. **Confidence is per-field and plausible** — clean labelled values score high (typically
   >0.9); the inbox paints anything below 0.90 orange. A uniform score across every field
   would have been refused server-side before the draft existed.
3. **Context fields** (buyer, audit) show confidence 1.00 — they came from your picker,
   not from reading.
4. **Nothing auto-approved.** The seeded auto-approve rule needs min-confidence ≥ 0.950
   AND is scoped to module `core`, so these drafts always wait for a human.
5. **Approving writes the real thing** — a new order PO-88410, UD-131 in the UD workbench,
   BOM lines in costing, gazette SRO-2026-07 (inactive until activated), findings on the
   audit, measurement points on SH-4471.

## Negative tests worth running

- **Flattened table**: paste the POM chart as ONE line (join all rows with spaces) instead
  of the laid-out `.paste.txt`. This reproduces a real historical failure mode: columns
  pair with the wrong size, at high confidence. The approve inbox is where a human catches
  it — which is the point of the inbox.
- **Role refusal**: sign in as `viewer@` or `member@` — the intake door must be refused.
- **Tampered ground truth**: change one quantity in the pasted text, extract, and confirm
  the draft shows the changed value (the extractor transcribes; it does not "correct").
  Then reject the draft with a reason and confirm the rejection is recorded.
- **Rate limit**: extraction is rate-limited per company per hour (policy
  `extractionsPerHour`); a burst of submissions should eventually queue-refuse politely.

## File upload rules

- Uploadable: PDF, JPEG, PNG, WebP, HEIC, CSV, XLS(X), DOC(X) · max **25 MB**.
- **Model-readable on their own**: PDF, JPEG, PNG, WebP — attach one of these and the
  paste box may stay empty. Everything else uploads as provenance only and needs pasted
  text; submitting a file-only spreadsheet is refused at the door, not queued to fail.
- `.txt` / `.md` / `.eml` are offered by the file picker and **refused by the server** —
  their mime types are not on the allow-list. Known sharp edge; paste their content
  instead. Choosing a `.txt`/`.csv`/`.md`/`.eml`/`.json` file DOES auto-fill the paste box
  before the upload is attempted, which is why the picker offers them.
- The CSV POM chart (`SH-4471-pom-chart.csv`) is the one kit file that is both a valid
  upload AND auto-fills the textarea.
