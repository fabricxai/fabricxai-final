export type SearchHitKind =
  | 'module'
  | 'order'
  | 'buyer'
  | 'lead'
  | 'lc'
  | 'sample'
  | 'requisition'
  | 'ud'

export interface SearchHit {
  kind: SearchHitKind
  id: string
  title: string
  subtitle: string
  href: string
}
