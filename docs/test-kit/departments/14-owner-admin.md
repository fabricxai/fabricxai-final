# Owner & Admin — `owner@` / `admin@fabricxai-fashion.test`

The supervisory pair — and the one line between them. Password: `FabricXai-seed-2026`.

## The one difference that matters
`owner` and `admin` pass every role gate in the product **except payroll**: hr+owner only,
admin excluded, bodyless 403. Verify both directions — `admin@` blocked, `owner@` in
(and the read audited).

## Owner test steps
1. **Approve inbox** (the kit's hub): every intake from the other guides lands here.
   Per draft: per-field confidence ticks (orange < 0.90), the attached original document,
   inline correction of a wrong field before approving, reject-with-reason. Keyboard:
   `j`/`k` navigate, `a` approve, `r` reject, `x` select for batch.
2. **Audit log**: after a day of testing, the ⚖ tables (orders, LCs, payroll, adjustments,
   compliance, shipments, finance, pending commits) show who did what; payroll **reads**
   included.
3. **Analytics**: read-only by construction — efficiency, DHU, on-time trends agree with
   the floor's numbers. There is no write anywhere on these screens (lint-enforced).
4. **Dashboards**: owner dashboard + `/board` wallboard tell the PO-88203 story: late TNA
   head, at-risk sewing start, 3-day slack to LC latest shipment, 45 cartons packed.
5. **Settings / role controls**: grant `member@` a second role (e.g. `store`), watch their
   nav widen; revoke it; the grant/revoke is audited. Granting requires existing
   membership — you cannot promote a stranger.
6. **MARBIM anywhere**: the copilot on every screen answers with tools scoped to the
   opener's role; as owner that is the full read surface.

## Admin test steps
- Everything above except payroll works identically.
- Payroll: 403 with **no body** (no error page leaking shape).

## RLS spot-check (any screen)
No list anywhere may show another tenant's rows — Seed Apparels and Barakah Fashions data
exist in the same database on purpose. One foreign row anywhere is a critical finding.

## Must refuse
- Admin on payroll; anyone editing analytics; approval of a draft whose target module
  zod rejects the payload (server re-validates at approve time, not just at propose).
