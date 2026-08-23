/**
 * The header a sub-page wears: where you are, and one step back.
 *
 * `PageHeader` takes a `back` link and the page supplies it; `Breadcrumbs` takes a trail
 * and the page hand-writes it. Both were optional, so eight sub-pages had a trail and
 * seventeen had neither — you could reach `/quality/measurements` and the only way out
 * was the sidebar, which does not say what you are inside of.
 *
 * This composes the two from `routes.ts`, so a page declares its pattern and gets the
 * trail, the back link and the Bangla for free. Pages that already know better still
 * pass their own `back` — a sample opened from an order should return to the order.
 */
import type { ReactNode } from 'react'

import { Breadcrumbs } from '@/components/fx/data'
import type { Locale } from '@/lib/i18n'
import { requestLocale } from '@/lib/ui-locale'

import { PageHeader } from './page-shell'
import { routeParent, routeTrail } from './routes'

/**
 * Server component: it reads the request's locale itself rather than making every page
 * thread one through. Half the sub-pages already had `requestLocale` for their own copy
 * and half did not, and a trail that renders in English above a Bangla screen is worse
 * than no trail.
 */
export async function RouteHeader({
  /** Concrete path of THIS page, e.g. `/orders/${orderId}/fabric`. */
  path,
  /** Labels for dynamic segments, keyed by parameter name: `{ orderId: po }`. */
  labels,
  locale,
  eyebrow,
  title,
  meta,
  actions,
  ownsAmber = true,
  /** Overrides the parent from the tree — for a row reached from somewhere else. */
  back,
  /**
   * Drop the trail and keep only the back link. For a screen one level down whose
   * parent is already obvious from the sidebar, two lines of chrome above a heading
   * is more furniture than orientation.
   */
  trail = true,
}: {
  path: string
  labels?: Readonly<Record<string, string>>
  /** Override the request's locale. Pages that already resolved one may pass it. */
  locale?: Locale
  eyebrow?: ReactNode
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  ownsAmber?: boolean
  back?: { href: string; label: string }
  trail?: boolean
}) {
  const opts = { labels, locale: locale ?? (await requestLocale()) }
  const crumbs = routeTrail(path, opts)
  const parent = routeParent(path, opts)
  const backLink = back ?? (parent?.href ? { href: parent.href, label: parent.label } : undefined)

  return (
    <>
      {trail && crumbs.length > 1 ? (
        <div style={{ marginBottom: 18 }}>
          <Breadcrumbs trail={crumbs} />
        </div>
      ) : null}
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        meta={meta}
        actions={actions}
        ownsAmber={ownsAmber}
        back={backLink}
      />
    </>
  )
}
