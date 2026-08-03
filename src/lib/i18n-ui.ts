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
