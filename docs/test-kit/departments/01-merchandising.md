# Merchandising — `merchandiser@fabricxai-fashion.test`

The desk that owns buyers, enquiries and the order book. Password: `FabricXai-seed-2026`.

## Data already present
- Buyer **H&M** (`HM`); 7 leads mid-pipeline (new → contacted → sampling_talk → negotiation)
- 3 RFQs: `RFQ-2026-118`, `RFQ-2026-121`, `RFQ-2026-112` — one **overdue with an
  unanswered clarification**
- Order **PO-88203** (see `01-order-story.md`) with TNA and 15 breakdown cells
- Sampling: PP sample for SH-4471 approved after 2 feedback rounds
- Costing: consumption template `polo-180gsm`; margin floor **10%** (policy)

## Test steps
1. **Leads**: advance a lead through its stage machine; try an illegal jump (e.g. new →
   negotiation skipping stages) — must be a typed 409-style refusal, not a silent save.
2. **RFQ**: answer the overdue clarification; quote the RFQ; mark one lost — the loss
   reason list (6 seeded) is mandatory, free text alone must not be enough.
3. **Order**: open PO-88203 — TNA shows everything through cutting `late`, sewing_start
   `at_risk`. Edit the breakdown (order_breakdowns routes through the approve inbox —
   owner/admin approve).
4. **Costing**: build a cost sheet for SH-4471 from the tech-pack BOM (after the tech-pack
   intake below is approved, its lines appear). Push margin below **10%** — the floor gate
   must demand owner override, not accept quietly.
5. **Sampling**: request a new sample round for SH-4522 (the second style) and walk its
   feedback loop.

## Document intake (this department's three)
- **Buyer PO** `documents/buyer-po/` — paste `.paste.txt`, pick buyer H&M, submit; approve
  as owner; verify against `expected.json`; order **PO-88410** appears in the book.
- **Tech pack** `documents/tech-pack/` — BOM draft for SH-4471; approving feeds costing.
- **Measurement chart** `documents/measurement-chart/` — POM spec for quality.

## MARBIM prompts to try
- "Which milestones on PO-88203 are late, and what is the slack to the LC latest shipment?"
- "Draft a polite chaser to H&M about the unanswered clarification on RFQ-2026-118."

## Must refuse
- Editing another module's masters (store items, wage data) — not offered to this role.
- A cost sheet below the 10% margin floor without an owner.
