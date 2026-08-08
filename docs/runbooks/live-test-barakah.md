# Live test · Barakah Fashions Ltd — what is prepared, and where reality differs from the kit

The kit's `00-LIVE-TEST-RUNBOOK.md` stays the script. This page is the local knowledge:
what is already loaded on `https://baraka.fabricxai.com`, who signs in as whom, and the
places where the platform's real shape differs from what the runbook assumes. Read this
once before Phase 1; keep the runbook open while testing.

## Accounts

- **Owner is `arif007lotus@gmail.com`** with the password chosen at signup. The kit's
  `owner@barakah.test` from the credential sheet **does not exist** — deliberately; the
  real signup owner replaced the fixture. Every runbook step that says "owner" is Arif.
- The other 17 (`admin@barakah.test` … `viewer@barakah.test`) exist, are verified, and use
  the one-time passwords from the day-0 run (`~/day0-run.log` on the VPS — ignore its
  first line, that account is gone). Passwords are long and random: **paste, don't type**.
- Side-by-side accounts: use one normal window + one incognito, or two browsers. Ten
  sign-ins per 5 minutes per IP is the limiter — an office full of testers sharing one IP
  can trip it; that reads as "login broken" and is not.

## Already loaded (do not re-enter)

| Phase 0 item | State |
|---|---|
| Company profile, factory tree, 18 users, roles+scopes | ✔ seeded day-0 (knit-composite; U1 L1–L6, U2 L7–L8, KM-01..03) |
| Approval rules, TNA templates ×2, wage grades 1–4, consumption polo 255 g/pc, margin floor 10% | ✔ |
| Defect codes | ✔ — but **semantic names**, see deviations |
| Buyers **Bestseller A/S (BSL)** and **H&M (HM)** | ✔ — created through the real lead→convert path, as Rashida and Imran |
| Workers BF-0001…BF-0040 (grades 2–4, lines L1/L2/L3/L7/L8) | ✔ |
| Machines OV-3-114 (overlock, L3), SN-1-021 (single needle, L1), KM-01..03 | ✔ |
| Store items YRN-30-1, GRG-PIQ, FAB-PIQ-180, FAB-DEN-12, TRM-PLK, TRM-ZIP | ✔ |

Phase 0's **exit check still applies**: sign in as `viewer@barakah.test` → no Settings, no
payroll in the nav, prices masked. Start there.

## Where the platform differs from the runbook — expected, not failures

1. **"Drop the PDF → draft appears" is really "intake: say what it is, paste the text".**
   There is no OCR and no PDF parser — by design today, `readDocument` requires the text
   and keeps the file as provenance. So for every document step: MARBIM → intake → pick
   the kind → **paste the document's text** (open the PDF, select-all, copy) → attach the
   file → queue. The extraction pipeline behind it is real: per-field confidence is
   measured (OpenAI logprobs), the low-confidence field shows orange, and the draft lands
   in the Approve inbox on the five-minute cycle — allow up to 5 minutes, it is a
   schedule, not a click. Photo steps (challan JPG, hourly-report photo, measurement
   photo) cannot be machine-read at all: type the values, attach the photo.
2. **Defect codes are semantic, not D-numbered.** The tap grid shows `BROKEN_STITCH`,
   `SKIP_STITCH`, `OIL_STAIN`… The kit's `D-04 broken stitch` = `BROKEN_STITCH`,
   `D-11 skip stitch` = `SKIP_STITCH`. The kit's D-19/D-20/D-21 have no equivalent — pick
   the nearest semantic code and note it.
3. **Role names differ.** manager→**admin** (Sultana approves as admin), storekeeper→
   **store**, supervisor→**production** (line scope enforced: Shilpi L1/L2, Rina L7/L8),
   qc→**quality**, packing→**shipment**, mechanic→**maintenance**, accounts→**finance**.
4. **Two of the approval rules are enforced differently than the sheet says.**
   Below-floor costing → owner is enforced **in the costing service via the 10% policy**,
   not as an inbox rule — the trap still works, test it as written. Breakdown-after-
   production-start routes **all** breakdowns to admin/owner (stricter than asked, because
   rule conditions are not evaluated). Payroll run is hard-gated to hr+owner in code; the
   quiet locked card in Phase 9 is exactly that gate.
5. **Yarn and greige appear as kind "fabric"** in the store (the item-kind enum has no
   yarn/greige yet; the truth is kept in the item's spec). Receiving against them works.
6. **MARBIM answers only from tools.** Barakah's order book is empty until Phase 2 books
   one — the copilot refusing to invent an order is correct behaviour, not a failure.

## Honest status of the traps

The gates the runbook pokes (PP blocks cutting, UD overdraw block, BTB headroom, EXP
before bank, offline dedupe, AQL 315/14 computed, over-pack block, tolerance override,
409 on concurrent approve) are all **built and server-side** — but most have never been
exercised on this host. That is what this test is FOR. Log every miss in the runbook's
format (phase, user, action, expected vs got, screenshot); each maps to a module contract.

## When something fails

Real candidates, in likelihood order: a screen missing a write path (the buyers desk was
read-only until this week), a contract mismatch between modules, an i18n gap on floor
screens (most are English; Bangla covers store/receive). Collect, don't debug live —
bring the list back.
