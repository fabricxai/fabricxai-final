/**
 * i18n. Errors and notifications carry KEYS, never display strings — the floor reads
 * Bangla and the office reads English against the same rows.
 *
 * ⚠ Catalogue and resolver land with the first UI-facing module.
 */
export const LOCALES = ['en', 'bn'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
