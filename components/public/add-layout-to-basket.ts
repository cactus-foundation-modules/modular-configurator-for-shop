'use client'

// Puts a built layout in the basket.
//
// The lines themselves come from the pure builder (lib/basket-lines). What this
// adds is the page around them: shop-variations' purchase companions are asked
// about each unit exactly as an ordinary add-to-basket asks about the one
// variation it adds. That is how an accessory already in the basket for one of
// these units (the product add-ons box stamps its group this way) finds its
// unit, whichever order the shopper bought in. Only the first line's companion
// LINES are added - a companion that rides along on a purchase rides along once.
import { addToCart } from '@/modules/shop/components/public/cart'
import { collectPurchaseCompanions } from '@/modules/shop-variations/lib/purchase-companions'
import {
  buildLayoutBasketLines,
  layoutIdFromBytes,
  type LayoutBasketLine,
} from '@/modules/modular-configurator-for-shop/lib/basket-lines'
import type { PricedUnit } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'

export interface AddLayoutRequest {
  slug: string
  parentProductId: string
  units: readonly PricedUnit[]
  shapeLabel: string
  arrangement: string
  code: string
  layoutQuantity: number
}

function freshLayoutId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return layoutIdFromBytes(bytes)
}

function withCompanionMeta(line: LayoutBasketLine, companionMeta: Record<string, unknown>): LayoutBasketLine {
  const meta = { ...line.meta }
  for (const [key, value] of Object.entries(companionMeta)) {
    // The layout's own key is never given up to a companion.
    if (!(key in meta)) meta[key] = value
  }
  return { ...line, meta }
}

/** Adds the layout; returns how many basket lines it went in as. */
export function addLayoutToBasket(request: AddLayoutRequest): number {
  const lines = buildLayoutBasketLines({
    layoutId: freshLayoutId(),
    parentProductId: request.parentProductId,
    units: request.units,
    shapeLabel: request.shapeLabel,
    arrangement: request.arrangement,
    code: request.code,
    layoutQuantity: request.layoutQuantity,
  })

  const companionLines: Array<{ productId: string; quantity: number; lineId?: string; meta?: Record<string, unknown> }> = []
  const stamped = lines.map((line, index) => {
    const companions = collectPurchaseCompanions({
      slug: request.slug,
      parentProductId: request.parentProductId,
      productId: line.productId,
      quantity: line.quantity,
    })
    if (index === 0) companionLines.push(...companions.lines)
    return withCompanionMeta(line, companions.mainMeta)
  })

  // The basket lists newest first, so the first unit goes in last and heads the
  // stored list as well as the displayed group.
  for (const line of [...stamped].reverse()) {
    addToCart(line.productId, line.quantity, { lineId: line.lineId, meta: line.meta })
  }
  for (const line of companionLines) {
    addToCart(line.productId, line.quantity, { lineId: line.lineId, meta: line.meta })
  }
  return stamped.length
}
