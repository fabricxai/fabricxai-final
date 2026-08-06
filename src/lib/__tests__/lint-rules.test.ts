/**
 * The custom lint rules are the ONLY automated enforcement behind CLAUDE.md rules 2, 3, 4
 * and 9. A rule that has never been observed firing is not enforcement, it is decoration —
 * so each is exercised here, including the cases it must NOT fire on, because a noisy rule
 * gets disabled and then catches nothing.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

// @ts-expect-error — plain JS rule modules, intentionally untyped
import analyticsNoWrites from '../../../eslint-rules/analytics-no-writes.js'
// @ts-expect-error — plain JS rule modules, intentionally untyped
import noFloatMoney from '../../../eslint-rules/no-float-money.js'
// @ts-expect-error — plain JS rule modules, intentionally untyped
import noInventedConfidence from '../../../eslint-rules/no-invented-confidence.js'
// @ts-expect-error — plain JS rule modules, intentionally untyped
import requireTenantPredicate from '../../../eslint-rules/require-tenant-predicate.js'

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
          // The MemberExpression spelling is the same function — it went unmatched for
          // months and 22 call sites (including the FOB computation) rode through green.
          code: `const pct = Number.parseFloat(marginPct)`,
          errors: [{ messageId: 'parseBanned' }],
        },
        {
          code: `const n = Number.parseInt(row.qty, 10)`,
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

describe('fabricxai/require-tenant-predicate', () => {
  it('demands the company in a where-clause, and accepts every honest spelling of it', () => {
    ruleTester.run('require-tenant-predicate', requireTenantPredicate, {
      valid: [
        // The sanctioned helper, with and without extra filters.
        { code: `const r = await tx.select().from(t).where(scoped(t, ctx, eq(t.id, id)))` },
        { code: `await tx.select().from(t).where(scoped(t, ctx))` },
        { code: `await tx.update(t).set(v).where(scoped(t, ctx, eq(t.status, 'active')))` },
        // The bare predicate is the same wall; the helper is only the readable spelling.
        { code: `await tx.select().from(t).where(eq(t.companyId, ctx.companyId))` },
        { code: `await tx.select().from(t).where(and(eq(t.companyId, ctx.companyId), eq(t.id, id)))` },
        // Nested deep inside a composed clause — the check is a subtree walk, not a match
        // on the first argument, or every real query would trip it.
        { code: `await tx.select().from(t).where(or(and(eq(t.companyId, c), a), b))` },
        { code: `await tx.select().from(t).where(and(sql\`x\`, tenantEq(t, ctx)))` },
        // Raw SQL naming the column counts.
        { code: `await tx.select().from(t).where(sql\`company_id = \${id}\`)` },
        // Not a query at all. The rule keys on `.where(`, so this proves it does not fire
        // on array filtering that happens to be named the same way.
        { code: `const found = list.filter((x) => x.id === id)` },
      ],
      invalid: [
        {
          // The IDOR shape: a uuid lookup with nothing else. If RLS ever fails, this
          // returns another factory's row.
          code: `await tx.select().from(t).where(eq(t.id, runId))`,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: `await tx.select().from(payrollRuns).where(eq(payrollRuns.period, period))`,
          errors: [{ messageId: 'missing' }],
        },
        {
          // A delete is worse than a read, and must be caught the same way.
          code: `await tx.delete(payrollLines).where(eq(payrollLines.runId, runId))`,
          errors: [{ messageId: 'missing' }],
        },
        {
          // `userId` is not `companyId`. A near-miss identifier must not satisfy it.
          code: `await tx.select().from(t).where(eq(t.userId, ctx.userId))`,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })
})

describe('fabricxai/no-invented-confidence', () => {
  it('bans a typed-in confidence and leaves a computed one alone', () => {
    /*
     * The rule exists because eight modules got past `assertExtractionConfidence` — which
     * only catches every field scoring the SAME — by typing VARIED numbers per field
     * (audit AI-B2). `qtyDelta: 0.62` on every stock-adjustment draft the tool ever made.
     *
     * The valid cases matter more than the invalid ones here. This rule has to be able to
     * tell an estimate from a derivation, or the two legitimate confidence sources in the
     * repo — the mock provider's match-quality lookup and memory's evidence-weighted score
     * — start erroring and somebody switches it off.
     */
    ruleTester.run('no-invented-confidence', noInventedConfidence, {
      valid: [
        // Derived from HOW the value was matched. The number moves with the evidence,
        // which is the entire distinction the rule is drawing.
        { code: `fieldConfidence[field] = CONFIDENCE[found.how]` },
        { code: `const fieldConfidence = { qty: seededLineConfidence(line) }` },
        { code: `const fieldConfidence = { qty: measure(a) * weight }` },
        // Not estimates. A field the user picked off a list carries no reading risk, and
        // `extract` scores exactly those at 1 with its reasoning written out.
        { code: `const fieldConfidence = { buyerId: 1, unread: 0 }` },
        // A different object of numbers. The rule keys on the name, and a tolerance table
        // or a weighting map must not trip it.
        { code: `const tolerances = { xs: 0.5, s: 0.75 }` },
        { code: `const proposal = { fieldConfidence, method: 'x' }` },
        // Shorthand: the object is somewhere else, and is checked where it is written.
        { code: `const proposal = { fieldConfidence }` },
      ],
      invalid: [
        {
          // The shape that shipped, in the property form.
          code: `const p = { fieldConfidence: { itemId: 0.95, qtyDelta: 0.62 } }`,
          errors: [{ messageId: 'literal' }, { messageId: 'literal' }],
        },
        {
          // The same object one line earlier — which is exactly how it would be rewritten
          // the moment the property form started erroring.
          code: `const fieldConfidence = { verdict: 0.66 }`,
          errors: [{ messageId: 'literal' }],
        },
        {
          // The optional-field dialect all eight sites used. A naive property walk sees a
          // SpreadElement and moves on, so this is the case that decides whether the rule
          // is worth having.
          code: `const p = { fieldConfidence: { ...(doc ? { documentId: 0.95 } : {}) } }`,
          errors: [{ messageId: 'literal' }],
        },
        {
          code: `const p = { fieldConfidence: { ...(doc && { documentId: 0.95 }) } }`,
          errors: [{ messageId: 'literal' }],
        },
        {
          // Nonsense as a confidence, but still a number somebody typed — better said here
          // than as a runtime range error three layers down.
          code: `const fieldConfidence = { qty: -0.5 }`,
          errors: [{ messageId: 'literal' }],
        },
        {
          // A quoted key is the same property.
          code: `const fieldConfidence = { 'lines.0.qty': 0.7 }`,
          errors: [{ messageId: 'literal' }],
        },
      ],
    })
  })
})
