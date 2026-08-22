# HANDOFF — marbim: mail intake

**Module:** `src/modules/marbim`

Written **before the build** — a prospective contract, §8 empty. From the 2026-08-22
design canvas; grounded in the factory's own inbox: the enquiry that arrived as
"part 3 of 3", each mail carrying attachments, with instructions to answer each
separately.

## §1 · Why

The inbox is where the work actually arrives. The drop-zone catches what somebody
remembers to drag; a forward-to address catches the rest. What the app can own today
is the RECEIVING END: an authenticated endpoint an MTA or forwarding rule posts to,
which files each attachment through the existing document pipeline and keeps the
thread together. Running an MX is ops, not schema, and stays out of scope — the
endpoint is the contract an adapter is pointed at.

## §2 · Shape

`POST /api/intake/mail` — bearer token (`INTAKE_MAIL_TOKEN` env; absent = the
endpoint refuses everything, fail closed). Body JSON:
`{ from, subject, threadRef?, attachments: [{filename, mimeType, contentBase64}] }`.
The MTA-side adapter (or a manual curl) does MIME parsing; this endpoint deliberately
does not — RFC822 parsing is a large dependency for what an adapter does in ten
lines. Company resolution: the token maps to one company via
`INTAKE_MAIL_COMPANY_ID` (the companies table is visible only inside its own scope, so a slug cannot be looked up unprivileged — ops supplies the uuid, and a wrong one fails closed at the first insert); one factory per deployment is the current shape of every
tenant, and multi-tenant mail routing is refused rather than guessed.

Each attachment becomes a `documents` row through the existing storage path, with
`meta = { mailFrom, mailSubject, threadRef }`. No entity linkage is guessed: a file
naming no order lands UNFILED (`entity_table IS NULL`) and waits in the tray on
`/marbim/intake` — never guessed onto an order. Classification and extraction remain
the existing intake pipeline's job.

## §5 · Operations

| operation | what it does |
|---|---|
| `ingestMail` | One mail in: validates the payload, caps sizes (15 MB/file, 10 files), defers to the pipeline's mime allowlist, dedupes on (threadRef, filename, sha256) so a re-delivered mail files nothing twice, stores each attachment as a documents row with the mail's meta. Returns per-file ids and whether each was new. |
| `unfiledDocuments` | The tray: live documents with no entity linkage, newest first, with their mail meta — grouped by threadRef so "part 3 of 3" reads as one enquiry. |
| `claimUnfiledDocument` | A person files one tray item against an order (entity linkage set, audit of who). The one write a human does here; MARBIM never claims a file itself. |

## §6 · State machines

None. A mail attachment rides the existing `documents.status` lifecycle
(uploaded → processing → ready | quarantined | failed), which belongs to core and is
already the single source of truth for whether a file is usable; inventing a second
lifecycle for "arrived by mail" would give one file two states that could disagree.
The only distinction mail adds is UNFILED — a linkage that does not exist yet — and
absence of a row-pair is not a state, it is the tray's query predicate. When somebody
claims the file the linkage appears; nothing transitions, nothing can be in a wrong
order, and there is no 409 to define.

## §7 · Gates

The bearer token (absent token = endpoint dead, fail closed), the size caps, and
the document pipeline's own mime allowlist (pdf, images, xlsx/xls/csv, doc/docx) — a wrong type is refused
with words, not stored and ignored. No `GATES.*` entry: those are business gates on
tenant data; this is transport hygiene at the door.

## §10 · Seed

None — mail arrives from outside by definition. The tests post fixtures.

## §8 · Open questions

(empty)
