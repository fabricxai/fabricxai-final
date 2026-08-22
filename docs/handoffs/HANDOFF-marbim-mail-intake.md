# HANDOFF — marbim: mail intake

Written BEFORE the build (§8 empty). From the 2026-08-22 design canvas; grounded in
the factory's own inbox — the enquiry that arrived as "part 3 of 3", each mail
carrying attachments, with instructions to answer each separately.

## §1 Why

The inbox is where the work actually arrives. The drop-zone catches what somebody
remembers to drag; a forward-to address catches the rest. What the app can own today
is the RECEIVING END: an authenticated endpoint an MTA or forwarding rule posts to,
which files each attachment through the existing document pipeline and keeps the
thread together. Running an MX is ops, not schema, and stays out of scope — the
endpoint is the contract an MTA adapter is pointed at.

## §2 Shape

`POST /api/intake/mail` — bearer token (`INTAKE_MAIL_TOKEN` env; absent = endpoint
refuses everything, fail closed). Body JSON:
`{ from, subject, threadRef?, attachments: [{filename, mimeType, contentBase64}] }`.
The MTA-side adapter (or a manual curl) does MIME parsing; this endpoint deliberately
does not — RFC822 parsing is a large dependency for what an adapter does in ten lines.

Each attachment becomes a `documents` row through the existing upload path, with
`meta = { mailFrom, mailSubject, threadRef }`. No entity linkage is guessed: a file
naming no style lands UNFILED (`entity_table IS NULL`) and waits — never guessed onto
an order. Classification and extraction remain the existing intake pipeline's job.

Company resolution: the token maps to exactly one company (env-configured tenant slug
`INTAKE_MAIL_COMPANY_SLUG`). One factory per deployment is the current shape of every
tenant; multi-tenant mail routing is future work and refused rather than guessed.

## §5 Operations

- Route: validate token → validate body (zod) → size caps (per-file 15 MB, 10 files)
  → store each via the documents pipeline as a SYSTEM actor with `source` recorded →
  202 with per-file ids. Idempotency: `threadRef + filename + sha256` dedupes a
  re-delivered mail.
- Read: `unfiledDocuments(ctx)` — live documents with no entity linkage, newest
  first, with their mail meta. Shown on `/marbim/intake` as the Unfiled tray.

## §7 Gates

Token, size caps, mime allowlist (pdf, images, xlsx/xls/csv, docx, txt, eml). A wrong
mime is refused with words, not stored-and-ignored.

## §10 Seed

None — mail arrives from outside by definition. The test posts a fixture.

## §8 Acceptance

(empty)
