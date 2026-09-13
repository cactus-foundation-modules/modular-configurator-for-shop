// The shop.cart-line-resolver for layouts.
//
// Money never moves here: every unit of a layout IS its variation, priced by
// shop like any other line. This resolver only declares the grouping (so every
// basket surface, the order confirmation and the emails keep a layout together),
// prints what the layout is and how it goes together on its first line, and
// checks each line still belongs to the listing it was built on.
//
// Removed units degrade, never fail: a shopper who takes one seat out of an L
// still has real products at real prices, so the lines stay valid and the head
// line says the layout has changed.
//
// Everything cross-line (which line heads the layout, is any of it missing) is
// planned in the PREFETCH, which sees the whole basket, and parked in a
// request-scoped store for the per-line pass to read back.
import { cache } from 'react'
import type { CartLinePrefetchLine, CartLineResolution, CartLineResolver, CartLineResolverPrefetch } from '@/modules/shop/lib/line-meta'
import type { LineMetaField, ShpProduct } from '@/modules/shop/lib/types'
import { getVariantParentsByChild } from '@/modules/shop-variations/lib/db/variants'
import { layoutGroupingKey, planLayoutGroups, type LayoutLineGrouping } from '@/modules/modular-configurator-for-shop/lib/layout-groups'
import { LAYOUT_META_KEY, readLayoutLineMeta } from '@/modules/modular-configurator-for-shop/lib/line-meta'
import { unitCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'

interface LayoutRequestStore {
  groupingByLine: Map<string, LayoutLineGrouping>
  parentByChild: Map<string, string>
  prefetched: boolean
}

const requestStore = cache((): LayoutRequestStore => ({
  groupingByLine: new Map(),
  parentByChild: new Map(),
  prefetched: false,
}))

const VALID: CartLineResolution = { valid: true, priceAdjust: 0, persistMeta: null }

/** Units sort ahead of anything else in a shared group (an accessory, say). */
const UNIT_ORDER_OFFSET = -1000

export const prefetchLayoutLines: CartLineResolverPrefetch = async (
  _products: ShpProduct[],
  lines?: CartLinePrefetchLine[],
) => {
  const store = requestStore()
  if (!lines?.length) {
    store.prefetched = true
    return
  }
  const layoutLines = lines.filter((line) => readLayoutLineMeta(line.meta) !== null)
  store.groupingByLine = planLayoutGroups(layoutLines.map((line) => ({ productId: line.product.id, meta: line.meta })))
  store.parentByChild = await getVariantParentsByChild(layoutLines.map((line) => line.product.id))
  store.prefetched = true
}

export const resolveLayoutLineMeta: CartLineResolver = async (
  product: ShpProduct,
  meta: Record<string, unknown> | undefined,
): Promise<CartLineResolution> => {
  const layout = readLayoutLineMeta(meta)
  if (!layout) return VALID

  const store = requestStore()
  // A line claiming a listing it is not a variation of was not put there by a
  // layout. The product is still real, so it is not refused - it just does not
  // get to borrow the layout's grouping or wording.
  if (store.prefetched && store.parentByChild.get(product.id) !== layout.parentProductId) return VALID

  const grouping = store.prefetched ? store.groupingByLine.get(layoutGroupingKey(layout.layoutId, product.id)) : undefined
  // Without a prefetch (an older shop, or a surface that resolves one line on its
  // own) there is nothing to nest under safely: say what the line is and stop.
  if (!grouping) {
    return {
      ...VALID,
      persistMeta: { fields: [{ label: 'Part of layout', value: `${layout.shapeLabel}, ${unitCountLabel(layout.unitCount)}` }] },
    }
  }

  const persistedData = {
    [LAYOUT_META_KEY]: { layoutId: layout.layoutId, role: grouping.isHead ? 'main' : 'unit', code: layout.code, order: layout.order },
  }

  if (grouping.isHead) {
    const fields: LineMetaField[] = [
      { label: 'Layout', value: `${layout.shapeLabel}, ${unitCountLabel(layout.unitCount)}` },
      { label: 'Arrangement', value: layout.arrangement },
    ]
    if (!grouping.complete) fields.push({ label: 'Note', value: 'Part of this layout has been taken out of the basket' })
    return {
      ...VALID,
      persistMeta: { fields, data: persistedData },
      group: {
        key: grouping.groupKey,
        role: 'main',
        collectiveLabel: grouping.sharedGroup ? 'layout units and accessories' : 'layout units',
      },
    }
  }

  return {
    ...VALID,
    persistMeta: { fields: [], data: persistedData },
    group: {
      key: grouping.groupKey,
      role: 'attachment',
      caption: `Part of your ${layout.shapeLabel.toLowerCase()} layout`,
      depth: 1,
      order: UNIT_ORDER_OFFSET + layout.order,
    },
  }
}
