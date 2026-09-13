// A priced layout as basket lines. Pure: the product page hands the result to
// shop's addToCart, and tests read it directly.
//
// One line per distinct variation, not per unit - two identical central seats
// are one line of two, exactly as if the shopper had added them by hand - in the
// order each first appears in the layout, so the basket reads left to right
// like the layout does. The first line is the one the rest nest under.
import {
  LAYOUT_META_KEY,
  fitArrangement,
  fitCode,
  type LayoutLineMeta,
} from '@/modules/modular-configurator-for-shop/lib/line-meta'
import type { PricedUnit } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'

export interface LayoutBasketLine {
  productId: string
  quantity: number
  lineId: string
  meta: Record<string, unknown>
}

export interface LayoutBasketInput {
  layoutId: string
  parentProductId: string
  units: readonly PricedUnit[]
  shapeLabel: string
  arrangement: string
  code: string
  /** How many of the whole layout, each unit multiplied by it. */
  layoutQuantity: number
}

export class UnbuyableLayoutError extends Error {
  constructor() {
    super('Every unit in a layout must resolve to a buyable variation before it goes in the basket')
    this.name = 'UnbuyableLayoutError'
  }
}

/** The line id shop keys the line by - kept under its 64-character limit. */
export function layoutLineId(layoutId: string, childProductId: string): string {
  return `mcl:${layoutId}:${childProductId}`
}

export function buildLayoutBasketLines(input: LayoutBasketInput): LayoutBasketLine[] {
  const countsByChild = new Map<string, number>()
  for (const unit of input.units) {
    if (!unit.variant || unit.problem) throw new UnbuyableLayoutError()
    const childProductId = unit.variant.childProductId
    countsByChild.set(childProductId, (countsByChild.get(childProductId) ?? 0) + 1)
  }
  const quantity = Math.max(1, Math.floor(input.layoutQuantity))
  const lineCount = countsByChild.size
  return [...countsByChild].map(([childProductId, count], order) => {
    const meta: LayoutLineMeta = {
      layoutId: input.layoutId,
      role: order === 0 ? 'main' : 'unit',
      parentProductId: input.parentProductId,
      shapeLabel: input.shapeLabel,
      unitCount: input.units.length * quantity,
      lineCount,
      arrangement: fitArrangement(input.arrangement),
      code: fitCode(input.code),
      order,
    }
    return {
      productId: childProductId,
      quantity: count * quantity,
      lineId: layoutLineId(input.layoutId, childProductId),
      meta: { [LAYOUT_META_KEY]: meta },
    }
  })
}

const LAYOUT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** A 10-character layout id from random bytes (the caller supplies the bytes). */
export function layoutIdFromBytes(bytes: Uint8Array): string {
  let id = ''
  for (const byte of bytes.slice(0, 10)) id += LAYOUT_ID_ALPHABET[byte % LAYOUT_ID_ALPHABET.length] ?? 'a'
  return id.padEnd(10, 'a')
}
