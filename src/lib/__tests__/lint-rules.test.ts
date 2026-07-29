/**
 * The two custom lint rules are the ONLY automated enforcement behind CLAUDE.md rules 4
 * and 9. A rule that has never been observed firing is not enforcement, it is decoration
 * — so both are exercised here, including the cases they must NOT fire on, because a
 * noisy rule gets disabled and then catches nothing.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

// @ts-expect-error — plain JS rule modules, intentionally untyped
import analyticsNoWrites from '../../../eslint-rules/analytics-no-writes.js'
// @ts-expect-error — plain JS rule modules, intentionally untyped
import noFloatMoney from '../../../eslint-rules/no-float-money.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

describe('fabricxai/no-float-money', () => {
  it('bans float arithmetic on money and leaves everything else alone', () => {
    ruleTester.run('no-float-money', noFloatMoney, {
      valid: [
        // The sanctioned path.
        { code: `import { add } from '@/lib/money'; const t = add(a, b)` },
        // Confidence is a 0..1 score, not money — must not fire, or the rule gets muted.
        { code: `const min = Number(row.confidenceMin)` },
        // Counts, pagination, ids: all fine.
        { code: `const n = Number(result.count) + 1` },
        { code: `const page = parseInt2(x)` },
        // Money compared by identity or passed around is fine; only coercion is banned.
        { code: `if (line.unitPrice === other.unitPrice) {}` },
        // BigInt IS the exact path this rule pushes people towards. Flagging it would be
        // telling someone off for doing the right thing.
        { code: `const total = amountMinor * 100n` },
        { code: `const t = BigInt(qty) * rateMinor` },
        { code: `const t = (amount * 10n) / 3n` },
        { code: `const m = { amount: line.amount, currency: 'USD' }` },
      ],
      invalid: [
        {
          code: `const total = parseFloat(line.amount)`,
          errors: [{ messageId: 'parseBanned' }],
        },
        {
          code: `const q = parseInt(row.qty, 10)`,
          errors: [{ messageId: 'parseBanned' }],
        },
        {
          code: `const t = Number(order.totalValue)`,
          errors: [{ messageId: 'numberOnMoney' }],
        },
        {
          code: `const t = Number(unitPrice)`,
          errors: [{ messageId: 'numberOnMoney' }],
        },
        {
          // The actual bug this exists to prevent.
          code: `const total = line.amount + other.amount`,
          errors: [{ messageId: 'arithmeticOnMoney' }],
        },
        {
          code: `const t = qty * unitPrice`,
          errors: [{ messageId: 'arithmeticOnMoney' }],
        },
        {
          code: `const t = +invoice.balance`,
          errors: [{ messageId: 'unaryPlusOnMoney' }],
        },
      ],
    })
  })
})

describe('fabricxai/analytics-no-writes', () => {
  it('bans every shape of write inside modules/analytics', () => {
    ruleTester.run('analytics-no-writes', analyticsNoWrites, {
      valid: [
        { code: `import { withTenantRead } from '@/modules/core/tenancy'` },
        { code: `const rows = await tx.select().from(orders)` },
        // Reading across modules through the owner's queries.ts is the sanctioned route.
        { code: `import { listOpenOrders } from '@/modules/orders/queries'` },
        // A property called `update` that is not invoked is not a write.
        { code: `const f = row.update` },
      ],
      invalid: [
        {
          code: `await tx.insert(efficiencyDaily).values(row)`,
          errors: [{ messageId: 'writeCall' }],
        },
        {
          code: `await db.update(orders).set({ status: 'x' })`,
          errors: [{ messageId: 'writeCall' }],
        },
        {
          code: `await tx.delete(wipSnapshots)`,
          errors: [{ messageId: 'writeCall' }],
        },
        {
          code: `import { withTenantTx } from '@/modules/core/tenancy'`,
          errors: [{ messageId: 'writeImport' }],
        },
        {
          code: `import { propose } from '@/modules/core/pending-changes'`,
          errors: [{ messageId: 'writeModule' }],
        },
        {
          // Rule 11: cross-module reads go through queries.ts, never a service.
          code: `import { recomputeCriticalPath } from '@/modules/orders/service'`,
          errors: [{ messageId: 'serviceImport' }],
        },
      ],
    })
  })
})
