// How a basket's layout lines group, worked out over the whole basket at once.
//
// Pattern: a pure planner the cart-line prefetch calls with every line, whose
// answers the per-line resolver then reads back by (layout, product). The
// per-line resolve is deliberately blind to its neighbours, and "which line do
// the others nest under" is a question about neighbours.
//
// The head of a layout is normally its first line. The exception is a line
// another module has already made the head of its own group - the accessories
// box does this to the line an accessory was bought for. Shop keeps one group
// per line (the first resolver to declare one wins, in no promised order), so
// two modules declaring two different groups on that line would split the set
// unpredictably. Instead the layout joins the group that line already heads:
// its units and the accessories nest under the one line, whichever resolver
// happens to run first. The accessories box's stamp is read defensively and
// only for its head role; if it is absent or changes shape, the layout simply
// groups on its own key, which is exactly the behaviour without that module.
import { readLayoutLineMeta, type LayoutLineMeta } from '@/modules/modular-configurator-for-shop/lib/line-meta'

/** The accessories box's line-meta key and the head role it stamps. */
const ACCESSORY_GROUP_META_KEY = 'productAddons'

export interface BasketLineForGrouping {
  productId: string
  meta: Record<string, unknown> | undefined
}

export interface LayoutLineGrouping {
  meta: LayoutLineMeta
  groupKey: string
  isHead: boolean
  /** True when every line the layout went in as is still in the basket. */
  complete: boolean
  /** True when the group is shared with another module's set. */
  sharedGroup: boolean
}

export function layoutGroupingKey(layoutId: string, productId: string): string {
  return `${layoutId}|${productId}`
}

function ownGroupKey(layoutId: string): string {
  return `mcl_${layoutId}`
}

/** The group another module has made this line the head of, if any. */
function foreignHeadGroup(meta: Record<string, unknown> | undefined): string | null {
  const stamp = meta?.[ACCESSORY_GROUP_META_KEY]
  if (!stamp || typeof stamp !== 'object') return null
  const { group, role } = stamp as { group?: unknown; role?: unknown }
  return role === 'main' && typeof group === 'string' && group.length > 0 ? group : null
}

interface CollectedLine {
  productId: string
  meta: LayoutLineMeta
  foreignGroup: string | null
}

export function planLayoutGroups(lines: readonly BasketLineForGrouping[]): Map<string, LayoutLineGrouping> {
  const byLayout = new Map<string, CollectedLine[]>()
  for (const line of lines) {
    const meta = readLayoutLineMeta(line.meta)
    if (!meta) continue
    const collected = byLayout.get(meta.layoutId) ?? []
    collected.push({ productId: line.productId, meta, foreignGroup: foreignHeadGroup(line.meta) })
    byLayout.set(meta.layoutId, collected)
  }

  const plan = new Map<string, LayoutLineGrouping>()
  for (const [layoutId, collected] of byLayout) {
    const ordered = [...collected].sort((first, second) => first.meta.order - second.meta.order)
    const foreignHead = ordered.find((line) => line.foreignGroup !== null)
    const head = foreignHead ?? ordered[0]
    if (!head) continue
    const groupKey = foreignHead?.foreignGroup ?? ownGroupKey(layoutId)
    const expectedLines = Math.max(...ordered.map((line) => line.meta.lineCount))
    const complete = new Set(ordered.map((line) => line.productId)).size >= expectedLines
    for (const line of ordered) {
      plan.set(layoutGroupingKey(layoutId, line.productId), {
        meta: line.meta,
        groupKey,
        isHead: line === head,
        complete,
        sharedGroup: foreignHead !== undefined,
      })
    }
  }
  return plan
}
