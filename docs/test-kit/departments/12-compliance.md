# Compliance — `compliance@fabricxai-fashion.test`

Audits, findings, CAPs, certificates, trainings. Password: `FabricXai-seed-2026`.

## Data already present
- **BSCI follow-up audit** — Bureau Veritas · Dhaka, audited **2026-07-21**, score 68.5
- 4 findings with 4 CAPs, 5 certificates (expiry-tracked), 3 training records

## Test steps
1. **CAP lifecycle**: take one open CAP through its states (open → in progress → verified/
   closed) with evidence; illegal jumps refused.
2. **Certificates**: one certificate should be near expiry — confirm the expiry surfaces
   (dashboard/notification), then renew it.
3. **Trainings**: record a fire-drill training with attendee count; history accumulates.
4. **Audit-report intake**: `documents/audit-report/` — kind *Audit report*, pick the
   **BSCI 2026-07-21** audit in the context dropdown (the auditId never appears in the
   text), paste `.paste.txt`. Approve as owner → 4 new findings (1 critical fire-exit,
   1 major first-aid, 1 minor needle-log, 1 observation signage) attach to that audit with
   `sourcePage` 3/5/7/8. Diff against `expected.json`. Note: CAPs are deliberately NOT
   extracted — a corrective plan is a human commitment; raise them by hand against the new
   findings.
5. **Audit trail**: compliance is a ⚖ table — your writes appear in the audit log
   (`owner@` verifies).

## MARBIM prompts to try
- "Which CAPs are overdue and what did the auditor find about fire safety?"
- "When does our BSCI certificate expire?"

## Must refuse
- Closing a CAP without evidence/verification; editing another module's rows; intake as
  `viewer@`.
