/**
 * i18n. Errors and notifications carry KEYS, never display strings — the floor reads
 * Bangla and the office reads English against the same rows.
 *
 * This file is the resolver and the catalogue for everything the SCHEDULED JOBS emit. Those
 * messages are the first ones that leave the system: they go out as email, to somebody who
 * is not looking at a screen and cannot ask what a key meant.
 *
 * ## What it does when something is missing
 *
 * Three fallbacks, each chosen because the alternative is a message that looks fine and
 * says nothing:
 *
 *  - a key missing in Bangla falls back to English. A supervisor reading English is
 *    inconvenienced; one reading an empty alert is not informed at all.
 *  - a key missing everywhere renders as the KEY. An empty subject line reads as a broken
 *    mail server; `maintenance.notifications.pm_due.title` reads as a missing translation,
 *    which is what it is, and it is greppable.
 *  - a placeholder with no value stays as `{daysLeft}`. Rendering "expires in undefined
 *    days" turns a caller's bug into something the reader has to interpret.
 *
 * Adding a notification means adding its key here in BOTH locales. The vectors enforce
 * that, and `missingKeys` is what the delivery job uses to report a gap rather than quietly
 * mailing a key.
 */
export const LOCALES = ['en', 'bn'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export type Catalogue = Record<Locale, Record<string, string>>

/**
 * The Bangla here is written for the people who actually read it — a floor supervisor, a
 * storekeeper, a mechanic. It is deliberately plainer than the English, which is written
 * for the office, and it keeps the terms a Bangladeshi garment factory uses in English
 * anyway (LC, UD, PM, ex-factory).
 */
export const MESSAGES: Catalogue = {
  en: {
    // ── core ──
    'notifications.system.welcome.title': 'Welcome to FabricXAI',
    'notifications.system.test.title': 'Test notification',
    'notifications.approve.waiting.title': '{count} change(s) waiting for your approval',
    'notifications.lc.expiry_near.title': 'LC {lcNumber} expires on {date}',
    'core.notifications.jobs_silent.title':
      'Scheduled jobs have stopped: {staleCount} silent, {stuckCount} stuck',

    // ── 1.3 Order Desk & TNA ──
    // Milestone names are stable identifiers on the row (`pp_approval`), never
    // display strings — the TNA engine, the notification job and the board all
    // key off the same value, and only the screen turns it into words.
    'orders.milestones.order_confirmed': 'PO received',
    'orders.milestones.yarn_booking': 'Yarn booked',
    'orders.milestones.yarn_in_house': 'Yarn in-house',
    'orders.milestones.knitting': 'Knitting complete · greige',
    'orders.milestones.fabric_booking': 'Fabric booked',
    'orders.milestones.lab_dip_approval': 'Lab dip approved',
    'orders.milestones.fabric_in_house': 'Fabric in-house',
    'orders.milestones.trims_in_house': 'Trims in-house',
    'orders.milestones.hardware_in_house': 'Hardware in-house',
    'orders.milestones.pp_sample_submit': 'PP sample submitted',
    'orders.milestones.pp_approval': 'PP sample approved',
    'orders.milestones.cutting': 'Cutting start',
    'orders.milestones.sewing_start': 'Sewing start',
    'orders.milestones.sewing_end': 'Sewing complete',
    'orders.milestones.linking': 'Linking complete',
    'orders.milestones.finishing': 'Finishing and packing',
    'orders.milestones.final_inspection': 'Final inspection · buyer QA',
    'orders.milestones.ex_factory': 'Ex-factory',

    'orders.notifications.milestone_at_risk.title': '{milestone} is at risk',
    'orders.notifications.milestone_at_risk.body':
      '{milestone} was planned for {plannedDate} and is not done yet.',
    'orders.notifications.milestone_late.title': '{milestone} is LATE',
    'orders.notifications.milestone_late.body':
      '{milestone} was due on {plannedDate} and has still not been actualised.',

    // ── 2.1 LC register ──
    'commercial.notifications.lc_countdown_latest_shipment.title':
      'LC {lcNumber}: {daysLeft} day(s) to latest shipment ({date})',
    'commercial.notifications.lc_countdown_expiry.title':
      'LC {lcNumber}: {daysLeft} day(s) to expiry ({date})',
    'commercial.lc.conflict.expiry': 'LC {lcNumber} expires before this order can ship',
    'commercial.lc.conflict.latest_shipment':
      'LC {lcNumber} latest shipment is before the planned ex-factory date',
    'commercial.lc.conflict.presentation_window':
      'LC {lcNumber} leaves too few days to present documents after shipment',
    'commercial.lc.conflict.unknown_ex_factory':
      'LC {lcNumber} is linked to an order with no ex-factory date',

    // ── 2.2 Bonded warehouse ──
    'commercial.notifications.ud_expiring.title':
      'UD {udNumber} expires on {validUntil} ({daysLeft} day(s) left)',
    'commercial.notifications.ud_low_balance.title':
      'UD {udNumber}: {itemRef} is nearly exhausted',
    'commercial.notifications.ud_reconciliation_due.title':
      'UD reconciliation is due for {period}',

    // ── Gates (rule 8) — shown when a server-side gate refuses a write ──
    'gates.fabric_inspection.not_inspected':
      'These rolls have not passed 4-point inspection yet: {rolls}',
    'gates.fabric_inspection.failed':
      'These rolls failed 4-point inspection at {pointsPer100SqYd} points/100 yd²: {rolls}',
    'gates.fabric_inspection.roll_not_found':
      'One of these rolls could not be checked for inspection ({found} of {expected} found)',
    'gates.fabric_inspection.no_provider':
      'Fabric inspection cannot be checked right now, so the issue is blocked',

    // ── 6.1 Line tracking ──
    'production.notifications.partition_default.title':
      'Production writes are landing in the default partition',
    'production.notifications.run_rate_at_risk.title':
      '{poNumber} will finish sewing {forecastDate}, {slipDays} day(s) after {milestoneDate} — at {ratePerDay}/day',

    // ── Cross-department news (the `notify` queue) ──
    'quality.notifications.fabric_rejected.title':
      'A roll failed 4-point inspection at {pointsPer100SqYd} points/100 yd² (limit {threshold}) — it cannot be issued',
    'quality.notifications.final_failed.title':
      'A lot of {lotQty} failed final inspection on a sample of {sampleSize} — it does not ship',
    'quality.notifications.measurement_failed.title':
      'Size {sampledSize} measured outside the buyer\u2019s tolerance',
    'shipment.notifications.exp_missing.title':
      'Documents were refused at the bank — this shipment has no EXP number',
    'shipment.notifications.tolerance_breach.title':
      'Shipped {direction} by {varianceQty} against a {tolerancePct}% LC tolerance',
    'costing.notifications.below_floor.title':
      '{styleCode} approved at {achievedMarginPct}% margin, below the {floorPct}% floor',
    'cutting.notifications.wastage_variance.title':
      'Cutting wastage at {wastagePct}% against a {threshold}% threshold',
    'commercial.notifications.ud_overdrawn.title':
      'UD {udNumber} is overdrawn on {itemRef} by {shortfall} — duty exposure',

    // ── 11.1 Commercial finance ──
    'finance.notifications.cash_shortfall.title':
      'Cash goes negative in the week of {week} — {inflow} in against {outflow} out ({currency})',

    // ── 7.1 Quality ──
    'quality.notifications.repeat_defect.title':
      '{code} at {operation} — {days} days running, through {through}',

    // ── 9.1 Machines & tickets ──
    'maintenance.notifications.pm_due.title':
      'Preventive maintenance due for {machineType} (due {dueOn}, {daysOverdue} day(s) overdue)',
    'maintenance.notifications.parts_low.title':
      '{name}: {onHand} on hand, minimum is {minLevel}',
    'maintenance.notifications.breakdown_outliers.title':
      'Machines breaking down far more than the rest ({month})',
    'maintenance.notifications.downtime_no_rate.title':
      'No downtime cost for {month}: no line-minute rate is configured',

    // ── 10.2 Compliance ──
    'compliance.notifications.certificate_expiring.title':
      '{kind} certificate expires on {expiresOn} ({daysRemaining} day(s) left)',
    'compliance.notifications.certificate_expired.title':
      '{kind} certificate EXPIRED on {expiresOn}',
    'compliance.notifications.cap_escalated.title':
      '{severity} corrective action is {status}, due {deadline}',


    // ── Refusals, every module ──────────────────────────────────────────────
    //
    // Every `messageKey` a service can throw has a sentence here. Without one the screen
    // renders the key itself — `conflict: shipment.errors.doc_needs_file` — which is not a
    // crash and is not wrong, but it is a dotted identifier where an explanation should be,
    // and it teaches people that the system talks to itself in front of them.
    //
    // These say what happened and what to do about it. They do NOT interpolate the values
    // in `AppError.details`: only `Error.message` survives a server-action boundary, so a
    // template with a live `{placeholder}` in it would reach the reader unfilled. Naming
    // the value needs actions to return a typed failure rather than throw — a larger change
    // than this catalogue. `commit-handlers.test.ts`' sibling, `i18n.test.ts`, fails if a
    // service gains a key with no copy here.
    'errors.confidence_required':
      'An AI-authored draft has to carry a confidence for every field it filled — a draft without one cannot be reviewed for how hard to look at it.',
    'errors.invalid_tenant_scope':
      'That request is not scoped to a company, so it was refused rather than run against everything.',
    'orders.errors.breakdown_outside_tolerance':
      'This breakdown is outside the quantity tolerance the buyer accepts. Shipping short against an agreed band is a claim, not a rounding difference.',
    'orders.errors.buyer_not_found': 'That buyer no longer exists.',
    'orders.errors.duplicate_breakdown_cell':
      'The same colour and size appears twice in this breakdown. The floor would cut to whichever row it read first.',
    'orders.errors.milestone_already_actualized':
      'That milestone already has an actual date. Recording a second one would move a date the rest of the schedule was rippled from.',
    'orders.errors.milestone_not_found': 'That milestone is not on this order’s TNA.',
    'orders.errors.no_styles':
      'An order needs at least one style — one with none is an order nobody can cost, cut or ship.',
    'orders.errors.order_not_found': 'That order no longer exists.',
    'orders.errors.po_draft_insert_only':
      'An order drafted from a PO is created, not edited. Amending a confirmed order is a revision with its own trail.',
    'orders.errors.style_not_found': 'That style is not on this order.',
    'orders.errors.template_invalid': 'That TNA template cannot be read as it stands.',
    'orders.errors.template_not_found': 'That TNA template no longer exists.',
    'orders.errors.tna_template_unschedulable':
      'This template cannot be scheduled — its dependencies do not resolve into an order of work.',

    'approvals.errors.auto_approve_needs_floor':
      'An auto-approve rule needs a confidence floor — without one it would commit anything the extractor produced.',
    'approvals.errors.draft_not_found': 'That draft no longer exists.',
    'approvals.errors.no_required_roles':
      'This rule names no approving role, so nobody could ever action it.',
    'approvals.errors.rules_are_owner_only': 'Only an owner changes who approves what.',
    'buyers.errors.buyer_not_found': 'That buyer no longer exists.',
    'buyers.errors.invalid': 'That does not fit what a buyer record accepts.',
    'buyers.errors.lead_is_lost':
      'This lead was marked lost. Reopening it is a new lead, not an edit to this one.',
    'buyers.errors.lead_not_found': 'That lead no longer exists.',
    'buyers.errors.lost_needs_reason':
      'A lost lead needs a stated reason — it is the only thing the next quote can learn from.',
    'buyers.errors.terms_backdated':
      'These terms start before the newest version already on file. Backdating would change which terms governed orders taken in between.',
    'buyers.errors.terms_draft_insert_only':
      'Terms are versioned, never edited: the AQL gate and the shipping tolerance read them by date.',
    'commercial.errors.bank_docs_invalid': 'That does not fit what a bank submission accepts.',
    'commercial.errors.btb_currency_mismatch':
      'A back-to-back credit must be in the same currency as its master — the headroom cannot be compared otherwise.',
    'commercial.errors.charge_needs_parent':
      'A bank charge has to belong to an LC or a submission.',
    'commercial.errors.discrepancy_needs_notes':
      'A discrepancy needs its notes — they are what the bank is being answered with.',
    'commercial.errors.invalid_period': 'That period is not a valid one.',
    'commercial.errors.lc_not_amendable': 'This LC is not in a state that accepts an amendment.',
    'commercial.errors.lc_not_found': 'That letter of credit no longer exists.',
    'commercial.errors.lc_number_exists':
      'A letter of credit with that number is already recorded.',
    'commercial.errors.no_btb_limit':
      'No back-to-back limit is set on the master LC, so there is no headroom to draw against.',
    'commercial.errors.no_invoiced_amount':
      'Nothing has been invoiced against this, so there is nothing to realize.',
    'commercial.errors.reconciliation_exists':
      'This UD has already been reconciled for that period.',
    'commercial.errors.shortfall_needs_reason':
      'A realization short of the invoice needs a stated reason.',
    'commercial.errors.submission_not_found': 'That bank submission no longer exists.',
    'commercial.errors.submitted_needs_date': 'A submitted set needs the date it went to the bank.',
    'commercial.errors.ud_draft_insert_only':
      'A UD is recorded once. Amending one is a fresh declaration, not an edit.',
    'commercial.errors.ud_items_invalid':
      'This UD’s authorised items cannot be read against the current schema, so no balance can be computed from it.',
    'commercial.errors.ud_not_found': 'That utilization declaration no longer exists.',
    'commercial.errors.ud_not_short': 'This UD is not short, so there is nothing to reconcile.',
    'commercial.errors.ud_number_exists':
      'A UD with that number is already recorded. Two rows for one declaration double-count the bonded balance.',
    'compliance.errors.audit_not_found': 'That audit no longer exists.',
    'compliance.errors.cap_closed': 'That corrective action is already closed.',
    'compliance.errors.cap_not_found': 'That corrective action no longer exists.',
    'compliance.errors.empty_evidence':
      'Evidence needs a file or a description — an empty entry closes a finding on nothing.',
    'compliance.errors.finding_not_found': 'That finding no longer exists.',
    'compliance.errors.invalid': 'That does not fit what this compliance record accepts.',
    'compliance.errors.not_a_closer': 'Your role does not close corrective actions.',
    'compliance.errors.self_certification':
      'The person who raised or actioned this cannot also verify it closed.',
    'costing.errors.below_floor_needs_owner':
      'This sheet is below the margin floor. Only an owner approves quoting under it.',
    'costing.errors.bom_not_found': 'That bill of materials no longer exists.',
    'costing.errors.no_approved_sheet': 'No approved cost sheet exists for this style.',
    'costing.errors.no_bom_for_style':
      'This style has an approved cost sheet with no bill of materials behind it, so nothing can size a requisition from it.',
    'costing.errors.sheet_not_found': 'That cost sheet no longer exists.',
    'costing.errors.sheet_stale':
      'This sheet has changed since it was opened. Reload it before approving — you would be signing a different set of numbers.',
    'costing.errors.sheet_uncomputable':
      'This sheet cannot be computed as it stands. Something it needs is missing rather than wrong.',
    'costing.errors.template_not_found': 'That consumption template no longer exists.',
    'cutting.errors.bundle_not_found': 'That bundle no longer exists.',
    'cutting.errors.bundles_already_generated': 'Bundles have already been generated for this lay.',
    'cutting.errors.lay_not_found': 'That lay no longer exists.',
    'cutting.errors.marker_code_exists': 'A marker with that code is already registered.',
    'cutting.errors.marker_draft_insert_only':
      'A changed marker is a new marker: lays already spread against this one were cut to its ratio.',
    'cutting.errors.marker_not_found': 'That marker no longer exists.',
    'cutting.errors.no_breakdown':
      'This style has no colour and size breakdown, so a cut cannot be checked against what the buyer ordered.',
    'cutting.errors.no_cut_lays': 'Nothing has been cut against this order yet.',
    'cutting.errors.report_not_found': 'That cut report no longer exists.',
    'cutting.errors.style_not_found': 'That style is not on this order.',
    'cutting.errors.uncomputable': 'There is not enough recorded yet to compute that.',
    'errors.commit_failed': 'The change could not be committed. Nothing was written.',
    'errors.confidence_out_of_range': 'A confidence must be between 0 and 1.',
    'errors.document_not_found': 'That document no longer exists.',
    'errors.document_not_uploaded':
      'The file never finished uploading, so there is nothing to attach.',
    'errors.document_quarantined': 'That file was quarantined and cannot be used.',
    'errors.document_size_invalid':
      'The file size does not match what was reserved for it — upload it again.',
    'errors.document_too_large': 'That file is larger than the limit.',
    'errors.document_type_not_allowed':
      'That kind of file is not accepted. PDFs, images, spreadsheets and Word documents are.',
    'errors.empty_update': 'Nothing was changed, so nothing was saved.',
    'errors.forbidden': 'Your role does not allow this.',
    'errors.illegal_transition': 'That status cannot follow the current one.',
    'errors.invalid_identifier':
      'This draft carries a field the target table has no column for, so it cannot be written. Its module needs to own the commit.',
    'errors.not_an_approver': 'You are not one of the approvers this change requires.',
    'errors.payload_invalid':
      'Some of what was entered does not fit what this record accepts. Nothing was saved.',
    'errors.pending_change_not_found': 'That draft no longer exists.',
    'errors.pending_change_not_pending': 'That draft has already been decided.',
    'errors.sync_batch_too_large': 'That offline batch is too large to sync in one go.',
    'errors.sync_failed': 'The offline batch did not sync. Nothing in it was applied.',
    'errors.sync_operation_unknown':
      'The server does not recognise this kind of entry. The device app is probably newer than the server — tell whoever runs the system.',
    'errors.sync_role_forbidden':
      'This entry needs a role this account does not hold. It stays queued on the device — ask a supervisor to grant the role, then sync again.',
    'errors.target_id_mismatch': 'This draft points at a different row than the one being changed.',
    'errors.target_not_registered': 'That module does not allow drafts against this table.',
    'errors.target_row_not_found': 'The row this draft was meant to change no longer exists.',
    'errors.unauthenticated': 'You are signed out. Sign in again — nothing was saved.',
    'errors.unknown_module': 'That module is not registered.',
    'errors.unknown_schema': 'That draft names a shape this module does not define.',
    'finance.errors.no_accrual': 'Nothing has accrued against this yet.',
    'finance.errors.no_margin_basis':
      'No approved cost sheet stands behind this order, so there is no margin to measure against.',
    'finance.errors.order_not_found': 'That order no longer exists.',
    'finance.errors.payable_already_settled':
      'This payable has already been settled. Paying it twice is a second payment, not a correction.',
    'finance.errors.payable_not_found': 'That payable no longer exists.',
    'finance.errors.pieces_required': 'A per-piece figure needs the piece count it is per.',
    'finance.errors.receivable_already_settled': 'This receivable has already been settled.',
    'finance.errors.receivable_not_found': 'That receivable no longer exists.',
    'finance.errors.uncomputable': 'There is not enough recorded yet to compute that.',
    'gates.btb_headroom.no_btb':
      'No back-to-back credit is linked, and an import PO cannot be issued without one — the factory would be committed to a supplier with nothing funding it.',
    'gates.exp_number.missing':
      'No EXP number on this shipment. Bangladesh Bank requires one before documents can be presented, so the handoff is blocked rather than delayed.',
    'maintenance.errors.invalid': 'That does not fit what this maintenance record accepts.',
    'maintenance.errors.part_not_found': 'That spare part is not in the store.',
    'maintenance.errors.ticket_not_found': 'That ticket no longer exists.',
    'marbim.errors.context_required':
      'This kind of document needs something the paper does not carry — choose it before sending.',
    'marbim.errors.context_unknown':
      'That choice is not one of yours. Pick from the list rather than an id.',
    'marbim.errors.invalid': 'That does not fit what MARBIM accepts here.',
    'marbim.errors.job_not_found': 'That extraction no longer exists.',
    'marbim.errors.job_rejected':
      'That extraction was rejected and will not be retried — what it read did not fit the target.',
    'marbim.errors.rate_limited':
      'Too many documents have been sent for reading in the last hour. Try again shortly.',
    'marbim.errors.target_not_registered':
      'That module does not allow drafts against this table, so nothing read from a document could ever land there.',
    'marbim.errors.unknown_intake_kind': 'That is not a kind of document MARBIM knows how to file.',
    'marbim.errors.unknown_module': 'That module is not registered.',
    'memory.errors.embedding_width':
      'That embedding is the wrong width to compare against the ones on file.',
    'memory.errors.empty_source_bom':
      'The order being copied from has a bill of materials with no lines.',
    'memory.errors.invalid': 'That does not fit what this record accepts.',
    'memory.errors.no_fingerprint':
      'This style has no fingerprint yet, so it cannot be matched against past ones.',
    'memory.errors.no_outcome':
      'This order has no recorded outcome, so there is nothing for a future quote to learn from it.',
    'memory.errors.no_source_bom': 'The order being copied from has no bill of materials.',
    'memory.errors.note_window_closed':
      'The window for a close-out note on this order has passed. What was written stands.',
    'memory.errors.order_not_found': 'That order no longer exists.',
    'memory.errors.outcome_not_found': 'No outcome has been recorded for that order.',
    'memory.errors.rfq_not_found': 'That RFQ no longer exists.',
    'memory.errors.source_style_not_found': 'That style is not on record.',
    'planning.errors.allocation_done':
      'That allocation is finished. Moving it now would restate capacity the floor has already used.',
    'planning.errors.allocation_not_found': 'That allocation no longer exists.',
    'planning.errors.line_inactive': 'That line is not active.',
    'planning.errors.line_not_found': 'That line no longer exists.',
    'planning.errors.no_manpower':
      'That line has no manpower recorded for the day, so its capacity cannot be computed.',
    'planning.errors.no_shift_for_day': 'That line has no shift on the calendar for that day.',
    'planning.errors.no_smv':
      'This style has no SMV on record. Planning it would mean inventing one, and an invented SMV is how a factory commits to a date it cannot make.',
    'planning.errors.scenario_empty': 'That scenario changes nothing.',
    'planning.errors.scenario_no_longer_fits':
      'The board has moved since this scenario was forked, and it no longer fits. Fork a fresh one rather than applying this over the top.',
    'planning.errors.scenario_not_found': 'That scenario no longer exists.',
    'planning.errors.smv_draft_insert_only':
      'A restudy is a new SMV record, not an edit — the older figures are the variance history.',
    'planning.errors.uncomputable': 'There is not enough recorded yet to compute that.',
    'procurement.errors.no_btb_limit':
      'No back-to-back limit is set, so there is no headroom for this import order.',
    'procurement.errors.no_quotes':
      'No quotes have been recorded against this requisition, so there is nothing to compare.',
    'procurement.errors.po_line_not_found': 'That purchase order line no longer exists.',
    'procurement.errors.po_not_found': 'That purchase order no longer exists.',
    'procurement.errors.pr_draft_insert_only':
      'A requisition is raised, not edited through the approve inbox.',
    'procurement.errors.pr_line_not_found': 'That requisition line no longer exists.',
    'procurement.errors.pr_no_exists': 'A requisition with that number already exists.',
    'procurement.errors.pr_not_found': 'That purchase requisition no longer exists.',
    'procurement.errors.quote_draft_insert_only':
      'A revised quote is a new quote — rewriting one would change the comparison a PO was awarded on.',
    'procurement.errors.supplier_code_exists': 'A supplier with that code is already registered.',
    'procurement.errors.supplier_draft_insert_only':
      'A supplier record is added, not edited through the approve inbox.',
    'procurement.errors.supplier_inactive': 'That supplier is not active.',
    'procurement.errors.supplier_not_found': 'That supplier no longer exists.',
    'procurement.errors.uncomputable':
      'These quotes cannot be compared as they stand — usually a currency with no stated rate.',
    'production.errors.count_exceeds_checked':
      'More pieces were counted than were checked at the endline.',
    'production.errors.downtime_already_closed': 'That stoppage has already been closed.',
    'production.errors.downtime_already_open':
      'This line already has an open stoppage. Close it before opening another.',
    'production.errors.downtime_ends_before_start': 'A stoppage cannot end before it began.',
    'production.errors.downtime_not_found': 'That stoppage no longer exists.',
    'quality.errors.final_inspection_not_found': 'That final inspection no longer exists.',
    'quality.errors.line_not_found': 'That line no longer exists.',
    'quality.errors.no_aql_rows':
      'No AQL table covers a lot of that size, so no sample size can be drawn.',
    'quality.errors.no_inline_checks':
      'Nothing has been checked inline yet, so there is no DHU to report.',
    'quality.errors.spec_not_found': 'No measurement chart is on file for that style.',
    'quality.errors.third_party_already_resulted':
      'That inspection already has a result. A second one is a re-inspection, not an edit.',
    'quality.errors.third_party_not_found': 'That third-party inspection no longer exists.',
    'quality.errors.uncomputable': 'There is not enough recorded yet to compute that.',
    'quality.errors.unknown_defect_codes':
      'Some of those defect codes are not on the factory’s list.',
    'rfq.errors.below_floor_needs_manager':
      'This quote is below the margin floor. A manager has to approve quoting under it.',
    'rfq.errors.below_floor_needs_reason':
      'Quoting below the floor needs a stated reason — it is what a later reader has to judge it by.',
    'rfq.errors.buyer_not_found': 'That buyer no longer exists.',
    'rfq.errors.clarification_already_answered': 'That clarification has already been answered.',
    'rfq.errors.clarification_not_found': 'That clarification no longer exists.',
    'rfq.errors.invalid': 'That does not fit what an RFQ accepts.',
    'rfq.errors.no_live_quote': 'No quotation is live on this RFQ.',
    'rfq.errors.not_found': 'That RFQ no longer exists.',
    'rfq.errors.quote_not_draft':
      'That quotation has already been sent. Changing it now is a revision, not an edit.',
    'rfq.errors.quote_not_found': 'That quotation no longer exists.',
    'rfq.errors.sheet_does_not_reconcile':
      'This quote does not reconcile with the cost sheet behind it.',
    'rfq.errors.sheet_has_no_margin_basis':
      'The cost sheet behind this quote has no margin basis, so there is nothing to check the price against.',
    'rfq.errors.unknown_loss_reason': 'That is not one of the recorded reasons for losing an RFQ.',
    'sampling.errors.feedback_draft_insert_only':
      'A verdict records what the buyer said. Editing one rewrites history the PP gate already acted on.',
    'sampling.errors.invalid': 'That does not fit what a sample record accepts.',
    'sampling.errors.mixed_cost_currencies':
      'These sample costs are in different currencies and cannot be totalled without a stated rate.',
    'sampling.errors.order_not_found': 'That order no longer exists.',
    'sampling.errors.request_closed': 'That sample request is closed.',
    'sampling.errors.request_draft_insert_only':
      'A sample request is raised, not edited through the approve inbox.',
    'sampling.errors.request_not_found': 'That sample request no longer exists.',
    'sampling.errors.stage_not_forward':
      'Sample stages move forward only. A sample back in pattern is a remake, which is a new request.',
    'settings.errors.disable_needs_note': 'Turning that off needs a note saying why.',
    'settings.errors.invalid_policy': 'That policy value is not one this setting accepts.',
    'settings.errors.last_owner': 'A company must keep at least one owner.',
    'settings.errors.not_a_member': 'That person is not a member of this company.',
    'settings.errors.policy_is_admin_only': 'Only an admin or owner changes that policy.',
    'settings.errors.role_not_held': 'They do not hold that role.',
    'shipment.errors.carton_already_loaded': 'That carton is already loaded on a shipment.',
    'shipment.errors.carton_draft_insert_only':
      'A carton is opened and repacked on the floor, not edited in a queue — the packing list and the shipped quantity are both derived from these rows.',
    'shipment.errors.carton_not_found': 'That carton no longer exists.',
    'shipment.errors.carton_wrong_order': 'That carton was packed against a different order.',
    'shipment.errors.doc_needs_file':
      'A document cannot be marked ready without the file itself — “bill of lading ready” with no bill of lading is how a presentation reaches the bank counter incomplete.',
    'shipment.errors.doc_not_on_checklist': 'That document is not on this shipment’s checklist.',
    'shipment.errors.docs_not_ready':
      'Some documents on the checklist are still pending. The bank is presented the whole set or none of it.',
    'shipment.errors.exp_already_set':
      'This shipment already has an EXP number. The bank issues one per shipment, so a different one is either a typo needing a trail or another shipment’s number.',
    'shipment.errors.invalid': 'That does not fit what this shipment record accepts.',
    'shipment.errors.lc_not_found': 'That letter of credit no longer exists.',
    'shipment.errors.no_cartons': 'Nothing has been packed against this order yet.',
    'shipment.errors.no_cartons_loaded': 'No cartons are loaded on this shipment.',
    'shipment.errors.no_checklist':
      'This shipment has no document checklist yet. Build it from the LC first.',
    'shipment.errors.no_doc_kinds':
      'The LC lists no required documents and none were supplied, so an empty checklist would leave the EXP number as the only thing between this shipment and the bank.',
    'shipment.errors.no_lc_on_shipment':
      'No letter of credit is linked to this shipment, so there is no tolerance band to check against.',
    'shipment.errors.no_order_styles':
      'That order has no styles, so nothing can be packed against it.',
    'shipment.errors.nothing_to_waive': 'There is no failed final inspection to waive.',
    'shipment.errors.order_not_found': 'That order no longer exists.',
    'shipment.errors.packing_list_has_mismatches':
      'This list does not match the buyer’s grid. It can be approved, but only knowingly.',
    'shipment.errors.packing_list_not_found': 'That packing list no longer exists.',
    'shipment.errors.packing_list_stale':
      'Cartons have changed since this list was generated. Regenerate it before locking — you would be locking a list that no longer matches the boxes.',
    'shipment.errors.shipment_already_departed':
      'These goods are already ex-factory. The manifest is what left, and adding to it now would change a document already presented.',
    'shipment.errors.shipment_not_found': 'That shipment no longer exists.',
    'shipment.errors.tolerance_not_breached':
      'The shipped quantity is inside the LC’s tolerance, so there is nothing to override.',
    'shipment.errors.waiver_needs_commercial':
      'Only commercial or an owner waives a failed final inspection.',
    'shipment.errors.waiver_needs_reason':
      'Waiving a failed inspection needs a stated reason — it is the entire justification a later auditor has.',
    'store.errors.adjustment_below_zero': 'That adjustment would take stock below zero.',
    'store.errors.bom_item_unknown': 'That item is not on the style’s bill of materials.',
    'store.errors.bonded_requires_ud':
      'Bonded material must be issued against a utilization declaration. Issuing without one is a customs exposure, not a paperwork slip.',
    'store.errors.exceeds_requisition': 'That is more than the requisition asked for.',
    'store.errors.grn_not_found': 'That goods receipt no longer exists.',
    'store.errors.item_not_found': 'That item is not in the store.',
    'store.errors.item_not_requisitioned':
      'That item is not on the requisition being issued against.',
    'store.errors.requisition_has_no_lines': 'That requisition has no lines.',
    'store.errors.roll_item_mismatch': 'That roll is a different item to the one being issued.',
    'store.errors.roll_not_found': 'That roll no longer exists.',
    'store.errors.roll_not_in_stock': 'That roll is not in stock.',
    'store.errors.unit_mismatch': 'The unit does not match the one this item is held in.',
    'workforce.errors.gazette_draft_insert_only':
      'A gazette is superseded, never edited — rewriting rates would change what people were told they were paid.',
    'workforce.errors.gazette_has_no_grades':
      'That gazette has no grade table, so a payroll computed against it would pay nothing.',
    'workforce.errors.gazette_not_found': 'That wage gazette no longer exists.',
    'workforce.errors.gazette_superseded': 'That gazette has been superseded.',
    'workforce.errors.no_active_gazette':
      'No wage gazette is active for that period, so there are no rates to compute against.',
    'workforce.errors.payroll_compute_failed':
      'Payroll could not be computed. Nothing was written.',
    'workforce.errors.run_not_found': 'That payroll run no longer exists.',
    'workforce.errors.run_not_recomputable':
      'That run has been approved. A correction is an adjustment in the next period, not a rewrite of a paid figure.',

    // ── 3.2 Procurement ──
    'procurement.notifications.over_receipt.title':
      'Over-receipt: {receivedQty} received against {orderedQty} ordered ({overReceiptQty} over, allowance {tolerancePct}%)',

    // ── 9.1 Maintenance · what a refused action says ──
    // These are the errors a screen can actually put in front of somebody. Without an entry
    // the raw key renders, which is what these two screens were doing.
    'maintenance.errors.serial_exists':
      'A machine with that serial is already registered. Two rows for one machine split its service history, so check the registry before adding it again.',
    'maintenance.errors.machine_not_found': 'That machine is no longer in the registry.',
    'maintenance.errors.line_not_found': 'That line no longer exists.',
    'maintenance.errors.schedule_not_found': 'That maintenance schedule no longer exists.',
    'maintenance.errors.schedule_type_mismatch':
      'That checklist belongs to a different type of machine. Signing it off here would record a service that did not happen.',
  },

  bn: {
    // ── core ──
    'notifications.system.welcome.title': 'FabricXAI-তে স্বাগতম',
    'notifications.system.test.title': 'পরীক্ষামূলক নোটিফিকেশন',
    'notifications.approve.waiting.title': '{count}টি পরিবর্তন আপনার অনুমোদনের অপেক্ষায়',
    'notifications.lc.expiry_near.title': 'LC {lcNumber} শেষ হবে {date} তারিখে',
    'core.notifications.jobs_silent.title':
      'নির্ধারিত জব বন্ধ হয়ে গেছে: {staleCount}টি নীরব, {stuckCount}টি আটকে আছে',

    // ── 1.3 ──
    // The floor says these terms in English anyway (PP, QA, ex-factory), so the
    // Bangla keeps them rather than inventing translations nobody uses out loud.
    'orders.milestones.order_confirmed': 'পিও গৃহীত',
    'orders.milestones.yarn_booking': 'সুতা বুকিং',
    'orders.milestones.yarn_in_house': 'সুতা ইন-হাউস',
    'orders.milestones.knitting': 'নিটিং সম্পন্ন · গ্রেইজ',
    'orders.milestones.fabric_booking': 'ফ্যাব্রিক বুকিং',
    'orders.milestones.lab_dip_approval': 'ল্যাব ডিপ অনুমোদিত',
    'orders.milestones.fabric_in_house': 'ফ্যাব্রিক ইন-হাউস',
    'orders.milestones.trims_in_house': 'ট্রিমস ইন-হাউস',
    'orders.milestones.hardware_in_house': 'হার্ডওয়্যার ইন-হাউস',
    'orders.milestones.pp_sample_submit': 'পিপি স্যাম্পল জমা',
    'orders.milestones.pp_approval': 'পিপি স্যাম্পল অনুমোদিত',
    'orders.milestones.cutting': 'কাটিং শুরু',
    'orders.milestones.sewing_start': 'সিউইং শুরু',
    'orders.milestones.sewing_end': 'সিউইং সম্পন্ন',
    'orders.milestones.linking': 'লিংকিং সম্পন্ন',
    'orders.milestones.finishing': 'ফিনিশিং ও প্যাকিং',
    'orders.milestones.final_inspection': 'ফাইনাল ইন্সপেকশন · বায়ার কিউএ',
    'orders.milestones.ex_factory': 'এক্স-ফ্যাক্টরি',

    'orders.notifications.milestone_at_risk.title': '{milestone} ঝুঁকিতে আছে',
    'orders.notifications.milestone_at_risk.body':
      '{milestone}-এর পরিকল্পিত তারিখ ছিল {plannedDate}, এখনও শেষ হয়নি।',
    'orders.notifications.milestone_late.title': '{milestone} দেরি হয়ে গেছে',
    'orders.notifications.milestone_late.body':
      '{milestone}-এর তারিখ ছিল {plannedDate}, এখনও সম্পন্ন হিসেবে রেকর্ড হয়নি।',

    // ── 2.1 ──
    'commercial.notifications.lc_countdown_latest_shipment.title':
      'LC {lcNumber}: শেষ শিপমেন্টের ({date}) বাকি {daysLeft} দিন',
    'commercial.notifications.lc_countdown_expiry.title':
      'LC {lcNumber}: মেয়াদ শেষের ({date}) বাকি {daysLeft} দিন',
    'commercial.lc.conflict.expiry': 'LC {lcNumber}-এর মেয়াদ শিপমেন্টের আগেই শেষ হয়ে যাবে',
    'commercial.lc.conflict.latest_shipment':
      'LC {lcNumber}-এর শেষ শিপমেন্ট তারিখ পরিকল্পিত ex-factory তারিখের আগে',
    'commercial.lc.conflict.presentation_window':
      'LC {lcNumber}-এ শিপমেন্টের পর ডকুমেন্ট জমা দেওয়ার সময় খুব কম',
    'commercial.lc.conflict.unknown_ex_factory':
      'LC {lcNumber} এমন একটি অর্ডারের সাথে যুক্ত যার ex-factory তারিখ নেই',

    // ── 2.2 ──
    'commercial.notifications.ud_expiring.title':
      'UD {udNumber}-এর মেয়াদ {validUntil} তারিখে শেষ ({daysLeft} দিন বাকি)',
    'commercial.notifications.ud_low_balance.title': 'UD {udNumber}: {itemRef} প্রায় শেষ',
    'commercial.notifications.ud_reconciliation_due.title':
      '{period} মাসের UD মিলকরণ বাকি আছে',

    // ── Gates ──
    'gates.fabric_inspection.not_inspected':
      'এই রোলগুলোর ৪-পয়েন্ট ইন্সপেকশন এখনও হয়নি: {rolls}',
    'gates.fabric_inspection.failed':
      'এই রোলগুলো ৪-পয়েন্ট ইন্সপেকশনে ফেল করেছে ({pointsPer100SqYd} পয়েন্ট/১০০ বর্গগজ): {rolls}',
    'gates.fabric_inspection.roll_not_found':
      'একটি রোল যাচাই করা যায়নি ({expected} টির মধ্যে {found} টি পাওয়া গেছে)',
    'gates.fabric_inspection.no_provider':
      'ফেব্রিক ইন্সপেকশন এখন যাচাই করা যাচ্ছে না, তাই ইস্যু আটকানো হয়েছে',

    // ── 6.1 ──
    'production.notifications.partition_default.title':
      'প্রোডাকশন এন্ট্রি ডিফল্ট পার্টিশনে জমা হচ্ছে',
    'production.notifications.run_rate_at_risk.title':
      '{poNumber} এর সেলাই শেষ হবে {forecastDate}, {milestoneDate} এর {slipDays} দিন পরে — দৈনিক {ratePerDay} হারে',

    // ── বিভাগ-পারাপার খবর ──
    'quality.notifications.fabric_rejected.title':
      'একটি রোল ৪-পয়েন্ট ইন্সপেকশনে ফেল ({pointsPer100SqYd}, সীমা {threshold}) — ইস্যু করা যাবে না',
    'quality.notifications.final_failed.title':
      '{lotQty} পিসের লট ফাইনাল ইন্সপেকশনে ফেল ({sampleSize} নমুনা) — শিপ হবে না',
    'quality.notifications.measurement_failed.title':
      '{sampledSize} সাইজ বায়ারের টলারেন্সের বাইরে',
    'shipment.notifications.exp_missing.title':
      'EXP নম্বর নেই — ব্যাংকে ডকুমেন্ট জমা আটকে গেছে',
    'shipment.notifications.tolerance_breach.title':
      'LC টলারেন্স {tolerancePct}% এর বিপরীতে {varianceQty} {direction}',
    'costing.notifications.below_floor.title':
      '{styleCode} অনুমোদিত {achievedMarginPct}% মার্জিনে, ফ্লোর {floorPct}% এর নিচে',
    'cutting.notifications.wastage_variance.title':
      'কাটিং অপচয় {wastagePct}%, সীমা {threshold}%',
    'commercial.notifications.ud_overdrawn.title':
      'UD {udNumber} এ {itemRef} {shortfall} পরিমাণ ওভারড্র — শুল্ক ঝুঁকি',

    // ── 11.1 ──
    'finance.notifications.cash_shortfall.title':
      '{week} সপ্তাহে নগদ ঘাটতি — {inflow} আসছে, {outflow} যাচ্ছে ({currency})',

    // ── 7.1 ──
    'quality.notifications.repeat_defect.title':
      '{operation} এ {code} — টানা {days} দিন, {through} পর্যন্ত',

    // ── 9.1 ──
    'maintenance.notifications.pm_due.title':
      '{machineType} মেশিনের PM বাকি (তারিখ {dueOn}, {daysOverdue} দিন পার)',
    'maintenance.notifications.parts_low.title':
      '{name}: স্টকে {onHand}টি, সর্বনিম্ন থাকা দরকার {minLevel}টি',
    'maintenance.notifications.breakdown_outliers.title':
      'যে মেশিনগুলো অন্যদের তুলনায় অনেক বেশি নষ্ট হচ্ছে ({month})',
    'maintenance.notifications.downtime_no_rate.title':
      '{month} মাসের ডাউনটাইম খরচ হিসাব করা যায়নি: লাইন-মিনিটের রেট সেট করা নেই',

    // ── 10.2 ──
    'compliance.notifications.certificate_expiring.title':
      '{kind} সার্টিফিকেটের মেয়াদ {expiresOn} তারিখে শেষ ({daysRemaining} দিন বাকি)',
    'compliance.notifications.certificate_expired.title':
      '{kind} সার্টিফিকেটের মেয়াদ {expiresOn} তারিখে শেষ হয়ে গেছে',
    'compliance.notifications.cap_escalated.title':
      '{severity} সংশোধনী ব্যবস্থা এখনও {status}, শেষ তারিখ {deadline}',

    // ── 3.2 Procurement ──
    'procurement.notifications.over_receipt.title':
      'অতিরিক্ত গ্রহণ: {orderedQty}-এর বিপরীতে {receivedQty} এসেছে ({overReceiptQty} বেশি, ছাড় {tolerancePct}%)',

    // ── 9.1 Maintenance · what a refused action says ──
    'maintenance.errors.serial_exists':
      'এই সিরিয়ালের মেশিন আগেই নিবন্ধিত আছে। দুটি সারি হলে সার্ভিস ইতিহাস ভাগ হয়ে যায় — যোগ করার আগে রেজিস্ট্রি দেখে নিন।',
    'maintenance.errors.machine_not_found': 'এই মেশিনটি আর রেজিস্ট্রিতে নেই।',
    'maintenance.errors.line_not_found': 'এই লাইনটি আর নেই।',
    'maintenance.errors.schedule_not_found': 'এই রক্ষণাবেক্ষণ সূচিটি আর নেই।',
    'maintenance.errors.schedule_type_mismatch':
      'এই চেকলিস্ট অন্য ধরনের মেশিনের। এখানে সই করলে যে সার্ভিস হয়নি তা রেকর্ড হয়ে যাবে।',
  },
}

const PLACEHOLDER = /\{(\w+)\}/g

/**
 * Render a key.
 *
 * Substitution is a SINGLE pass over the template, so a parameter whose value happens to
 * contain `{something}` is inserted literally rather than substituted again. A machine
 * serial or a note pasted from elsewhere can contain anything, and a second pass would let
 * one parameter reach into another.
 */
export function t(
  locale: Locale,
  key: string,
  params: Readonly<Record<string, unknown>> = {},
  catalogue: Catalogue = MESSAGES,
): string {
  const template = catalogue[locale]?.[key] ?? catalogue[DEFAULT_LOCALE]?.[key]

  // Not an empty string: an empty subject reads as a broken mail server, and the key reads
  // as what it is.
  if (template === undefined) return key

  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name]
    // `undefined` means the caller did not supply it. Leaving the placeholder visible keeps
    // that a developer's bug rather than making it the reader's problem.
    if (value === undefined || value === null) return whole
    return String(value)
  })
}

/** A user's locale, or the default. Anything unsupported is the default, never a crash. */
export function resolveLocale(locale: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(locale ?? '') ? (locale as Locale) : DEFAULT_LOCALE
}

/**
 * Which of these keys the catalogue does not define.
 *
 * Used by the delivery job to REPORT a gap rather than quietly mailing somebody a dotted
 * key. A message that goes out wrong is a problem twice: once when it is read, and again
 * because nobody knew it happened.
 */
export function missingKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].filter((key) => MESSAGES[DEFAULT_LOCALE][key] === undefined).sort()
}
