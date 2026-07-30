/**
 * Buyer desk vectors — written before the implementation.
 *
 * Three things here are easy to get wrong in ways that surface months later:
 *
 *  1. **Duplicate detection.** "H&M Hennes & Mauritz AB" and "H and M Hennes Mauritz" are
 *     the same buyer. A factory that creates the second one loses half its order history
 *     against a name nobody searches for. Trigram similarity does the matching, but it only
 *     works on names that have been normalised first — the legal suffix is noise.
 *  2. **Terms are versioned and dated.** An order placed in January is governed by
 *     January's terms, not today's. Reading the newest row means applying an AQL level or a
 *     tolerance the buyer had not yet agreed to when the order was taken.
 *  3. **`quiet_since` is about the last CONTACT, not the last edit.** A lead somebody
 *     renamed yesterday has not been contacted; treating a record touch as contact is how a
 *     lead goes quiet for four months without anybody noticing.
 */
import { describe, expect, it } from 'vitest'

import {
  BuyersError,
  leadStageMachine,
  normalizeCompanyName,
  normalizeDomain,
  quietDays,
  termsInForceOn,
  type BuyerTermsVersion,
} from '../buyers'

describe('normalizeCompanyName · what trigram similarity actually compares', () => {
  it('1 · strips legal suffixes', () => {
    // "Ltd" is noise on every Bangladeshi company name — matching on it means every
    // supplier looks 30% similar to every other.
    expect(normalizeCompanyName('Fabrica Apparels Ltd.')).toBe('fabrica apparels')
    expect(normalizeCompanyName('Fabrica Apparels Limited')).toBe('fabrica apparels')
    expect(normalizeCompanyName('Fabrica Apparels Pvt Ltd')).toBe('fabrica apparels')
  })

  it('2 · folds ampersands and the word "and" together', () => {
    // "H&M" and "H and M" are typed interchangeably by every merchandiser alive.
    expect(normalizeCompanyName('H&M Hennes & Mauritz AB')).toBe(
      normalizeCompanyName('H and M Hennes and Mauritz'),
    )
  })

  it('3 · collapses punctuation and repeated whitespace', () => {
    expect(normalizeCompanyName('  Next   Retail,  Inc. ')).toBe('next retail')
  })

  it('4 · keeps a name that is only a suffix rather than emptying it', () => {
    // "Limited" as a whole company name is odd but real. Returning an empty string would
    // make it match everything.
    expect(normalizeCompanyName('Limited')).toBe('limited')
  })

  it('5 · refuses an empty name', () => {
    expect(() => normalizeCompanyName('   ')).toThrow(BuyersError)
  })
})

describe('normalizeDomain · the strongest duplicate signal there is', () => {
  it('6 · reduces a URL to its registrable host', () => {
    expect(normalizeDomain('https://www.hm.com/en/careers?ref=x')).toBe('hm.com')
    expect(normalizeDomain('http://HM.COM/')).toBe('hm.com')
  })

  it('7 · takes the domain out of an email address', () => {
    // Merchandisers paste a contact email into the website field constantly.
    expect(normalizeDomain('sourcing@nextplc.co.uk')).toBe('nextplc.co.uk')
  })

  it('8 · returns null for something that is not a domain, rather than guessing', () => {
    // A junk value that normalises to a plausible domain would match unrelated buyers.
    expect(normalizeDomain('to be confirmed')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
  })

  it('9 · keeps a bare host', () => {
    expect(normalizeDomain('nextplc.co.uk')).toBe('nextplc.co.uk')
  })
})

describe('termsInForceOn · the version that applied on the day', () => {
  const versions: BuyerTermsVersion[] = [
    { id: 'v1', validFrom: '2025-01-01', aqlLevel: '4.0', tolerancePct: '5' },
    { id: 'v2', validFrom: '2026-01-01', aqlLevel: '2.5', tolerancePct: '3' },
    { id: 'v3', validFrom: '2026-07-01', aqlLevel: '2.5', tolerancePct: '0' },
  ]

  it('10 · picks the newest version at or before the date', () => {
    expect(termsInForceOn(versions, '2026-03-15')?.id).toBe('v2')
  })

  it('11 · an order from last year is governed by last year’s terms', () => {
    // Reading the newest row would apply a 2.5 AQL and a 0% tolerance to an order taken
    // when the buyer had agreed to 4.0 and 5%.
    const applied = termsInForceOn(versions, '2025-06-01')
    expect(applied?.aqlLevel).toBe('4.0')
    expect(applied?.tolerancePct).toBe('5')
  })

  it('12 · a version starting exactly on the date is already in force', () => {
    expect(termsInForceOn(versions, '2026-07-01')?.id).toBe('v3')
  })

  it('13 · returns null before any version existed, rather than the earliest', () => {
    // Falling back to the earliest would invent an agreement that did not exist. A quote
    // priced before any terms were agreed has no terms, and should say so.
    expect(termsInForceOn(versions, '2024-12-31')).toBeNull()
  })

  it('14 · is not fooled by rows arriving out of order', () => {
    const shuffled = [versions[2]!, versions[0]!, versions[1]!]
    expect(termsInForceOn(shuffled, '2026-03-15')?.id).toBe('v2')
  })

  it('15 · refuses two versions starting on the same day', () => {
    // Which one applied is then a question of row order, and it decides an AQL level.
    expect(() =>
      termsInForceOn(
        [
          { id: 'a', validFrom: '2026-01-01', aqlLevel: '2.5', tolerancePct: '3' },
          { id: 'b', validFrom: '2026-01-01', aqlLevel: '4.0', tolerancePct: '5' },
        ],
        '2026-06-01',
      ),
    ).toThrow(BuyersError)
  })
})

describe('quietDays · since the last CONTACT', () => {
  it('16 · counts from the most recent activity', () => {
    expect(quietDays({ lastActivityAt: '2026-07-01', today: '2026-07-30' })).toBe(29)
  })

  it('17 · counts from creation when nothing has been logged', () => {
    // A lead nobody has ever contacted is the quietest lead there is, not one with no age.
    expect(quietDays({ lastActivityAt: null, createdAt: '2026-06-01', today: '2026-07-30' })).toBe(
      59,
    )
  })

  it('18 · refuses to compute with neither', () => {
    expect(() => quietDays({ lastActivityAt: null, today: '2026-07-30' })).toThrow(BuyersError)
  })
})

describe('leadStageMachine', () => {
  it('19 · walks the pipeline forward', () => {
    expect(() => leadStageMachine.assert('new', 'contacted')).not.toThrow()
    expect(() => leadStageMachine.assert('negotiation', 'won')).not.toThrow()
  })

  it('20 · a lost lead can be reopened, because buyers come back', () => {
    // A buyer who went elsewhere on price this season is next season's enquiry. A terminal
    // `lost` would force a duplicate lead and split the history.
    expect(() => leadStageMachine.assert('lost', 'contacted')).not.toThrow()
  })

  it('21 · a won lead is terminal — it is a buyer now', () => {
    expect(() => leadStageMachine.assert('won', 'negotiation')).toThrow()
  })

  it('22 · cannot skip from new straight to won', () => {
    // Winning without ever having contacted them means the pipeline was never used, and
    // the conversion stats it feeds become fiction.
    expect(() => leadStageMachine.assert('new', 'won')).toThrow()
  })
})
