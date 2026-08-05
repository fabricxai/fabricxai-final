/**
 * `require-tenant-predicate` — enforcement for CLAUDE.md rule 2's FIRST wall.
 *
 * Rule 2 says the RLS session variable is "the second wall, never the only wall". It was
 * the only wall (audit BE-B1): eight incidental `company_id` predicates across 466 query
 * sites. RLS, the boot assertion that refuses a BYPASSRLS connection, and the seed's
 * isolation sweep are all real — and all three are properties of the CONNECTION, so they
 * share a failure mode. A table shipped without a policy, or a scope that did not take,
 * turns `where id = $1` into another factory's row and none of them notice.
 *
 * So: inside an adopted file, every `.where()` must name the company. Either through
 * `scoped()`/`tenantEq()` from `modules/core/scoped`, or with a plain `companyId`
 * comparison — both are the predicate; the helpers are simply the readable spelling.
 *
 * **Applied to an explicit file list in `eslint.config.mjs`, not to the whole repo.**
 * Rewriting 466 sites in one pass would be a large mechanical diff across money and
 * payroll with no honest way to review it. A file joins the list once its queries carry
 * the predicate, and cannot quietly leave. That list IS the adoption ratchet, and what
 * remains outside it is recorded in docs/STUBS.md rather than implied to be done.
 *
 * Where a where-clause genuinely has no tenant to name — an install-wide reference table
 * like `aql_tables`, or a filter over a CTE that was already scoped — the escape is an
 * `eslint-disable-next-line` carrying the reason, which is a line a reviewer can weigh.
 */

/** Names that constitute naming the tenant. */
const SCOPE_HELPERS = new Set(['scoped', 'tenantEq'])
const SCOPE_IDENTIFIERS = new Set(['companyId', 'company_id'])

const requireTenantPredicate = {
  meta: {
    type: 'problem',
    docs: {
      description: 'queries name the company they belong to (CLAUDE.md rule 2, wall 1)',
    },
    schema: [],
    messages: {
      missing:
        '`.where()` does not name the company. RLS is the SECOND wall — add `scoped(<table>, ctx, …)` from @/modules/core/scoped, or disable with a reason if this has no tenant to name.',
    },
  },

  create(context) {
    /** Does this subtree name the tenant anywhere inside it? */
    function namesTenant(node) {
      let found = false

      const walk = (current) => {
        if (found || current === null || typeof current !== 'object') return

        if (Array.isArray(current)) {
          for (const item of current) walk(item)
          return
        }

        if (typeof current.type !== 'string') return

        // `scoped(...)` / `tenantEq(...)`
        if (current.type === 'CallExpression') {
          const callee = current.callee
          if (callee?.type === 'Identifier' && SCOPE_HELPERS.has(callee.name)) {
            found = true
            return
          }
        }

        // `t.companyId` / `eq(x.company_id, …)` / a destructured `companyId`
        if (current.type === 'Identifier' && SCOPE_IDENTIFIERS.has(current.name)) {
          found = true
          return
        }
        if (current.type === 'Literal' && SCOPE_IDENTIFIERS.has(current.value)) {
          found = true
          return
        }

        // Raw SQL — `sql\`company_id = ${id}\``. The column name lives in the template's
        // text rather than in an identifier node, so a walker that only looked at
        // identifiers would report every hand-written predicate as unscoped and teach
        // people that the rule is wrong.
        if (current.type === 'TemplateElement') {
          const text = current.value?.cooked ?? current.value?.raw ?? ''
          if ([...SCOPE_IDENTIFIERS].some((name) => text.includes(name))) {
            found = true
            return
          }
        }

        for (const key of Object.keys(current)) {
          if (key === 'parent' || key === 'loc' || key === 'range') continue
          walk(current[key])
        }
      }

      walk(node)
      return found
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee?.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'where') return
        // `.where()` with nothing in it is drizzle-invalid anyway; leave it to the compiler.
        if (node.arguments.length === 0) return

        if (!node.arguments.some((argument) => namesTenant(argument))) {
          context.report({ node: callee.property, messageId: 'missing' })
        }
      },
    }
  },
}

export default requireTenantPredicate
