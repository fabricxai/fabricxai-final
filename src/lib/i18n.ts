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
      'UD reconciliation is due for {month}',

    // ── 6.1 Line tracking ──
    'production.notifications.partition_default.title':
      'Production writes are landing in the default partition',

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
      '{month} মাসের UD মিলকরণ বাকি আছে',

    // ── 6.1 ──
    'production.notifications.partition_default.title':
      'প্রোডাকশন এন্ট্রি ডিফল্ট পার্টিশনে জমা হচ্ছে',

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
