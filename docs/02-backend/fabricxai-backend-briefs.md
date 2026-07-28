# FabricXAI — Backend Briefs (v1, pre-design)

**Status of this document.** These briefs are the *draft contract* for each module's backend. They are finalized per-module only after that module's frontend is locked in Claude Design — via the module's HANDOFF file (see `design-handoff-template.md`). Fields marked `?` are expected to be settled by the design.

**Global conventions (apply to every module):**

- Every table: `id uuid pk`, `company_id uuid not null → companies`, `created_at`, `updated_at`, `created_by → users`. RLS/tenancy scoping on `company_id` at both ORM layer and Postgres RLS (session var).
- Status fields are enums with explicit state machines documented per module; illegal transitions rejected server-side.
- Money: `numeric(14,2)` + `currency char(3)`; never floats. Quantities: `numeric(12,2)` (fabric meters/kg) or `integer` (pieces). Every API response carries currency/unit.
- All AI/junior-drafted writes flow through `pending_changes` (whitelisted `target_table`, per-module Zod payload schema, routing rule for approver role).
- Soft business documents (PDFs, photos) → S3/MinIO, referenced by `documents(id, bucket_key, mime, size, sha256, label)`.
- Events: emitted to an internal outbox table → consumed by BullMQ jobs (notifications, digests, derived computations). Names given per module as `module.event`.
- Audit: append-only `audit_log(actor, action, table, row_id, before, after)` written by the service layer on every mutation of money-bearing or compliance-bearing tables (marked ⚖ below).

---

## DEPT 1 — MERCHANDISING

### 1.1 Buyer & Lead Desk

**Entities**
- `leads`: source enum(fair, referral, buying_house, inbound, other), company_name, country, agent_id? → `agents`, stage enum(new, contacted, sampling_talk, negotiation, won, lost), lost_reason?, quiet_since (derived), notes
- `agents`: name, type enum(buying_house, individual), commission_pct, contacts
- `lead_activities`: lead_id, kind enum(call, email, meeting, note), summary, occurred_at
- `buyers`: name, brands[], country, website, status enum(active, dormant, blacklisted)
- `buyer_contacts`: buyer_id, name, role enum(merchandiser, qa, sourcing, finance, other), email, phone, is_primary
- `buyer_terms` ⚖ (versioned): buyer_id, payment enum(lc, tt, dp), incoterm, tolerance_pct, aql_level enum(1.5, 2.5, 4.0), nominated_banks[], nominated_forwarders[], nominated_labs[], valid_from
- `buyer_requirements`: buyer_id, text, category, source_doc_id?, source_page?
- `buyer_documents`: buyer_id, document_id, kind enum(manual, agreement, coc, other)

**Operations**
- `convertLead(leadId)` → creates buyer + carries contacts/activities, closes lead as won. Idempotent.
- `detectDuplicates(name, domain)` on lead/buyer create — trigram similarity ≥ 0.6 returns candidates; UI confirms.
- `logActivity`, `upsertTerms` (new version row; changes route through pending_changes, approver: manager).
- Extraction job: buyer manual PDF → `buyer_requirements` drafts (one pending_change containing the batch).

**Events / jobs**
- `leads.quiet` nightly scan (stage active + no activity 14d) → reminder notification.
- `buyers.terms_changed` → invalidate downstream defaults caches.

**Roles** — merchandiser: CRUD own-assigned leads/buyers; manager: all + terms approval; viewer: read.

**BD rules** — agent commission % lives on lead, snapshots onto orders at creation (never live-linked — commission disputes are real). Nominated banks/forwarders/labs are the defaults Shipment, Commercial, and QC read.

---

### 1.2 RFQ & Quotation

**Entities** *(Wave 1 exists; deltas marked ✚)*
- `rfqs`: buyer_id, title, product_type, description, quantity, unit, size_ratio jsonb ✚, target_price, target_currency ✚, currency, deadline, status enum(open, clarifying ✚, quoted, won, lost, cancelled), source enum(manual, ai_extracted), loss_reason_code? ✚
- `rfq_clarifications`: rfq_id, question, asked_at, answered_at?, answer?
- `quotes`: rfq_id, version, cost_sheet_id? ✚ → Costing, fob_breakdown jsonb (fabric, trims, cm, embellishment, commercial, margin), fob_price, cm_bdt_equiv ✚, validity_date, status enum(draft, sent, superseded)
- `loss_reasons`: code, label (seeded taxonomy: price, capacity, compliance, sample, other)

**Operations**
- Extraction (exists): text/PDF/photo → pending_change. Extend: measured per-field confidence from the extraction model, not a constant. ⚠ replace hardcoded 0.85.
- `draftQuote(rfqId)`: requires approved cost sheet; computes fob_breakdown; new version supersedes prior.
- `markWon(rfqId)` → emits `rfq.won` with order-creation payload (buyer, styles, qty+ratio, price, requested dates). `markLost` requires loss_reason_code.

**Events / jobs** — `rfq.deadline_near` (48h), `rfq.clarification_stale` (5d unanswered).

**Roles** — merchandiser: own buyers' RFQs; manager: all; quote send requires manager approval if margin < company floor (Settings).

---

### 1.3 Order Desk & TNA ⚖

**Entities**
- `orders`: buyer_id, po_numbers text[], total_value, currency, agent_snapshot jsonb?, status enum(confirmed, in_production, shipped_partial, shipped_full, closed, cancelled)
- `order_styles`: order_id, style_code, description, unit_price
- `order_breakdowns`: order_style_id, revision int, color, size, qty. Unique(style, revision, color, size). Active revision pointer on order_styles.
- `order_revisions`: order_id, revision, diff jsonb, buyer_confirmed_at, document_id?
- `lcs` ⚖: buyer_id, number, value, tolerance_pct, currency, issue_date, expiry_date, latest_shipment_date, docs_required jsonb (clause-derived), status enum(draft, active, expired, closed)
- `btb_lcs` ⚖: master_lc_id, number, supplier_id, value, opened_at; constraint: Σ(btb values) ≤ master.value × btb_limit_pct (Settings)
- `order_lcs`: order_id ↔ lc_id (m:n — one LC can cover several POs)
- `tna_templates`: product_type, milestones jsonb[] (name, offset_days_before_exfactory, owner_role, depends_on, critical)
- `tna_milestones`: order_id, name, planned_date, actual_date?, owner_id, depends_on[], critical bool, status derived(pending, on_track, at_risk, late, done)
- `order_files`: order_id, document_id, label

**Operations**
- Create from `rfq.won` payload or from PO extraction draft.
- `saveBreakdown(styleId, cells[])`: validates Σqty within order qty ± buyer tolerance; writes new revision only on buyer-revision flow, else edits active revision pre-production-start.
- `generateTna(orderId, templateId, exFactoryDate)`: backward schedule; respects dependencies.
- `actualizeMilestone(id, date)`: sets actual, recomputes downstream planned dates on critical path, returns ripple preview first (`previewRipple` separate call — UI shows before confirm).
- `applyRevision(orderId, diff)`: from MARBIM diff draft via pending_changes; snapshots new breakdown revision.
- LC conflict detector (pure fn, used by API + nightly job): any linked order with planned ex-factory > lc.latest_shipment_date ⇒ conflict.

**Events / jobs**
- `tna.scan` nightly: recompute milestone statuses; emit `tna.milestone_at_risk` / `.late` → notifications + owner digest queue.
- `lc.countdown` at 21/14/7 days on expiry & latest_shipment with unshipped balance.
- Gate: `sampling.pp_approved(order)` clears the block on the cutting-start milestone; cutting module checks this gate.

**Roles** — merchandiser: own buyers' orders; manager: all; owner: read + money view. Breakdown edits after production start route through pending_changes (approver: manager).

**BD rules** — LC discipline everywhere: conflicts are late-red, surfaced in order book, order detail, shipment, owner exceptions. Partial shipment count per LC terms. EXP gate lives in Shipment but validated here too on close.

---

### 1.4 Sampling

**Entities**
- `sample_requests`: type enum(proto, fit, sms, pp, top, shipment), rfq_id? xor order_id?, style_code, due_date, status enum(requested, in_work, dispatched, feedback, approved, rejected, closed)
- `sample_stage_events`: request_id, stage enum(pattern, cutting, sewing, finishing, qc, dispatched), at, by
- `sample_dispatches`: request_id, courier, awb, dispatched_at, received_at?
- `sample_feedback_rounds`: request_id, round, verdict enum(approved, approved_with_comments, rejected), comments jsonb[], document_id?
- `sample_costs`: request_id, amount_bdt, note
- `sample_photos`: request_id, document_id, tags[]

**Operations** — stage advance (floor, offline-queued); dispatch; feedback capture (incl. MARBIM comment-sheet extraction draft); on PP verdict=approved → emit `sampling.pp_approved(order)`.

**Jobs** — due reminders; `sampling.pp_blocking` escalation when a linked order's cutting planned date < 5 days and PP not approved.

---

### 1.5 Costing Studio ⚖

**Entities**
- `boms`: style_code, source enum(tech_pack_extract, manual, seeded), lines[] → `bom_lines` (group enum(fabric, trims, packing, embellishment), item_ref?, spec text, consumption numeric, uom, wastage_pct, source_doc_id?, source_page?)
- `cost_sheets` ⚖ (versioned): rfq_id? xor style_code, version, status enum(draft, approved, superseded), sections jsonb (fabric[], trims[], cm{method: smv|per_dozen, smv?, efficiency_pct?, labor_rate_bdt?, per_dozen_rate?}, embellishment[], commercial[], margin_pct), fob_price, cm_bdt_pc, approved_by?
- `consumption_templates`: product_type, params jsonb, updated_from_order_id?, usage_count

**Operations**
- `buildFromBom(bomId, templateId?)` — assembles a draft sheet; `computeScenario(sheet, overrides)` pure fn (price/efficiency/fabric-price sliders).
- Approval via pending_changes (approver: manager; margin < company floor from Settings → owner).
- `compareActual(orderId)` — reads 11.1 `order_costs_actual`, returns per-section variance waterfall.
- `refreshTemplate(fromOrderId)` — pending_change updating the product-type template from a closed order's actuals (source: 1.6 outcome).

**Events / jobs** — `costing.sheet_approved` (unlocks quote draft in 1.2); template-staleness report (templates unused/unrefreshed 12 mo).

**Roles** — merchandiser drafts; manager approves; owner approves below-floor margins.

**Feeds** — 1.2 quotes (fob_breakdown = approved sheet), 1.3 requisitions (BOM lines × order qty × wastage), 3.2 (line specs onto supplier inquiries/POs), 11.1 (quoted baseline for variance).

---

### 1.6 Order Memory

**Entities**
- `style_fingerprints`: style_code, embedding vector(1536) (attributes + tech-pack text via embeddings model), attrs jsonb (product_type, gsm, construction, gauge…)
- `order_outcomes`: order_id, compiled_at, actual_consumption_pc jsonb (per item), efficiency_curve jsonb (day→pct achieved), top_defects jsonb, delay_events jsonb (milestone, days, reason), quoted_margin_pct, actual_margin_pct, merchandiser_note text?

**Operations**
- `embedStyle(styleCode)` on style create/update (queued job).
- `findSimilar(ref, k=3)` — pgvector cosine over company's fingerprints, joined to outcomes; returns match % + outcome summary. Index: HNSW on embedding (per company partial index if needed at scale).
- `seedCostSheet(fromOrderId, targetRfqId)` — copies BOM + consumption actuals into a draft (via pending_changes, source marked seeded).
- Outcome compiler job on `orders.closed`: assembles from 6.1 (efficiency), 7.1 (defects), 1.3 (delays), 11.1 (margins); emits close-out prompt notification to the order's merchandiser for the note.

**Roles** — read: merchandiser+; outcomes immutable once compiled except the note (7-day edit window).

**Feeds** — 1.2 similar-orders panel, 1.5 seeding + template refresh, MARBIM tool `find_similar_orders` (read-only).

---

## DEPT 2 — COMMERCIAL

### 2.1 LC Register & Bank Docs ⚖

**Entities** *(lcs/btb_lcs defined in 1.3 — Commercial is the writing owner)*
- `lc_amendments`: lc_id, number, diff jsonb, received_at, document_id
- `doc_submissions`: shipment_id, lc_id, docs jsonb[] (kind, document_id, status), submitted_at, bank_status enum(preparing, submitted, accepted, discrepant, realized), discrepancy_notes?, realized_amount?, realized_at?
- `bank_charges`: lc_id | submission_id, kind, amount, currency

**Operations** — amend LC (versioned diff, re-runs conflict detector); open BTB (headroom validation); submission lifecycle transitions; `postRealization` → Finance receivable + emits `finance.realized`.

**Jobs** — discrepancy aging (>5d) escalation; realization-lag stats per buyer (feeds 11.1).

**Roles** — commercial role + owner. All mutations audited.

### 2.2 Bonded Warehouse & UD ⚖

**Entities**
- `uds`: number, issue_date, valid_until, authorized_items jsonb[] (item_ref, qty, unit), status enum(active, exhausted, expired, closed)
- `ud_consumptions`: ud_id, store_issue_id, item_ref, qty (written automatically by Store issue when bonded)
- `ud_reconciliations`: ud_id, period, snapshot jsonb, generated_document_id

**Operations** — `checkUdBalance(udId, item, qty)` (used synchronously by Store issue; insufficient ⇒ block + optional override pending_change routed to owner); reconciliation generator (customs-format PDF).

**Jobs** — balance/expiry alerts; monthly reconciliation reminder.

**BD rules** — every bonded GRN and issue must carry a ud_id; hard server-side enforcement, not UI-only.

---

## DEPT 3 — STORE

### 3.1 Fabric & Trims Store

**Entities**
- `items`: kind enum(fabric, trim, accessory), name, spec jsonb (fabric: construction, composition, gsm, width; trim: spec), uom
- `supplier_pos` → see 3.2/Procurement (GRN references them)
- `grns`: supplier_po_id?, challan_no, received_at, bonded bool, ud_id?, inspection_status enum(pending, passed, failed_partial, failed), lines jsonb[] or `grn_lines` table (item_id, qty, unit_price?)
- `rolls`: grn_line_id, roll_no, lot, dye_lot, shade_group, qty, uom, location_id, status enum(in_stock, issued, returned, adjusted_out)
- `locations`: kind enum(bonded, general, floor), name
- `requisitions`: order_id, computed_lines jsonb[] (item, required_qty — from cost-sheet consumption × order qty × (1+wastage)), status
- `issues`: requisition_id, order_id, lines[] (item, qty, roll_ids[]), issued_at, offline_key (idempotency)
- `returns`, `adjustments` ⚖ (reason_code, qty ±, via pending_changes)

**Operations**
- GRN create (offline-queued, idempotent by device+local id); bonded ⇒ `ud_id` required + balance check.
- Issue: validates requisition remaining; bonded rolls ⇒ UD draw; shade-mix check (order already drew shade X, picking Y ⇒ warning flag in response, UI decides).
- Stock queries: on-hand / reserved (open requisitions) / free, by item·location·roll. Must stay fast at 10⁵ roll rows — covering indexes on (company_id, item_id, status), (company_id, location_id).
- Consumption accrual per order → Costing actuals.

**Jobs** — inspection-pending reminders; low-stock scan vs cutting dates within 14d; dead-stock report (no movement 180d).

---

## DEPT 3b — PROCUREMENT (served by Store dept + Commercial)

### 3.2 Procurement & Suppliers

**Entities**
- `suppliers`: type enum(fabric_mill, trims, embellishment, subcontract), origin enum(local, import), payment_terms, contacts
- `purchase_requisitions`: order_id, lines[] (item, qty) — generated from requisitions
- `supplier_quotes`: pr_id, supplier_id, lines[] (unit_price, leadtime_days)
- `supplier_pos` ⚖: supplier_id, pr_id?, number (seq per company), lines[], currency, status enum(issued, confirmed, in_production, shipped, received_partial, received, cancelled), btb_lc_id? (import), document_id (rendered PDF)
- `supplier_scores` (derived monthly): on_time_pct, quality_reject_pct (from GRN inspections), price_index, responsiveness

**Operations** — PR from order material plan; quote comparison; PO issue (PDF render on letterhead + email); PO↔GRN line matching closes lines; import PO requires btb_lc link before issue.

**Jobs** — monthly supplier score compute (from GRN/QC data — never manual vibes); PO overdue alerts.

---

## DEPT 4 — PLANNING & IE

### 4.1 Capacity & Line Planning

**Entities**
- `factory_units` → `floors` → `lines`: line(machines_count, manpower_std)
- `line_calendars`: line_id, date, shift_minutes, planned_downtime_minutes
- `smv_records`: style_code, smv, source enum(ie_study, estimate), measured_at
- `learning_curves`: product_type, day_index → efficiency_pct
- `allocations`: order_id, line_id, start_date, end_date, planned_daily jsonb (date → qty), status enum(planned, active, done)
- `scenarios`: name, base_snapshot_at, draft_allocations jsonb, status enum(draft, applied, discarded)

**Operations**
- `allocate()` with overload check: Σ(order smv × planned qty) ≤ available minutes × expected efficiency per line-day; returns violations, doesn't silently clamp.
- `capacityQuery(productType, qty, window)` → feasibility answer with assumptions (the owner card). Pure, cacheable.
- Scenario fork/compare/apply — apply writes real allocations via pending_changes (approver: manager).
- Ripple preview shared with TNA (moving allocation shifts sewing milestones).

**Jobs** — nightly plan-vs-actual variance (reads 6.1 efficiency_daily) → replan suggestion drafts; changeover-density warning.

---

## DEPT 5 — CUTTING

### 5.1 Cutting Floor

**Entities**
- `markers`: style_code, size_ratio jsonb, efficiency_pct, fabric_width
- `lays`: order_id, marker_id, plies, lay_length, rolls_drawn uuid[] (→ Store issue rolls), created offline-capable
- `cut_reports`: lay_id, cells jsonb (color × size → qty)
- `bundles`: cut_report_id, bundle_no, color, size, qty, qr_token, status enum(created, in_sewing, done)
- `cut_wastage` (derived per order): fabric_drawn, marker_consumption, wastage_pct

**Operations**
- Preconditions on lay create: `sampling.pp_approved` gate AND issued fabric present — enforced server-side, returned as structured precondition errors.
- Cut report validates against active breakdown revision ± tolerance; completion % feeds TNA cutting milestone auto-actualization at 100%.
- Bundle generation + ticket render (QR encodes bundle uuid).

**Jobs** — wastage anomaly (> marker plan + threshold) alert.

---

## DEPT 6 — SEWING / PRODUCTION

### 6.1 Line Tracking ⚡ *(load-testing target)*

**Entities**
- `daily_line_plans`: line_id, date, order_id, target_per_hour, manpower_planned
- `hourly_outputs`: line_id, date, hour, target, actual, entered_by, offline_key — **unique(line_id, date, hour)**, upsert-idempotent
- `downtimes`: line_id, started_at, ended_at?, reason enum(machine, feeding, absent, power, other), machine_id?, ticket_id? (auto)
- `endline_counts`: line_id, date, checked, passed, defective, rework (QC co-writes)
- `efficiency_daily` (derived): line_id, date, earned_min, available_min, efficiency_pct
- `wip_snapshots` (derived hourly): order_id, cut, sewn, finished

**Operations**
- Burst-write hourly upsert API: accepts batches, idempotent by offline_key/unique key, returns per-row status. Target: 50 lines × 10 entries in <2s p95 under concurrent dashboard reads.
- Downtime open/close; reason=machine → auto Maintenance ticket (9.1), link back.
- `runRate(orderId)`: forecast completion date from trailing 3-day rate; compares to TNA sewing milestone.

**Jobs** — hourly WIP snapshot; day-close efficiency compute + owner digest; run-rate risk alerts. Partition `hourly_outputs` by month from day one.

---

## DEPT 7 — QUALITY

### 7.1 Inline, Endline & Final Inspection

**Entities**
- `defect_codes`: category, code, label (seeded standard taxonomy, company-extendable)
- `inline_checks`: line_id, at, operation, operator_id?, defects jsonb[] (code, count)
- `dhu_daily` (derived): line_id, date, defects, checked, dhu
- `fabric_inspections`: grn_id, roll_id?, points_4 jsonb, result enum(pass, fail), inspector
- `measurement_specs`: style_code, points jsonb[] (name, spec, tol_plus, tol_minus)
- `measurement_checks`: spec_id, order_id, sampled_size, values jsonb, out_of_tol jsonb (derived)
- `aql_tables` (seeded, versioned): level, lot_range → sample_size, accept, reject
- `final_inspections` ⚖: order_id, lot_qty, aql_level (from buyer_terms), sample_size, defects jsonb, verdict enum(pass, fail), photos[], inspector, at
- `third_party_inspections`: order_id, agency enum(sgs, intertek, bv, other), scheduled_at, result?, document_id?

**Operations** — inline capture (≤3-tap payload shape, offline-queued); AQL computed server-side from tables (never client math); buyer report pack generator (PDF: inline history, DHU trend, final AQL) per PO.

**Jobs** — day-close DHU; repeat-defect pattern (same code+operation ≥3 consecutive days) alert; pre-final readiness check vs TNA.

---

## DEPT 8 — FINISHING & SHIPMENT

### 8.1 Finishing, Cartons & Shipment ⚖

**Entities**
- `finishing_outputs`: order_id, date, cells jsonb (color×size → qty)
- `cartons`: order_id, carton_no, contents jsonb (color×size → qty), gross_kg, net_kg, dims
- `packing_lists`: order_id, shipment_id?, version, generated jsonb, status enum(draft, approved), mismatches jsonb (derived vs breakdown)
- `shipments`: order_id, partial_no, planned_exfactory, actual_exfactory?, forwarder (from buyer nominations), booking_ref?, exp_number?, bl_awb?, port_status enum(planned, ex_factory, at_port, on_board, delivered), lc_id
- `shipment_docs`: shipment_id, checklist jsonb (from lc.docs_required: kind, document_id?, status enum(pending, ready, submitted))

**Operations**
- Carton build validates against remaining-to-pack (finishing minus packed); over-pack rejected with cell detail.
- Packing list generate + approve (locks version); mismatch report.
- `confirmExFactory` → TNA final milestone actualize + Finance invoice draft.
- Gate: docs handoff to bank (2.1 submission) blocked until `exp_number` present — server-enforced.
- Tolerance check: shipped qty within lc tolerance_pct, else structured warning requiring manager pending_change.

**Jobs** — LC latest-shipment countdown on unshipped balance (shared with 1.3/2.1).

---

## DEPT 9 — MAINTENANCE

### 9.1 Machines & Tickets

**Entities**
- `machines`: type, brand, model, serial, purchased_at, line_id?, assignment_history jsonb
- `pm_schedules`: machine_type, checklist jsonb[], cadence enum(daily, weekly, monthly)
- `pm_completions`: schedule_id, machine_id, at, by, checked jsonb
- `tickets`: machine_id, source enum(downtime_auto, manual), priority enum(line_down, high, normal), reported_at, claimed_by?, resolved_at?, parts_used jsonb[], notes
- `spare_parts`: name, on_hand, min_level
- `downtime_costs` (derived monthly): machine_id, minutes, est_loss_bdt (minutes × line smv-value)

**Operations** — auto-ticket from 6.1 downtime (line_down priority); claim/resolve; PM due-list; utilization stats.

**Jobs** — PM due generation; breakdown-frequency outlier report.

---

## DEPT 10 — HR, PAYROLL & COMPLIANCE

### 10.1 Workforce & Wage Engine ⚖ 🔒

**Entities**
- `workers`: employee_no, name, name_bn, photo document_id, designation, grade → wage_grades, section, line_id?, join_date, exit_date?, disbursement jsonb (type enum(bank, bkash, nagad, cash), ref), status
- `wage_grades` (gazette-versioned): gazette_version, grade, basic, house_rent, medical, transport, food, effective_from
- `attendance`: worker_id, date, in_at?, out_at?, status enum(present, absent, leave, holiday), source enum(device, manual), exception? enum(missed_punch, late, mismatch)
- `leaves`: worker_id, kind enum(earned, casual, sick, maternity), from, to, approved_by
- `payroll_runs` ⚖: period, gazette_version, status enum(draft, computed, approved, disbursed), approved_by?, disbursed_at?
- `payroll_lines`: run_id, worker_id, components jsonb (basic, house, medical, transport, food), ot_hours, ot_amount (= hours × 2 × basic/208), attendance_bonus, festival_bonus?, deductions jsonb, gross, net
- `festival_bonus_runs`: festival, period, pro-rata rules snapshot
- `skill_matrix`: worker_id, operation, grade enum(a, b, c)

**Operations**
- Payroll compute = **pure function** `(workers, attendance, grades, rules) → lines`; unit-tested against gazette cases; deterministic re-run.
- Run approval routes through pending_changes → owner. Disbursement sheet export (bank/bKash formats).
- Payslip PDF batch (bn primary + en).
- Anomaly detector on compute (OT > 2.5× worker's 3-mo avg; net delta > threshold) → flags on lines.

**Roles** 🔒 — hr + owner only, enforced at API/RLS level; other roles receive 403 without data shape. Every read of payroll_lines audited.

### 10.2 Compliance & Audit ⚖

**Entities**
- `audits`: regime enum(rsc, bsci, sedex, buyer, government), auditor, date, report document_id, score?
- `findings`: audit_id, severity enum(critical, major, minor, observation), text, evidence[]
- `caps`: finding_id, owner_id, deadline, status enum(open, in_progress, evidence_submitted, closed), closure_evidence[], milestones jsonb? (multi-year RSC)
- `certificates`: kind (fire, factory, bond, boiler, environment, buyer_cert…), number, issued, expires, document_id
- `trainings`: kind, date, attendees_count, document_id

**Operations** — MARBIM audit-report extraction → findings batch draft; CAP lifecycle; audit-pack export per regime; expiry ladder query.

**Jobs** — certificate alerts 90/60/30; CAP deadline escalations; critical-open → owner exceptions feed.

---

## DEPT 11 — ACCOUNTS & OWNER

### 11.1 Commercial Finance ⚖

**Entities**
- `invoices`: shipment_id, number, value, currency, document_id
- `receivables`: invoice_id, expected_at (from realization-lag model), realized_amount?, realized_at? (posted by 2.1)
- `payables`: supplier_po_id | grn_id, due_at, amount, paid_at?
- `order_costs_actual` (accrued): order_id, materials (Σ store issues × price), cm (payroll allocation model v1: line-days × loaded rate), commercial (bank charges + freight), total
- `order_profitability` (derived): order_id, quoted_margin_pct, actual_margin_pct, variance jsonb (by component)

**Operations** — cash timeline query (8-week in/out); per-order P&L with variance waterfall; Tally export (CSV/XML) — explicit non-goal: no GL here.

### 11.2 Owner Dashboard & Analytics *(read-only layer)*

- `exceptions_feed` (materialized, refreshed by jobs): kind enum(lc_conflict, tna_risk, cap_critical, runrate_miss, approval_waiting, payroll_anomaly), ref, since, severity
- `saved_reports`, `scheduled_exports` (period, format, recipients)
- Aggregation endpoints: order book, OTD %, efficiency trend, DHU trend, cash position, buyer scorecards — all cached (5-min TTL), all drill-through to source rows. MARBIM here gets read-only tool pack only.
- Rule enforced in code review: this layer imports no write operations.

---

## CROSS-CUTTING

### X.1 Approve Inbox (pending_changes hardening) ⚖
- `target_table` whitelist constant per module registration; unknown table ⇒ reject at insert.
- `payload` validated against the target module's Zod schema at insert AND re-validated at approve (schema may have evolved).
- `approval_rules`: module × action → required_role (Settings-managed); approve checks rule.
- Aging job (>48h pending → escalation); full audit chain query (drafted → reviewed → committed row FK).

### X.2 MARBIM Platform
- Per-module tool packs: read tools + draft tools only; registered centrally with the module.
- Context injection: current module/record ids from client → scoped tool defaults.
- Extraction runs as BullMQ jobs (not in-request) with per-company rate limits; failure states surfaced as retryable job statuses.
- Correction telemetry: field-level edits on drafts logged → correction-rate per extractor version.
- Bengali I/O passthrough; confidence must come from the model/extraction method — constants forbidden.

### X.3 Settings & Admin
- `company_profile`, factory structure (shared with 4.1), `users` + role matrix, `module_toggles`, master data managers: defect_codes, tna_templates, wage_grades (gazette versions), consumption templates, loss_reasons, approval_rules, localization prefs, `audit_log` viewer, full-company data export job.

---

## APPENDIX — Global jobs & infrastructure services

| Service | Used by | Notes |
|---|---|---|
| Notification service | all | in-app + email digests; per-user prefs |
| Document render (PDF) | PO, payslip, packing list, QC pack, UD recon, reports | one HTML→PDF pipeline, letterhead from Settings |
| Outbox + BullMQ | all events/jobs | at-least-once; handlers idempotent |
| Offline sync endpoint | Store, Cutting, Sewing, Sampling, QC inline | batch upsert, idempotency keys, per-row results |
| Search | buyers, orders, styles, rolls, workers | Postgres FTS + trigram first; revisit later |
| Cache | dashboards, capacity query | Redis, short TTL, explicit invalidation on events |
