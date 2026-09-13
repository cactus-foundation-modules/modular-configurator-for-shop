// Turns a layout into what it costs: each unit resolved to the exact variation it
// is (its unit value, the layout's choices, and any choices of its own), then
// summed. Pure, and fed the same variation payload the product page's own price
// uses, so a unit costs in the builder exactly what it costs on its own.
import { resolveVariant, type OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { VariantSelectorPayload, VariantSelectorVariant } from '@/modules/shop-variations/lib/types'
import type { ChainEntry } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

/** Why one unit of a layout cannot be bought as it stands. */
export type UnitProblem =
  /** An option still needs choosing (the layout's own, before anything is picked). */
  | 'needs-choice'
  /** No variation exists for this combination, or it is switched off. */
  | 'unavailable'
  | 'out-of-stock'

export interface PricedUnit {
  entry: ChainEntry
  /** The full selection this unit resolves from. */
  selection: OptionSelection
  variant: VariantSelectorVariant | null
  problem: UnitProblem | null
}

export interface LayoutPrice {
  units: PricedUnit[]
  /** Sum of every resolvable unit's price, sale prices included. */
  total: number
  /** The summed RRP, only when every unit has one and it beats the total. */
  retailTotal: number | null
  /** The summed normal price, only when some unit is on offer. */
  compareAtTotal: number | null
  /** True when every unit resolves to an enabled, in-stock variation. */
  buyable: boolean
}

/** Half a penny: money compared with this much slack is never a rounding crumb. */
const PENNY_TOLERANCE = 0.005

export function unitSelection(
  entry: ChainEntry,
  pieceOptionId: string,
  layoutChoices: OptionSelection,
  ownChoices: OptionSelection | undefined,
): OptionSelection {
  return { ...layoutChoices, ...(ownChoices ?? {}), [pieceOptionId]: entry.pieceId }
}

function priceUnit(payload: VariantSelectorPayload, entry: ChainEntry, selection: OptionSelection): PricedUnit {
  const needsChoice = payload.options.some((option) => !selection[option.id])
  if (needsChoice) return { entry, selection, variant: null, problem: 'needs-choice' }
  const variant = resolveVariant(payload, selection)
  if (!variant || !variant.enabled) return { entry, selection, variant: null, problem: 'unavailable' }
  return { entry, selection, variant, problem: variant.inStock ? null : 'out-of-stock' }
}

export function priceLayout(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  chain: readonly ChainEntry[],
  layoutChoices: OptionSelection,
  unitChoices: Readonly<Record<string, OptionSelection>>,
): LayoutPrice {
  const units = chain.map((entry) =>
    priceUnit(payload, entry, unitSelection(entry, pieceOptionId, layoutChoices, unitChoices[entry.entryId])),
  )
  const resolved = units.flatMap((unit) => (unit.variant ? [unit.variant] : []))
  const total = sumOf(resolved.map((variant) => variant.price))
  const allResolved = resolved.length === units.length && units.length > 0

  const retailFigures = resolved.map((variant) => variant.retailPrice ?? null)
  const retailTotal =
    allResolved && retailFigures.every((figure): figure is number => figure !== null)
      ? sumOf(retailFigures)
      : null

  const anyOnOffer = resolved.some((variant) => variant.compareAtPrice !== null)
  const compareAtTotal = allResolved && anyOnOffer
    ? sumOf(resolved.map((variant) => variant.compareAtPrice ?? variant.price))
    : null

  return {
    units,
    total,
    retailTotal: retailTotal !== null && retailTotal > total + PENNY_TOLERANCE ? retailTotal : null,
    compareAtTotal: compareAtTotal !== null && compareAtTotal > total + PENNY_TOLERANCE ? compareAtTotal : null,
    buyable: allResolved && units.every((unit) => unit.problem === null),
  }
}

/** Sums money without floating-point dust: to the penny, then back to pounds. */
function sumOf(amounts: readonly number[]): number {
  return Math.round(amounts.reduce((running, amount) => running + Math.round(amount * 100), 0)) / 100
}

/** The cheapest this unit comes in, across every choice still open to it. */
export function fromPriceOfPiece(payload: VariantSelectorPayload, pieceId: string): number | null {
  const prices = payload.variants
    .filter((variant) => variant.enabled && variant.optionValueIds.includes(pieceId))
    .map((variant) => variant.price)
  return prices.length > 0 ? Math.min(...prices) : null
}
