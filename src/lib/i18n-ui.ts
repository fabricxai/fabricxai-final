/**
 * Screen copy, in both languages.
 *
 * `lib/i18n.ts` is the resolver and the catalogue for what the SYSTEM emits — notification
 * titles, error sentences, the things that leave as email. This file is the catalogue for
 * what the SCREENS say: headings, button labels, column names, the empty-state sentence a
 * storekeeper reads when a rack has nothing on it.
 *
 * Split from that file rather than merged into it because the two have different readers and
 * different review needs. A notification is read once, cold, by somebody who is not looking
 * at the app; screen copy is read a hundred times a shift by somebody who already knows
 * where they are. They are also enforced differently: every error key must have a thrower
 * (`error-copy.test.ts`), and every screen key must have BOTH locales (`i18n-ui.test.ts`).
 * The resolver, and therefore the fallback behaviour, is shared — `tui` is `t` with this
 * catalogue bound, so a missing Bangla key falls back to English and a missing key renders
 * as itself, greppably, exactly as it does for notifications.
 *
 * ## Why this exists at all
 *
 * Every screen in the product was written in hardcoded English. That is fine for the office
 * and useless on the floor: the storekeeper at the delivery bay, the cutter at the table,
 * the line supervisor entering hourly output and the mechanic closing a ticket all read
 * Bangla. Twelve routes are floor-facing, and they were unusable by the people whose work
 * they exist to record.
 *
 * ## Writing the Bangla
 *
 * Plainer than the English on purpose, and it keeps the terms a Bangladeshi garment factory
 * uses in English anyway — LC, UD, GRN, PP, challan, roll, lot, ex-factory. Translating
 * "challan" to a Bangla coinage nobody says at the rack would be a worse screen, not a more
 * Bangla one.
 *
 * ## Keys
 *
 * `ui.<area>.<thing>`. `area` is the module or the shared surface (`common`, `boundary`,
 * `nav`). Sorted within each area so a gap is visible rather than discoverable.
 */
import { MESSAGES, t, type Catalogue, type Locale } from './i18n'

export const UI_MESSAGES: Catalogue = {
  en: {
    // ── common · used on every screen ──
    'ui.common.add': 'Add',
    'ui.common.all': 'All',
    'ui.common.attach': 'Attach',
    'ui.common.cancel': 'Cancel',
    'ui.common.clear': 'Clear',
    'ui.common.close': 'Close',
    'ui.common.confirm': 'Confirm',
    'ui.common.dismiss': 'Dismiss',
    'ui.common.loading': 'Loading',
    'ui.common.nothing_yet': 'Nothing yet',
    'ui.common.of': 'of',
    'ui.common.optional': 'optional',
    'ui.common.remove': 'Remove',
    'ui.common.required': 'required',
    'ui.common.retry': 'Try again',
    'ui.common.save': 'Save',
    'ui.common.saving': 'Saving …',
    'ui.common.search': 'Search',
    'ui.common.submit': 'Submit',
    'ui.common.total': 'Total',

    // ── boundary · what a route says when it breaks or is still arriving ──
    // Deliberately not "Something went wrong". The reader needs to know whether their work
    // was saved, and what to do next; a shrug tells them neither.
    'ui.boundary.error_title': 'This screen did not load',
    'ui.boundary.error_body':
      'Nothing you entered was saved. Try again — if it keeps failing, tell whoever runs the system and say which screen.',
    'ui.boundary.error_digest': 'Reference',
    'ui.boundary.auth_error_title': 'Sign-in could not continue',
    'ui.boundary.auth_error_body': 'Nothing was submitted. Try again.',
    'ui.boundary.board_error_title': 'The board lost its data',
    // A wall display has nobody standing at it, so it says what it is doing rather than
    // asking for a click.
    'ui.boundary.board_error_body': 'Retrying on its own. If this stays up, the server is unreachable.',
    'ui.boundary.not_found_title': 'That record no longer exists',
    'ui.boundary.not_found_body':
      'It may have been deleted, or the link may be old. Go back to the list and open it from there.',
    'ui.boundary.not_found_back': 'Back',

    // ── store · 3.1 ──
    'ui.store.receive_eyebrow': 'Store · receive goods',
    'ui.store.receive_title': 'Receive against a challan',
    'ui.store.receive_meta': 'one GRN per challan · rolls counted at the rack',
    'ui.store.receive_refused_one': '{count} receipt the server refused.',
    'ui.store.receive_refused_other': '{count} receipts the server refused.',
    'ui.store.receive_done': 'Received {list}.',
    'ui.store.receive_done_sent': 'Sent.',
    'ui.store.receive_done_held': 'Held on this device until you are back online.',
    'ui.store.challan_eyebrow': 'Challan',
    'ui.store.challan_heading': 'What arrived',
    'ui.store.challan_attached': 'Challan attached',
    'ui.store.challan_photograph': 'Photograph the challan',
    'ui.store.challan_sending': 'sending…',
    'ui.store.challan_why':
      'the paper is what the supplier invoices against — keep it with the receipt',
    'ui.store.challan_take_photo': 'Take photo',
    'ui.store.challan_replace': 'Replace',
    'ui.store.challan_sending_button': 'Sending…',
    'ui.store.challan_upload_failed': 'the photo could not be sent',
    'ui.store.challan_upload_retryable':
      '{reason} — you can still record the receipt and attach the challan when you are back online',
    'ui.store.field_challan_no': 'Challan no',
    'ui.store.field_received_on': 'Received on',
    'ui.store.field_item': 'Item',
    'ui.store.field_into': 'Into',
    'ui.store.field_qty_on_challan': 'Quantity on the challan ({unit})',
    'ui.store.location_bonded_suffix': ' (bonded)',
    'ui.store.bonded_warning':
      '{code} is a bonded location. Duty-free cloth must be received against a Utilization Declaration — that record belongs to the commercial desk, and this screen cannot raise one.',
    'ui.store.bonded_refused':
      'Bonded receipts must name a Utilization Declaration, and UDs belong to the commercial desk (module 2.2). Receive to a general location, or ask commercial to raise the UD first.',
    'ui.store.rolls_counted_eyebrow': '{count} counted',
    'ui.store.rolls_heading': 'Rolls at the rack',
    'ui.store.rolls_mismatch':
      'The rolls add up to {counted} {unit} against {expected} {unit} on the challan — a difference of {difference}. Recount before receiving; the challan is what the supplier will invoice.',
    'ui.store.roll_no_placeholder': 'roll no',
    'ui.store.roll_lot_placeholder': 'lot',
    'ui.store.roll_dye_lot_placeholder': 'dye lot',
    'ui.store.roll_shade_placeholder': 'shade',
    'ui.store.roll_number_label': 'Roll {index} number',
    'ui.store.roll_qty_label': 'Roll {index} quantity',
    'ui.store.roll_lot_label': 'Roll {index} lot',
    'ui.store.roll_dye_lot_label': 'Roll {index} dye lot',
    'ui.store.roll_shade_label': 'Roll {index} shade group',
    'ui.store.roll_remove_label': 'Remove roll {index}',
    'ui.store.add_roll': '+ Add roll',
    'ui.store.rolls_progress': '{counted} of {expected} {unit} counted',
    'ui.store.rolls_none_yet':
      'stock is roll-level — a receipt with no rolls creates stock nobody can issue',
    'ui.store.receive_button': 'Receive',
    'ui.store.receive_button_one': 'Receive {count} roll',
    'ui.store.receive_button_other': 'Receive {count} rolls',
    // The rest of 3.1 — the stock landing, rolls and lots, issue to production. Alphabetical;
    // the receive keys above stay in screen order because that screen was converted first.
    'ui.store.adjust_button': 'Adjust',
    'ui.store.adjust_drafted':
      '{summary} — sent to the approve inbox. Nothing has changed in the store yet: an adjustment is applied when it is signed, not when it is drafted.',
    'ui.store.adjust_pending_note':
      'Nothing is written now. This goes to the approve inbox, and the count changes only when somebody signs it — writing off stock is writing off money.',
    'ui.store.adjust_refused': 'the draft was refused',
    'ui.store.adjust_submit': 'Send for approval',
    'ui.store.adjust_title': 'Adjust {roll}',
    'ui.store.badge_bonded_no_ud': 'bonded · NO UD',
    'ui.store.badge_bonded_ud': 'bonded · UD drawn',
    'ui.store.badge_general': 'general',
    'ui.store.blocked_suffix': ' · blocked',
    'ui.store.bonded_without_ud_one':
      '{count} bonded receipt has no UD against it. Duty-free fabric must be drawn against a declaration.',
    'ui.store.bonded_without_ud_other':
      '{count} bonded receipts have no UD against them. Duty-free fabric must be drawn against a declaration.',
    'ui.store.cell_difference': 'Difference',
    'ui.store.cell_issuing': 'Issuing',
    'ui.store.cell_required': 'Required',
    'ui.store.cell_system_says': 'System says',
    'ui.store.cell_you_counted': 'You counted',
    'ui.store.col_code': 'Code',
    'ui.store.col_free': 'Free',
    'ui.store.col_item': 'Item',
    'ui.store.col_on_hand': 'On hand',
    'ui.store.col_reserved': 'Reserved',
    'ui.store.col_rolls': 'Rolls',
    'ui.store.dye_label': 'dye {lot}',
    'ui.store.entered_on_device': 'entered on a device',
    'ui.store.field_counted_qty': 'Counted quantity',
    'ui.store.field_reason': 'Reason',
    'ui.store.field_what_happened': 'What happened',
    'ui.store.free_formula': 'free = on hand − reserved · issue against free, never against on hand',
    'ui.store.grns_heading': 'Goods received',
    'ui.store.grns_none': 'No receipts yet.',
    'ui.store.grns_recent_eyebrow': '{count} recent',
    'ui.store.index_eyebrow': 'Store',
    'ui.store.index_meta_over_reserved_one': '{count} over-reserved',
    'ui.store.index_meta_over_reserved_other': '{count} over-reserved',
    'ui.store.index_title_one': '{count} item in stock',
    'ui.store.index_title_other': '{count} items in stock',
    'ui.store.issue_blocked_over_free':
      'This issue is blocked — {issuing} {unit} is more than the {available} {unit} this order may draw. {onHand} {unit} is on hand, and the rest is already promised to other orders. Nothing has been written.',
    'ui.store.issue_bonded_note':
      'Bonded rolls are picked — this issue draws on a customs declaration. The UD balance check lands with module 2.2; until then the draw is recorded but not validated against a UD.',
    'ui.store.issue_button': 'Issue {qty} {unit}',
    'ui.store.issue_button_blocked': 'Blocked — over free stock',
    'ui.store.issue_done': 'Issued {list}.',
    'ui.store.issue_empty_body':
      'An issue is made against a requisition, never against an order directly — that is what stops a cutting table taking another order’s cloth. When merchandising sizes an order, its lines appear here.',
    'ui.store.issue_empty_title': 'No requisition is waiting on the store',
    'ui.store.issue_eyebrow': 'Store · issue to production',
    'ui.store.issue_meta': 'issue against free, never against on hand',
    'ui.store.issue_mixing_shades':
      'You are mixing shade groups {groups} in one lay. Split the lay by shade, or have QC sign the mix — a two-shade garment is found by the buyer.',
    'ui.store.issue_refused_one': '{count} write the server refused.',
    'ui.store.issue_refused_other': '{count} writes the server refused.',
    'ui.store.issue_shortfall':
      'Only {available} {unit} of the {required} {unit} asked for can be drawn. Issue what is here and hold the lay, or have merchandising re-size the order.',
    'ui.store.issue_title_empty': 'Nothing outstanding',
    'ui.store.issue_title_one': '{count} line to issue',
    'ui.store.issue_title_other': '{count} lines to issue',
    'ui.store.lot_label': 'lot {lot}',
    'ui.store.nav_issue': 'Issue to production',
    'ui.store.nav_receive': 'Receive goods',
    'ui.store.nav_rolls': 'Rolls & lots',
    'ui.store.no_shade': 'no shade',
    'ui.store.no_shade_group': 'no shade group',
    'ui.store.note_placeholder': 'Water damage on the outer wraps, cut back to sound cloth.',
    'ui.store.note_too_short': ' — at least 10 characters',
    'ui.store.nothing_in_stock': 'Nothing in stock',
    'ui.store.outstanding_eyebrow': 'Outstanding',
    'ui.store.outstanding_heading': 'Cutting is waiting on',
    'ui.store.over_reserved_alert_one':
      '{count} item is promised to more orders than exist in the store. The shortage is real — better found here than at the cutting table.',
    'ui.store.over_reserved_alert_other':
      '{count} items are promised to more orders than exist in the store. The shortage is real — better found here than at the cutting table.',
    'ui.store.pick_rolls_heading': 'Pick rolls · grouped by shade',
    'ui.store.qty_free': '{qty} free',
    'ui.store.reason_damaged': 'Damaged — water, oil, or handling',
    'ui.store.reason_found': 'Found — stock present that was not recorded',
    'ui.store.reason_miscount': 'Miscount — recount disagrees with the system',
    'ui.store.reason_shortage_on_receipt': 'Short on receipt — challan overstated',
    'ui.store.reason_written_off': 'Written off — nothing recoverable',
    'ui.store.roll_count_one': '{count} roll',
    'ui.store.roll_count_other': '{count} rolls',
    'ui.store.roll_lot_eyebrow': 'Roll · lot',
    'ui.store.rolls_all_heading': 'Every roll, and where it sits',
    'ui.store.rolls_empty_body':
      'Rolls appear here once goods are received. Every quantity in the store is derived from them.',
    'ui.store.rolls_empty_title': 'No rolls to show',
    'ui.store.rolls_eyebrow': 'Store · rolls and lots',
    'ui.store.rolls_in_stock_eyebrow': '{count} in stock',
    'ui.store.rolls_meta_one': '{count} roll · {onHand} {unit} on hand',
    'ui.store.rolls_meta_other': '{count} rolls · {onHand} {unit} on hand',
    'ui.store.rolls_picked_one': '{count} roll picked',
    'ui.store.rolls_picked_other': '{count} rolls picked',
    'ui.store.shade_group_joiner': ' and ',
    'ui.store.shade_label': 'shade {group}',
    'ui.store.shades_count_one': '{count} shade',
    'ui.store.shades_count_other': '{count} shades',
    'ui.store.stock_empty_body':
      'Stock arrives as a GRN against a supplier challan. Bonded fabric is received against a UD, and the two are recorded together.',
    'ui.store.stock_empty_title': 'The store is empty',
    'ui.store.stock_heading': 'Stock',
    'ui.store.sync_held': 'Held on this device until you are back online.',
    'ui.store.sync_sent': 'Sent.',

    // ── cutting · 5.1 ──
    'ui.cutting.blocked_button': 'Blocked — PP approval first',
    'ui.cutting.blocked_suffix': ' · blocked by the PP gate',
    'ui.cutting.bundles_note':
      'bundles are generated from the cut report, and carry the QR the sewing line scans',
    'ui.cutting.col_colour': 'Colour',
    'ui.cutting.col_cut': 'Cut',
    'ui.cutting.col_difference': 'Difference',
    'ui.cutting.col_fabric': 'Fabric',
    'ui.cutting.col_lay': 'Lay',
    'ui.cutting.col_marker_says': 'Marker says',
    'ui.cutting.col_order': 'Order',
    'ui.cutting.col_order_needs': 'Order needs',
    'ui.cutting.col_plies': 'Plies',
    'ui.cutting.col_size': 'Size',
    'ui.cutting.col_status': 'Status',
    'ui.cutting.colour_placeholder': 'Navy',
    'ui.cutting.create_lay_button': 'Create the lay',
    'ui.cutting.cut_cell_label': 'Cut {size}',
    'ui.cutting.eyebrow': 'Cutting',
    'ui.cutting.field_colour': 'Colour',
    'ui.cutting.field_lay_no': 'Lay no',
    'ui.cutting.field_marker': 'Marker',
    'ui.cutting.field_plies': 'Plies',
    'ui.cutting.figure_consumed': 'Consumed',
    'ui.cutting.figure_drawn': 'Drawn',
    'ui.cutting.figure_waste': 'Waste',
    'ui.cutting.from_a_device': 'from a device',
    'ui.cutting.held_offline': 'Held on this device until you are back online.',
    'ui.cutting.lay_consumes_suffix': ', {planned} m consumed by the lay',
    'ui.cutting.lay_empty_body':
      'An order reaches the cutting floor once it is confirmed and in production.',
    'ui.cutting.lay_empty_title': 'No confirmed order is waiting on cutting',
    'ui.cutting.lay_eyebrow': 'Cutting · start a lay',
    'ui.cutting.lay_nothing_title': 'Nothing to cut',
    'ui.cutting.lays_empty_body':
      'A lay is one spread of fabric, cut through many plies at once. Spreading it needs the PP sample approved and the fabric issued — both are checked when you start, not after.',
    'ui.cutting.lays_empty_title': 'No lays spread',
    'ui.cutting.lays_heading': 'Lays',
    'ui.cutting.lays_open_one': '{count} lay open',
    'ui.cutting.lays_open_other': '{count} lays open',
    'ui.cutting.lays_refused_one':
      '{count} lay the server refused — most likely a gate. Nothing was spread.',
    'ui.cutting.lays_refused_other':
      '{count} lays the server refused — most likely a gate. Nothing was spread.',
    'ui.cutting.marker_heading': 'Pick the marker',
    'ui.cutting.marker_plan_note': 'marker plan {planned} m · picked {drawn} m',
    'ui.cutting.markers_released_eyebrow': '{count} released for this style',
    'ui.cutting.meta_blocked': 'blocked',
    'ui.cutting.meters_value': '{value} m',
    'ui.cutting.mixing_shades':
      'You are spreading shade groups {groups} in one lay. Two dye lots in a stack is a garment that leaves with two different navies in it.',
    'ui.cutting.nav_cut_report': 'Cut report',
    'ui.cutting.nav_start_lay': 'Start a lay',
    'ui.cutting.nav_wastage': 'Wastage',
    'ui.cutting.no_marker':
      'No marker exists for {style}. A lay is spread under a marker — the arrangement of pattern pieces that decides what each ply yields — and CAD releases it before cutting can start.',
    'ui.cutting.no_rolls_issued':
      'The store has not issued any fabric against this order — or every issued roll is already on a table. A lay may only draw rolls issued to its own order, so cutting waits on the store.',
    'ui.cutting.not_reported': 'not reported',
    'ui.cutting.order_chip_fallback': 'order',
    'ui.cutting.order_fallback': 'Order',
    'ui.cutting.outside_tolerance':
      '{list} — outside the {tolerance}% tolerance. You can still file this; the variance is recorded against the report and the manager sees it. The pieces are already cut, and refusing to write down what happened does not un-cut them.',
    'ui.cutting.overview_empty_title': 'Nothing spread yet',
    'ui.cutting.pieces_eyebrow': '{count} pieces',
    'ui.cutting.pp_gate_blocked':
      'This style cannot be spread yet — the PP gate is holding it. The buyer signs off one garment before the factory makes eighty thousand. Nothing below will be accepted until that approval is recorded in the sample room.',
    // The gate's own reason key, shown as the code it is rather than as a sentence: these
    // keys live in the system catalogue's gate namespace, and the code is what a supervisor
    // quotes to the sample room when asking why cutting is held.
    'ui.cutting.pp_gate_reason': 'Gate reference: {reason}.',
    'ui.cutting.prereq_eyebrow': 'Before a lay can be spread',
    'ui.cutting.prereq_fabric_body': '— rolls actually left the store against this order',
    'ui.cutting.prereq_fabric_title': 'Fabric issued',
    'ui.cutting.prereq_note': 'both checked server-side · a blocked lay says which one failed',
    'ui.cutting.prereq_pp_body': '— the buyer has signed off one garment before eighty thousand',
    'ui.cutting.prereq_pp_title': 'PP sample approved',
    'ui.cutting.ready_eyebrow': '{count} in production',
    'ui.cutting.ready_heading': 'Ready to cut',
    'ui.cutting.ready_none': 'No confirmed orders with a style yet.',
    'ui.cutting.report_empty_body':
      'A cut report is filed against a lay that is still open. Once it is filed the lay is cut, and restating it later is a correction somebody approves.',
    'ui.cutting.report_empty_title': 'No lay is waiting on a report',
    'ui.cutting.report_eyebrow': 'Cutting · report',
    'ui.cutting.report_eyebrow_hint': 'tap a cell to correct it',
    'ui.cutting.report_filed': 'Filed {summary}.',
    'ui.cutting.report_filed_note':
      'The lay is now cut; changing this number later is a correction a manager approves.',
    'ui.cutting.report_filed_summary': '{layNo} · {count} pieces',
    'ui.cutting.report_footer_note': 'filing closes {layNo} · bundles are generated from this report',
    'ui.cutting.report_heading': 'Cut against plan',
    'ui.cutting.report_meta': '{plies} plies · marker {marker} · tolerance {tolerance}%',
    'ui.cutting.report_nothing_title': 'Nothing to report',
    'ui.cutting.reports_refused_one': '{count} report the server refused.',
    'ui.cutting.reports_refused_other': '{count} reports the server refused.',
    'ui.cutting.rolls_heading': 'Rolls drawn from store',
    'ui.cutting.rolls_issued_eyebrow': '{count} issued to this order',
    'ui.cutting.rolls_on_table_one': '{count} roll · {drawn} m on the table',
    'ui.cutting.rolls_on_table_other': '{count} rolls · {drawn} m on the table',
    'ui.cutting.save_report_button': 'Save the cut report',
    'ui.cutting.sent': 'Sent.',
    'ui.cutting.shade_badge': 'shade {group}',
    'ui.cutting.shade_join': ' and ',
    'ui.cutting.spread_done': 'Spread {list}.',
    'ui.cutting.spread_summary': '{layNo} · {plies} plies · {pieces} pcs',
    'ui.cutting.start_lay_arrow': 'start a lay →',
    'ui.cutting.status_cancelled': 'cancelled',
    'ui.cutting.status_cut': 'cut',
    'ui.cutting.status_open': 'open',
    'ui.cutting.unit_meters': 'm',
    'ui.cutting.unreported_meta': '{count} not reported',
    'ui.cutting.wastage_alert_meta': 'alert past {pct}%',
    'ui.cutting.wastage_empty_body':
      'Wastage is measured from lays that have been reported cut — fabric drawn off the rolls against what the marker said the spread would consume.',
    'ui.cutting.wastage_empty_title': 'No wastage to report',
    'ui.cutting.wastage_eyebrow': 'Cutting · wastage',
    'ui.cutting.wastage_heading': 'Against the marker plan',
    'ui.cutting.wastage_lays_eyebrow': '{count} cut',
    'ui.cutting.wastage_lays_heading': 'Lays this week',
    'ui.cutting.wastage_nothing_title': 'Nothing cut yet',
    'ui.cutting.wastage_over_one':
      '{count} order past the {pct}% threshold. Fabric is the largest line on most cost sheets, and a percent here is money that was already spent.',
    'ui.cutting.wastage_over_other':
      '{count} orders past the {pct}% threshold. Fabric is the largest line on most cost sheets, and a percent here is money that was already spent.',
    'ui.cutting.wastage_per_order_eyebrow': 'per order',
    'ui.cutting.wastage_title': 'Drawn, consumed, wasted',
    'ui.cutting.yield_heading': 'What that makes',
  },

  bn: {
    // ── common ──
    'ui.common.add': 'যোগ করুন',
    'ui.common.all': 'সব',
    'ui.common.attach': 'ছবি দিন',
    'ui.common.cancel': 'বাতিল',
    'ui.common.clear': 'মুছে ফেলুন',
    'ui.common.close': 'বন্ধ',
    'ui.common.confirm': 'নিশ্চিত করুন',
    'ui.common.dismiss': 'সরিয়ে দিন',
    'ui.common.loading': 'আসছে',
    'ui.common.nothing_yet': 'এখনো কিছু নেই',
    'ui.common.of': 'এর মধ্যে',
    'ui.common.optional': 'ইচ্ছা হলে',
    'ui.common.remove': 'বাদ দিন',
    'ui.common.required': 'দিতে হবে',
    'ui.common.retry': 'আবার চেষ্টা করুন',
    'ui.common.save': 'সেভ করুন',
    'ui.common.saving': 'সেভ হচ্ছে …',
    'ui.common.search': 'খুঁজুন',
    'ui.common.submit': 'জমা দিন',
    'ui.common.total': 'মোট',

    // ── boundary ──
    'ui.boundary.error_title': 'এই পাতা আসেনি',
    'ui.boundary.error_body':
      'আপনি যা লিখেছিলেন কিছুই সেভ হয়নি। আবার চেষ্টা করুন — বারবার একই হলে সিস্টেম দেখেন যিনি তাঁকে বলুন, কোন পাতা সেটাও বলুন।',
    'ui.boundary.error_digest': 'রেফারেন্স',
    'ui.boundary.auth_error_title': 'সাইন-ইন হয়নি',
    'ui.boundary.auth_error_body': 'কিছু জমা হয়নি। আবার চেষ্টা করুন।',
    'ui.boundary.board_error_title': 'বোর্ডের তথ্য আসছে না',
    'ui.boundary.board_error_body': 'নিজে থেকেই আবার চেষ্টা করছে। এটা থেকে গেলে সার্ভারে পৌঁছানো যাচ্ছে না।',
    'ui.boundary.not_found_title': 'এই রেকর্ড আর নেই',
    'ui.boundary.not_found_body':
      'হয়তো মুছে ফেলা হয়েছে, বা লিংকটা পুরনো। তালিকায় ফিরে গিয়ে সেখান থেকে খুলুন।',
    'ui.boundary.not_found_back': 'ফিরে যান',

    // ── store · 3.1 ──
    // Bangla nouns do not inflect after a numeral, so the _one and _other forms of a key
    // are legitimately identical here. They stay as two keys because English needs two.
    'ui.store.receive_eyebrow': 'স্টোর · মাল গ্রহণ',
    'ui.store.receive_title': 'চালান অনুযায়ী মাল বুঝে নিন',
    'ui.store.receive_meta': 'এক চালানে এক GRN · রোল র‍্যাকেই গোনা হয়',
    'ui.store.receive_refused_one': 'সার্ভার {count}টি রসিদ নেয়নি।',
    'ui.store.receive_refused_other': 'সার্ভার {count}টি রসিদ নেয়নি।',
    'ui.store.receive_done': '{list} বুঝে নেওয়া হয়েছে।',
    'ui.store.receive_done_sent': 'পাঠানো হয়েছে।',
    'ui.store.receive_done_held': 'নেট আসা পর্যন্ত এই ডিভাইসেই রাখা আছে।',
    'ui.store.challan_eyebrow': 'চালান',
    'ui.store.challan_heading': 'কী এসেছে',
    'ui.store.challan_attached': 'চালানের ছবি দেওয়া হয়েছে',
    'ui.store.challan_photograph': 'চালানের ছবি তুলুন',
    'ui.store.challan_sending': 'পাঠানো হচ্ছে…',
    'ui.store.challan_why': 'সাপ্লায়ার এই কাগজ দেখেই বিল করবে — রসিদের সাথে রাখুন',
    'ui.store.challan_take_photo': 'ছবি তুলুন',
    'ui.store.challan_replace': 'বদলান',
    'ui.store.challan_sending_button': 'পাঠানো হচ্ছে…',
    'ui.store.challan_upload_failed': 'ছবিটি পাঠানো যায়নি',
    'ui.store.challan_upload_retryable':
      '{reason} — এখনই রসিদ লিখে রাখতে পারেন, নেট এলে চালানের ছবি দিয়ে দেবেন',
    'ui.store.field_challan_no': 'চালান নম্বর',
    'ui.store.field_received_on': 'কোন তারিখে এসেছে',
    'ui.store.field_item': 'আইটেম',
    'ui.store.field_into': 'কোথায় রাখা হবে',
    'ui.store.field_qty_on_challan': 'চালানে লেখা পরিমাণ ({unit})',
    'ui.store.location_bonded_suffix': ' (বন্ড)',
    'ui.store.bonded_warning':
      '{code} একটি বন্ডেড জায়গা। শুল্কমুক্ত কাপড় UD ছাড়া নেওয়া যাবে না — UD কমার্শিয়াল ডেস্কের কাজ, এই পাতা থেকে করা যায় না।',
    'ui.store.bonded_refused':
      'বন্ডেড রসিদে UD থাকতেই হবে, আর UD কমার্শিয়াল ডেস্কের (মডিউল ২.২)। সাধারণ জায়গায় নিন, বা আগে কমার্শিয়ালকে UD করতে বলুন।',
    'ui.store.rolls_counted_eyebrow': '{count}টি গোনা হয়েছে',
    'ui.store.rolls_heading': 'র‍্যাকে থাকা রোল',
    'ui.store.rolls_mismatch':
      'রোল মিলিয়ে {counted} {unit}, চালানে {expected} {unit} — {difference} পার্থক্য। নেওয়ার আগে আবার গুনুন; সাপ্লায়ার চালান দেখেই বিল করবে।',
    'ui.store.roll_no_placeholder': 'রোল নম্বর',
    'ui.store.roll_lot_placeholder': 'লট',
    'ui.store.roll_dye_lot_placeholder': 'ডাই লট',
    'ui.store.roll_shade_placeholder': 'শেড',
    'ui.store.roll_number_label': '{index} নম্বর রোলের নম্বর',
    'ui.store.roll_qty_label': '{index} নম্বর রোলের পরিমাণ',
    'ui.store.roll_lot_label': '{index} নম্বর রোলের লট',
    'ui.store.roll_dye_lot_label': '{index} নম্বর রোলের ডাই লট',
    'ui.store.roll_shade_label': '{index} নম্বর রোলের শেড গ্রুপ',
    'ui.store.roll_remove_label': '{index} নম্বর রোল বাদ দিন',
    'ui.store.add_roll': '+ রোল যোগ করুন',
    'ui.store.rolls_progress': '{expected} {unit} এর মধ্যে {counted} গোনা হয়েছে',
    'ui.store.rolls_none_yet': 'স্টক রোল ধরে হিসাব হয় — রোল না দিলে সেই স্টক কেউ ইস্যু করতে পারবে না',
    'ui.store.receive_button': 'বুঝে নিন',
    'ui.store.receive_button_one': '{count}টি রোল বুঝে নিন',
    'ui.store.receive_button_other': '{count}টি রোল বুঝে নিন',
    // The rest of 3.1, in the same order as the en block above.
    'ui.store.adjust_button': 'সংশোধন',
    'ui.store.adjust_drafted':
      '{summary} — অনুমোদনের ইনবক্সে পাঠানো হয়েছে। স্টোরে এখনো কিছু বদলায়নি: কেউ সই করলে তবেই সংশোধন বসবে, শুধু পাঠালে নয়।',
    'ui.store.adjust_pending_note':
      'এখন কিছুই লেখা হচ্ছে না। এটা অনুমোদনের ইনবক্সে যাবে, কেউ সই করলে তবেই হিসাব বদলাবে — স্টক বাদ দেওয়া মানে টাকা বাদ দেওয়া।',
    'ui.store.adjust_refused': 'খসড়াটি নেওয়া হয়নি',
    'ui.store.adjust_submit': 'অনুমোদনের জন্য পাঠান',
    'ui.store.adjust_title': '{roll} সংশোধন',
    'ui.store.badge_bonded_no_ud': 'বন্ড · UD নেই',
    'ui.store.badge_bonded_ud': 'বন্ড · UD দেওয়া আছে',
    'ui.store.badge_general': 'সাধারণ',
    'ui.store.blocked_suffix': ' · আটকানো',
    'ui.store.bonded_without_ud_one':
      'বন্ডেড {count}টি রসিদের সাথে কোনো UD নেই। শুল্কমুক্ত কাপড় UD ছাড়া তোলা যায় না।',
    'ui.store.bonded_without_ud_other':
      'বন্ডেড {count}টি রসিদের সাথে কোনো UD নেই। শুল্কমুক্ত কাপড় UD ছাড়া তোলা যায় না।',
    'ui.store.cell_difference': 'পার্থক্য',
    'ui.store.cell_issuing': 'দেওয়া হচ্ছে',
    'ui.store.cell_required': 'দরকার',
    'ui.store.cell_system_says': 'সিস্টেমে আছে',
    'ui.store.cell_you_counted': 'আপনি গুনেছেন',
    'ui.store.col_code': 'কোড',
    'ui.store.col_free': 'ফ্রি',
    'ui.store.col_item': 'আইটেম',
    'ui.store.col_on_hand': 'মজুদ',
    'ui.store.col_reserved': 'রাখা আছে',
    'ui.store.col_rolls': 'রোল',
    'ui.store.dye_label': 'ডাই {lot}',
    'ui.store.entered_on_device': 'ডিভাইস থেকে তোলা',
    'ui.store.field_counted_qty': 'গুনে পাওয়া পরিমাণ',
    'ui.store.field_reason': 'কারণ',
    'ui.store.field_what_happened': 'কী হয়েছিল',
    'ui.store.free_formula': 'ফ্রি = মজুদ − রাখা আছে · ফ্রি দেখে ইস্যু করুন, মজুদ দেখে নয়',
    'ui.store.grns_heading': 'যা এসেছে',
    'ui.store.grns_none': 'এখনো কোনো রসিদ নেই।',
    'ui.store.grns_recent_eyebrow': 'শেষ {count}টি',
    'ui.store.index_eyebrow': 'স্টোর',
    'ui.store.index_meta_over_reserved_one': '{count}টিতে বেশি রাখা হয়েছে',
    'ui.store.index_meta_over_reserved_other': '{count}টিতে বেশি রাখা হয়েছে',
    'ui.store.index_title_one': 'স্টোরে {count}টি আইটেম',
    'ui.store.index_title_other': 'স্টোরে {count}টি আইটেম',
    'ui.store.issue_blocked_over_free':
      'এই ইস্যু আটকানো — আপনি {issuing} {unit} দিতে চাইছেন, কিন্তু এই অর্ডার সর্বোচ্চ {available} {unit} নিতে পারে। মজুদ {onHand} {unit}, বাকিটা অন্য অর্ডারের জন্য রাখা আছে। কিছুই লেখা হয়নি।',
    'ui.store.issue_bonded_note':
      'বন্ডেড রোল বাছা হয়েছে — এই ইস্যু কাস্টমসের ঘোষণা থেকে যাচ্ছে। UD ব্যালেন্স মেলানোর কাজ হবে মডিউল ২.২-এ; ততদিন এই ইস্যু লেখা থাকবে, কিন্তু UD-র সাথে মেলানো হবে না।',
    'ui.store.issue_button': '{qty} {unit} ইস্যু করুন',
    'ui.store.issue_button_blocked': 'আটকানো — ফ্রি স্টকের বেশি',
    'ui.store.issue_done': '{list} ইস্যু করা হয়েছে।',
    'ui.store.issue_empty_body':
      'ইস্যু হয় রিকুইজিশনের বিপরীতে, সরাসরি অর্ডারের বিপরীতে নয় — এতেই এক কাটিং টেবিল আরেক অর্ডারের কাপড় নিয়ে নিতে পারে না। মার্চেন্ডাইজিং অর্ডারের সাইজ বসালে তার লাইনগুলো এখানে দেখা যাবে।',
    'ui.store.issue_empty_title': 'স্টোরের কাছে কোনো রিকুইজিশন বাকি নেই',
    'ui.store.issue_eyebrow': 'স্টোর · প্রোডাকশনে ইস্যু',
    'ui.store.issue_meta': 'ফ্রি দেখে ইস্যু করুন, মজুদ দেখে নয়',
    'ui.store.issue_mixing_shades':
      'এক লে-তে {groups} শেড গ্রুপ মিশে যাচ্ছে। শেড আলাদা করে লে করুন, বা QC-কে মিশ্রণটা সই করিয়ে নিন — দুই শেডের পোশাক বায়ারই ধরে ফেলে।',
    'ui.store.issue_refused_one': 'সার্ভার {count}টি এন্ট্রি নেয়নি।',
    'ui.store.issue_refused_other': 'সার্ভার {count}টি এন্ট্রি নেয়নি।',
    'ui.store.issue_shortfall':
      'চাওয়া হয়েছে {required} {unit}, দেওয়া যাবে শুধু {available} {unit}। যা আছে দিয়ে দিন আর বাকি লে আটকে রাখুন, বা মার্চেন্ডাইজিংকে অর্ডারের হিসাব আবার বসাতে বলুন।',
    'ui.store.issue_title_empty': 'কিছু বাকি নেই',
    'ui.store.issue_title_one': 'ইস্যু করার {count}টি লাইন',
    'ui.store.issue_title_other': 'ইস্যু করার {count}টি লাইন',
    'ui.store.lot_label': 'লট {lot}',
    'ui.store.nav_issue': 'প্রোডাকশনে ইস্যু',
    'ui.store.nav_receive': 'মাল গ্রহণ',
    'ui.store.nav_rolls': 'রোল ও লট',
    'ui.store.no_shade': 'শেড নেই',
    'ui.store.no_shade_group': 'শেড গ্রুপ নেই',
    'ui.store.note_placeholder': 'বাইরের প্যাঁচে পানি লেগেছে, ভালো কাপড় পর্যন্ত কেটে ফেলা হয়েছে।',
    'ui.store.note_too_short': ' — অন্তত ১০টি অক্ষর',
    'ui.store.nothing_in_stock': 'স্টোরে কিছু নেই',
    'ui.store.outstanding_eyebrow': 'বাকি আছে',
    'ui.store.outstanding_heading': 'কাটিং যা চেয়ে বসে আছে',
    'ui.store.over_reserved_alert_one':
      'স্টোরে যা আছে তার চেয়ে বেশি অর্ডারে {count}টি আইটেম দেওয়ার কথা আছে। ঘাটতিটা সত্যি — কাটিং টেবিলে ধরা পড়ার চেয়ে এখানে ধরা পড়া ভালো।',
    'ui.store.over_reserved_alert_other':
      'স্টোরে যা আছে তার চেয়ে বেশি অর্ডারে {count}টি আইটেম দেওয়ার কথা আছে। ঘাটতিটা সত্যি — কাটিং টেবিলে ধরা পড়ার চেয়ে এখানে ধরা পড়া ভালো।',
    'ui.store.pick_rolls_heading': 'রোল বাছুন · শেড ধরে সাজানো',
    'ui.store.qty_free': '{qty} ফ্রি',
    'ui.store.reason_damaged': 'নষ্ট — পানি, তেল বা নাড়াচাড়ায়',
    'ui.store.reason_found': 'পাওয়া গেছে — হিসাবে ছিল না, স্টকে আছে',
    'ui.store.reason_miscount': 'গণনায় ভুল — আবার গুনে সিস্টেমের সাথে মিলছে না',
    'ui.store.reason_shortage_on_receipt': 'গ্রহণের সময় কম — চালানে বেশি লেখা ছিল',
    'ui.store.reason_written_off': 'বাদ — কিছুই কাজে লাগবে না',
    'ui.store.roll_count_one': '{count}টি রোল',
    'ui.store.roll_count_other': '{count}টি রোল',
    'ui.store.roll_lot_eyebrow': 'রোল · লট',
    'ui.store.rolls_all_heading': 'প্রতিটি রোল, আর কোথায় আছে',
    'ui.store.rolls_empty_body':
      'মাল বুঝে নেওয়া হলে রোল এখানে আসবে। স্টোরের সব হিসাব রোল থেকেই হয়।',
    'ui.store.rolls_empty_title': 'দেখানোর কোনো রোল নেই',
    'ui.store.rolls_eyebrow': 'স্টোর · রোল ও লট',
    'ui.store.rolls_in_stock_eyebrow': 'স্টোরে {count}টি',
    'ui.store.rolls_meta_one': '{count}টি রোল · মজুদ {onHand} {unit}',
    'ui.store.rolls_meta_other': '{count}টি রোল · মজুদ {onHand} {unit}',
    'ui.store.rolls_picked_one': '{count}টি রোল বাছা হয়েছে',
    'ui.store.rolls_picked_other': '{count}টি রোল বাছা হয়েছে',
    'ui.store.shade_group_joiner': ' আর ',
    'ui.store.shade_label': 'শেড {group}',
    'ui.store.shades_count_one': '{count}টি শেড',
    'ui.store.shades_count_other': '{count}টি শেড',
    'ui.store.stock_empty_body':
      'সাপ্লায়ারের চালানের বিপরীতে GRN করে স্টক আসে। বন্ডেড কাপড় UD-র বিপরীতে নিতে হয়, আর দুটো একসাথেই লেখা হয়।',
    'ui.store.stock_empty_title': 'স্টোর খালি',
    'ui.store.stock_heading': 'স্টক',
    'ui.store.sync_held': 'নেট আসা পর্যন্ত এই ডিভাইসেই রাখা আছে।',
    'ui.store.sync_sent': 'পাঠানো হয়েছে।',

    // ── cutting · 5.1 ──
    // lay, marker, ply, bundle, PP stay in English — that is what is said at the cutting
    // table, and a Bangla coinage for "ply" would be a word the operator has to decode.
    'ui.cutting.blocked_button': 'আটকে আছে — আগে PP অনুমোদন',
    'ui.cutting.blocked_suffix': ' · PP গেট আটকে রেখেছে',
    'ui.cutting.bundles_note':
      'কাট রিপোর্ট থেকেই bundle তৈরি হয়, আর সেই bundle-এর QR সুইং লাইন স্ক্যান করে',
    'ui.cutting.col_colour': 'রং',
    'ui.cutting.col_cut': 'কাটা',
    'ui.cutting.col_difference': 'পার্থক্য',
    'ui.cutting.col_fabric': 'কাপড়',
    'ui.cutting.col_lay': 'Lay নম্বর',
    'ui.cutting.col_marker_says': 'Marker বলছে',
    'ui.cutting.col_order': 'অর্ডার',
    'ui.cutting.col_order_needs': 'অর্ডারে দরকার',
    'ui.cutting.col_plies': 'Ply সংখ্যা',
    'ui.cutting.col_size': 'সাইজ',
    'ui.cutting.col_status': 'অবস্থা',
    'ui.cutting.colour_placeholder': 'নেভি',
    'ui.cutting.create_lay_button': 'Lay তৈরি করুন',
    'ui.cutting.cut_cell_label': '{size} সাইজে কত কাটা হয়েছে',
    'ui.cutting.eyebrow': 'কাটিং',
    'ui.cutting.field_colour': 'রং',
    'ui.cutting.field_lay_no': 'Lay নম্বর',
    'ui.cutting.field_marker': 'কোন marker',
    'ui.cutting.field_plies': 'কত ply',
    'ui.cutting.figure_consumed': 'লেগেছে',
    'ui.cutting.figure_drawn': 'নেওয়া হয়েছে',
    'ui.cutting.figure_waste': 'অপচয়',
    'ui.cutting.from_a_device': 'ডিভাইস থেকে',
    'ui.cutting.held_offline': 'নেট আসা পর্যন্ত এই ডিভাইসেই রাখা আছে।',
    'ui.cutting.lay_consumes_suffix': ', lay-তে লাগবে {planned} মি',
    'ui.cutting.lay_empty_body': 'অর্ডার কনফার্ম হয়ে প্রোডাকশনে গেলেই কাটিং ফ্লোরে আসে।',
    'ui.cutting.lay_empty_title': 'কাটিংয়ের জন্য কোনো কনফার্ম অর্ডার অপেক্ষা করছে না',
    'ui.cutting.lay_eyebrow': 'কাটিং · নতুন lay',
    'ui.cutting.lay_nothing_title': 'কাটার কিছু নেই',
    'ui.cutting.lays_empty_body':
      'এক lay মানে একবার কাপড় বিছিয়ে একসাথে অনেক ply কাটা। বিছানোর জন্য PP স্যাম্পল অনুমোদিত থাকতে হবে আর কাপড় ইস্যু হতে হবে — দুটোই শুরুর সময়েই দেখা হয়, পরে নয়।',
    'ui.cutting.lays_empty_title': 'কোনো lay বিছানো হয়নি',
    'ui.cutting.lays_heading': 'Lay তালিকা',
    // Bangla nouns do not inflect after a numeral, so _one and _other are the same string.
    'ui.cutting.lays_open_one': '{count}টি lay খোলা আছে',
    'ui.cutting.lays_open_other': '{count}টি lay খোলা আছে',
    'ui.cutting.lays_refused_one':
      'সার্ভার {count}টি lay নেয়নি — সম্ভবত কোনো গেট আটকেছে। কিছুই বিছানো হয়নি।',
    'ui.cutting.lays_refused_other':
      'সার্ভার {count}টি lay নেয়নি — সম্ভবত কোনো গেট আটকেছে। কিছুই বিছানো হয়নি।',
    'ui.cutting.marker_heading': 'Marker বাছুন',
    'ui.cutting.marker_plan_note': 'marker প্ল্যান {planned} মি · বাছা হয়েছে {drawn} মি',
    'ui.cutting.markers_released_eyebrow': 'এই স্টাইলে {count}টি marker আছে',
    'ui.cutting.meta_blocked': 'আটকে আছে',
    'ui.cutting.meters_value': '{value} মি',
    'ui.cutting.mixing_shades':
      'আপনি এক lay-তে {groups} শেড একসাথে বিছাচ্ছেন। এক স্ট্যাকে দুই ডাই লট মানে একই গার্মেন্টে দুই রকম নেভি চলে যাওয়া।',
    'ui.cutting.nav_cut_report': 'কাট রিপোর্ট',
    'ui.cutting.nav_start_lay': 'নতুন lay শুরু করুন',
    'ui.cutting.nav_wastage': 'অপচয়',
    'ui.cutting.no_marker':
      '{style}-এর কোনো marker নেই। Marker-এর নিচেই lay বিছানো হয় — marker হলো প্যাটার্নের সাজানো নকশা, প্রতি ply-তে কত পিস হবে সেটা এটাই ঠিক করে — আর কাটা শুরুর আগে CAD সেটা রিলিজ করে।',
    'ui.cutting.no_rolls_issued':
      'এই অর্ডারের নামে স্টোর কোনো কাপড় ইস্যু করেনি — বা ইস্যু হওয়া সব রোল আগেই টেবিলে চলে গেছে। এক lay শুধু নিজের অর্ডারে ইস্যু হওয়া রোলই নিতে পারে, তাই কাটিং স্টোরের জন্য অপেক্ষা করছে।',
    'ui.cutting.not_reported': 'রিপোর্ট হয়নি',
    'ui.cutting.order_chip_fallback': 'অর্ডার',
    'ui.cutting.order_fallback': 'অর্ডার',
    'ui.cutting.outside_tolerance':
      '{list} — {tolerance}% সহনসীমার বাইরে। তবু জমা দিতে পারেন; পার্থক্যটা রিপোর্টের সাথে লেখা থাকবে আর ম্যানেজার দেখবেন। পিস তো কেটেই গেছে, যা হয়েছে তা না লিখলে সেগুলো আবার জোড়া লাগবে না।',
    'ui.cutting.overview_empty_title': 'এখনো কোনো lay বিছানো হয়নি',
    'ui.cutting.pieces_eyebrow': '{count} পিস',
    'ui.cutting.pp_gate_blocked':
      'এই স্টাইল এখনো বিছানো যাবে না — PP গেট আটকে রেখেছে। ফ্যাক্টরি আশি হাজার বানানোর আগে বায়ার একটা গার্মেন্ট দেখে সই করে। স্যাম্পল রুমে সেই অনুমোদন ওঠা পর্যন্ত নিচের কিছুই নেওয়া হবে না।',
    'ui.cutting.pp_gate_reason': 'গেট রেফারেন্স: {reason}।',
    'ui.cutting.prereq_eyebrow': 'Lay বিছানোর আগে',
    'ui.cutting.prereq_fabric_body': '— এই অর্ডারের নামে রোল সত্যিই স্টোর থেকে বেরিয়েছে',
    'ui.cutting.prereq_fabric_title': 'কাপড় ইস্যু হয়েছে',
    'ui.cutting.prereq_note': 'দুটোই সার্ভারে দেখা হয় · আটকে গেলে কোনটা আটকেছে সেটা বলে দেয়',
    'ui.cutting.prereq_pp_body': '— আশি হাজার বানানোর আগে বায়ার একটা গার্মেন্ট দেখে সই করেছে',
    'ui.cutting.prereq_pp_title': 'PP স্যাম্পল অনুমোদিত',
    'ui.cutting.ready_eyebrow': 'প্রোডাকশনে {count}টি',
    'ui.cutting.ready_heading': 'কাটার জন্য তৈরি',
    'ui.cutting.ready_none': 'স্টাইল দেওয়া কনফার্ম অর্ডার এখনো নেই।',
    'ui.cutting.report_empty_body':
      'কাট রিপোর্ট দেওয়া হয় এমন lay-এর নামে যেটা এখনো খোলা আছে। রিপোর্ট দিলেই lay কাটা হয়ে যায়, পরে সংখ্যা বদলাতে চাইলে সেটা সংশোধন — কেউ অনুমোদন করে।',
    'ui.cutting.report_empty_title': 'কোনো lay রিপোর্টের জন্য অপেক্ষা করছে না',
    'ui.cutting.report_eyebrow': 'কাটিং · রিপোর্ট',
    'ui.cutting.report_eyebrow_hint': 'ঠিক করতে ঘরে চাপ দিন',
    'ui.cutting.report_filed': '{summary} জমা হয়েছে।',
    'ui.cutting.report_filed_note':
      'Lay এখন কাটা হয়ে গেছে; পরে এই সংখ্যা বদলাতে চাইলে সেটা সংশোধন, ম্যানেজার অনুমোদন করেন।',
    'ui.cutting.report_filed_summary': '{layNo} · {count} পিস',
    'ui.cutting.report_footer_note': 'জমা দিলে {layNo} বন্ধ হয়ে যাবে · এই রিপোর্ট থেকেই bundle তৈরি হয়',
    'ui.cutting.report_heading': 'প্ল্যানের সাথে কাটার হিসাব',
    'ui.cutting.report_meta': '{plies} ply · marker {marker} · সহনসীমা {tolerance}%',
    'ui.cutting.report_nothing_title': 'রিপোর্ট করার কিছু নেই',
    'ui.cutting.reports_refused_one': 'সার্ভার {count}টি রিপোর্ট নেয়নি।',
    'ui.cutting.reports_refused_other': 'সার্ভার {count}টি রিপোর্ট নেয়নি।',
    'ui.cutting.rolls_heading': 'স্টোর থেকে আনা রোল',
    'ui.cutting.rolls_issued_eyebrow': 'এই অর্ডারে {count}টি ইস্যু হয়েছে',
    'ui.cutting.rolls_on_table_one': '{count}টি রোল · টেবিলে {drawn} মি',
    'ui.cutting.rolls_on_table_other': '{count}টি রোল · টেবিলে {drawn} মি',
    'ui.cutting.save_report_button': 'কাট রিপোর্ট সেভ করুন',
    'ui.cutting.sent': 'পাঠানো হয়েছে।',
    'ui.cutting.shade_badge': 'শেড {group}',
    'ui.cutting.shade_join': ' আর ',
    'ui.cutting.spread_done': '{list} বিছানো হয়েছে।',
    'ui.cutting.spread_summary': '{layNo} · {plies} ply · {pieces} পিস',
    'ui.cutting.start_lay_arrow': 'lay শুরু করুন →',
    'ui.cutting.status_cancelled': 'বাতিল',
    'ui.cutting.status_cut': 'কাটা হয়েছে',
    'ui.cutting.status_open': 'খোলা',
    'ui.cutting.unit_meters': 'মি',
    'ui.cutting.unreported_meta': '{count}টির রিপোর্ট হয়নি',
    'ui.cutting.wastage_alert_meta': '{pct}% ছাড়ালে সতর্কতা',
    'ui.cutting.wastage_empty_body':
      'অপচয়ের হিসাব হয় যেসব lay কাটা বলে রিপোর্ট হয়েছে সেগুলো থেকে — রোল থেকে কত কাপড় গেছে, আর marker বলেছিল বিছানোতে কত লাগবে, এই দুইয়ের তুলনা।',
    'ui.cutting.wastage_empty_title': 'দেখানোর মতো অপচয় নেই',
    'ui.cutting.wastage_eyebrow': 'কাটিং · অপচয়',
    'ui.cutting.wastage_heading': 'Marker প্ল্যানের সাথে তুলনা',
    'ui.cutting.wastage_lays_eyebrow': '{count}টি কাটা হয়েছে',
    'ui.cutting.wastage_lays_heading': 'এই সপ্তাহের lay',
    'ui.cutting.wastage_nothing_title': 'এখনো কিছু কাটা হয়নি',
    'ui.cutting.wastage_over_one':
      '{count}টি অর্ডার {pct}% সীমা ছাড়িয়েছে। বেশির ভাগ কস্ট শিটে কাপড়ই সবচেয়ে বড় খরচ, তাই এখানে এক পার্সেন্ট মানে আগেই খরচ হয়ে যাওয়া টাকা।',
    'ui.cutting.wastage_over_other':
      '{count}টি অর্ডার {pct}% সীমা ছাড়িয়েছে। বেশির ভাগ কস্ট শিটে কাপড়ই সবচেয়ে বড় খরচ, তাই এখানে এক পার্সেন্ট মানে আগেই খরচ হয়ে যাওয়া টাকা।',
    'ui.cutting.wastage_per_order_eyebrow': 'অর্ডার অনুযায়ী',
    'ui.cutting.wastage_title': 'নেওয়া, লেগেছে, অপচয়',
    'ui.cutting.yield_heading': 'এতে কত পিস হবে',
  },
}

/**
 * Screen copy for a locale. `t` with this catalogue bound, so the fallback behaviour is
 * the notification catalogue's, argued once in `lib/i18n.ts`.
 */
export function tui(
  locale: Locale,
  key: string,
  params: Readonly<Record<string, unknown>> = {},
): string {
  return t(locale, key, params, UI_MESSAGES)
}

/**
 * One or many: `plural('ui.store.receive_button', n)` reads `…_one` or `…_other`.
 *
 * Deliberately only two forms. English needs two and Bangla needs one — a Bangla noun does
 * not inflect after a numeral, so both its forms are the same string, which looks redundant
 * in the catalogue and is the correct translation. A full CLDR plural-category system would
 * buy nothing for these two languages and would have to be understood by whoever adds the
 * next screen.
 *
 * `count` is passed through as a parameter, so the copy decides where the number goes —
 * Bangla puts the classifier on it (`{count}টি`) and English does not.
 */
export type Translator = ((key: string, params?: Readonly<Record<string, unknown>>) => string) & {
  plural: (baseKey: string, count: number, params?: Readonly<Record<string, unknown>>) => string
}

export function translator(locale: Locale): Translator {
  const translate = ((key: string, params: Readonly<Record<string, unknown>> = {}) =>
    tui(locale, key, params)) as Translator

  translate.plural = (baseKey, count, params = {}) =>
    tui(locale, `${baseKey}${count === 1 ? '_one' : '_other'}`, { count, ...params })

  return translate
}

/**
 * Screen copy AND system copy, for the one place that needs both: a caught action error
 * carries a `lib/i18n.ts` key, and the screen showing it is otherwise built from this
 * file's keys. Kept as an explicit merge rather than one big catalogue so the two
 * enforcement tests stay separable.
 */
export const ALL_MESSAGES: Catalogue = {
  en: { ...MESSAGES.en, ...UI_MESSAGES.en },
  bn: { ...MESSAGES.bn, ...UI_MESSAGES.bn },
}
