# FabricXAI Fashion — department test kit

One factory (**FabricXAI Fashion**), one order (**PO-88203 · H&M · style SH-4471 ·
24,000 pcs men's shirt**), and everything needed to test every department's screens and
actions as the role that actually works them — including document intake with known
ground truth.

## What's in the box

| Path | What it is |
|---|---|
| `01-order-story.md` | PO-88203 end to end — the golden thread every department guide hangs off |
| `departments/*.md` | One test guide per department: login, data present, steps, gates that must refuse |
| `documents/` | Test documents: each with a realistic **PDF** (or image/CSV), a **`.paste.txt`** (the text MARBIM reads), and **`expected.json`** (ground truth to check the extraction against) |
| `extraction/HOW-EXTRACTION-WORKS.md` | What the intake pipeline actually does — and does NOT do (no built-in OCR) |
| `extraction/GETTING-TEXT-OUT.md` | Getting the true text out of PDF / scan / spreadsheet inputs: `pdftotext`, `tesseract`, and friends |

## Environment

- App: `http://localhost:3000` (`pnpm dev`), stack via `docker compose -f docker-compose.dev.yml up -d`
- Mailpit (verification/reset mails): `http://localhost:8025`
- Tenant: **FabricXAI Fashion** · company id `fabf0000-0000-4000-8000-000000000001`
- Refill/rebuild commands: `docs/runbooks/fabricxai-fashion.md` in the repo
- MARBIM must be on: `MARBIM_ENABLED=true`, `MARBIM_MOCK=false`, `ANTHROPIC_API_KEY` +
  `OPENAI_API_KEY`, `MARBIM_MODEL_EXTRACT=gpt-4o-mini` in `.env`
- Extractions run in the worker: keep **`pnpm worker:dev`** running or intake jobs stay queued

## Sign in — one login per role

`<role>@fabricxai-fashion.test` · password **`FabricXai-seed-2026`** (all accounts)

| Department guide | Login |
|---|---|
| Merchandising | `merchandiser@` |
| Commercial (LC/UD/bank) | `commercial@` |
| Planning | `planner@` |
| Store | `store@` (Bangla UI) |
| Procurement | `procurement@` |
| Cutting | `cutting@` (Bangla UI) |
| Production | `production@` (Bangla UI) |
| Quality | `quality@` (Bangla UI) |
| Finishing & shipment | `shipment@` |
| Maintenance | `maintenance@` (Bangla UI) |
| HR & payroll | `hr@` |
| Compliance | `compliance@` |
| Finance | `finance@` |
| Owner / Admin | `owner@` / `admin@` |

Two more logins exist to test **absence** of access: `viewer@` (read-only everywhere — every
write control must be missing or refused server-side) and `member@` (minimal baseline —
most modules hidden/locked). Both are refused document intake entirely.

## The ten-minute smoke

1. Sign in as `owner@` → dashboard shows PO-88203, TNA with late milestones, approve inbox non-empty.
2. Sign in as `admin@` → open Payroll → **bodyless 403**. That refusal is a passing test.
3. Sign in as `merchandiser@` → MARBIM → ask *"what is order PO-88203?"* → tool-grounded answer.
4. `merchandiser@` → MARBIM → *Have a document to read?* → kind **Buyer PO** → paste
   `documents/buyer-po/PO-88410-HM.paste.txt` → pick buyer H&M → submit.
5. Sign in as `owner@` → Approve inbox → compare the draft field-by-field against
   `documents/buyer-po/expected.json` → approve → a new order PO-88410 exists.

## Rules the whole kit leans on

- Every AI-drafted write lands in the **approve inbox** first; per-field confidence comes
  from the model's token log-probabilities, never invented.
- Gates are server-side: PP approval before cutting, UD balance on bonded issues, BTB
  headroom, EXP before bank docs, LC latest-shipment conflicts. Testing = trying to break them.
- All documents here are **specimens** generated for this kit; totals and codes are
  consistent with the tenant's seeded data on purpose, so extraction output can be checked
  against `expected.json` and against what the screens already show.
