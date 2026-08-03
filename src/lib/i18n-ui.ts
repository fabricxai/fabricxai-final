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
    'ui.store.receive_eyebrow': 'স্টোর · মাল গ্রহণ',
    'ui.store.receive_title': 'চালান অনুযায়ী মাল বুঝে নিন',
    'ui.store.receive_meta': 'এক চালানে এক GRN · রোল র‍্যাকেই গোনা হয়',
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
 * A bound translator, for a component that resolves the locale once and then reads many
 * keys. `const t = translator(locale)` reads closer to the markup than threading the
 * locale through every call.
 */
export type Translator = (key: string, params?: Readonly<Record<string, unknown>>) => string

export const translator =
  (locale: Locale): Translator =>
  (key, params = {}) =>
    tui(locale, key, params)

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
