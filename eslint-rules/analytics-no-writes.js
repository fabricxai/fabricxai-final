/**
 * `analytics-no-writes` — enforcement for CLAUDE.md rule 9.
 *
 * `modules/analytics` is read-only. It exists to answer the owner's questions across
 * every other module's data, which means it necessarily imports widely — and that is
 * exactly why it must not be able to write. An analytics query that quietly "fixes" a
 * row is a reporting layer mutating the thing it reports on, and nobody would look there
 * when the numbers stop reconciling.
 *
 * Three shapes are banned:
 *   1. Drizzle write builders — `.insert()`, `.update()`, `.delete()`.
 *   2. Importing the write-side of core — `withTenantTx`, `pending-changes`, `outbox`,
 *      `offline-sync`. `withTenantRead` is the sanctioned entry point.
 *   3. Importing another module's `service.ts` — services own writes; reads cross module
 *      boundaries through the owner's `queries.ts` (rule 11).
 */

const WRITE_METHODS = new Set(['insert', 'update', 'delete'])

/** Core exports that can only be used to write. */
const BANNED_IMPORTS = new Set(['withTenantTx', 'propose', 'approve', 'reject', 'emit', 'recordChange', 'notify', 'syncBatch'])
const BANNED_MODULES = [/\/pending-changes$/, /\/outbox$/, /\/offline-sync$/, /\/audit$/]

const analyticsNoWrites = {
  meta: {
    type: 'problem',
    docs: {
      description: 'modules/analytics is read-only (CLAUDE.md rule 9)',
    },
    schema: [],
    messages: {
      writeCall:
        '`.{{method}}()` is a write. modules/analytics is read-only — derive from the owning module\'s queries.ts instead.',
      writeImport:
        'Importing `{{name}}` into modules/analytics is banned: it is a write operation. Use withTenantRead and the owning module\'s queries.ts.',
      writeModule:
        'modules/analytics may not import `{{source}}` — that module exists to write. Read through the owning module\'s queries.ts.',
      serviceImport:
        'modules/analytics may not import another module\'s service.ts (`{{source}}`). Services own writes; cross-module reads go through queries.ts (rule 11).',
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || node.property?.type !== 'Identifier') return
        if (!WRITE_METHODS.has(node.property.name)) return
        // Only flag it when it is actually being called: `db.insert(...)`, `tx.update(...)`.
        if (node.parent?.type !== 'CallExpression' || node.parent.callee !== node) return

        context.report({ node, messageId: 'writeCall', data: { method: node.property.name } })
      },

      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return

        if (/\/service$/.test(source) || /\/service\.ts$/.test(source)) {
          context.report({ node, messageId: 'serviceImport', data: { source } })
          return
        }

        if (BANNED_MODULES.some((re) => re.test(source))) {
          context.report({ node, messageId: 'writeModule', data: { source } })
          return
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          const name = specifier.imported?.name
          if (BANNED_IMPORTS.has(name)) {
            context.report({ node: specifier, messageId: 'writeImport', data: { name } })
          }
        }
      },
    }
  },
}

export default analyticsNoWrites
