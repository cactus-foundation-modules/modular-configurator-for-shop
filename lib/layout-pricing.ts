// Turns a layout into what it costs: each unit resolved to the exact variation it
// is (its unit value, the layout's choices, and any choices of its own), then
// summed. Pure, and fed the same variation payload the product page's own price
// uses, so a unit costs in the builder exactly what it costs on its own.
import { resolveVariant, type OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { VariantSelectorPayload, VariantSelectorVariant } from '@/modules/shop-variations/lib/types'
import { layoutEntriesExpanded, type ChainEntry } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

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
  /**
   * Options where this unit is not in the layout's choice, because it is not
   * made in it, and was matched to the nearest combination it is made in. The
   * unit's own choices are never among them.
   */
  adjustedOptionIds: string[]
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

function priceUnit(
  payload: VariantSelectorPayload,
  entry: ChainEntry,
  pieceOptionId: string,
  layoutChoices: OptionSelection,
  ownChoices: OptionSelection | undefined,
): PricedUnit {
  const selection = unitSelection(entry, pieceOptionId, layoutChoices, ownChoices)
  const needsChoice = payload.options.some((option) => !selection[option.id])
  if (needsChoice) return { entry, selection, variant: null, problem: 'needs-choice', adjustedOptionIds: [] }
  const exact = resolveVariant(payload, selection)
  if (exact && exact.enabled) {
    return { entry, selection, variant: exact, problem: exact.inStock ? null : 'out-of-stock', adjustedOptionIds: [] }
  }
  const nearest = nearestMadeCombination(payload, pieceOptionId, selection, ownChoices ?? {})
  if (!nearest) return { entry, selection, variant: null, problem: 'unavailable', adjustedOptionIds: [] }
  return {
    entry,
    selection: nearest.selection,
    variant: nearest.variant,
    problem: nearest.variant.inStock ? null : 'out-of-stock',
    adjustedOptionIds: nearest.adjustedOptionIds,
  }
}

interface NearestCombination {
  variant: VariantSelectorVariant
  selection: OptionSelection
  adjustedOptionIds: string[]
}

/**
 * The switched-on variation of this unit that departs least from the layout's
 * choices, keeping every choice the unit made for itself.
 *
 * A range whose units do not all come in every value - backless units only in a
 * standard back, backed ones only high or low - otherwise has no layout-wide
 * choice under which a mixed layout can be bought at all. Nearest means fewest
 * options changed, then values closest in the option's own order (so "Standard"
 * finds "Low Back" before "High Back" when that is how the owner listed them),
 * then in stock before out of stock.
 */
function nearestMadeCombination(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  wanted: OptionSelection,
  ownChoices: OptionSelection,
): NearestCombination | null {
  const others = payload.options.filter((option) => option.id !== pieceOptionId)
  let best: { combination: NearestCombination; rank: [number, number, number] } | null = null
  for (const variant of payload.variants) {
    if (!variant.enabled || !variant.optionValueIds.includes(wanted[pieceOptionId] ?? '')) continue
    const selection: OptionSelection = { [pieceOptionId]: wanted[pieceOptionId] ?? '' }
    const adjustedOptionIds: string[] = []
    let distance = 0
    let keepsOwnChoices = true
    for (const option of others) {
      const valueHere = option.values.find((value) => variant.optionValueIds.includes(value.id))
      if (!valueHere) {
        keepsOwnChoices = false
        break
      }
      selection[option.id] = valueHere.id
      if (valueHere.id === wanted[option.id]) continue
      if (ownChoices[option.id]) {
        keepsOwnChoices = false
        break
      }
      adjustedOptionIds.push(option.id)
      const wantedPosition = option.values.findIndex((value) => value.id === wanted[option.id])
      const herePosition = option.values.indexOf(valueHere)
      distance += Math.abs(herePosition - wantedPosition)
    }
    if (!keepsOwnChoices) continue
    const rank: [number, number, number] = [adjustedOptionIds.length, distance, variant.inStock ? 0 : 1]
    if (!best || compareRanks(rank, best.rank) < 0) best = { combination: { variant, selection, adjustedOptionIds }, rank }
  }
  return best?.combination ?? null
}

/**
 * Whether a unit comes in `valueId` of `optionId` at all: some switched-on
 * variation of it carries that value and every other choice the unit made for
 * itself. The layout's own choices do not count against it - a unit not made in
 * one of those simply takes the nearest it is made in.
 */
export function unitIsMadeIn(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  pieceId: string,
  optionId: string,
  valueId: string,
  ownChoices: OptionSelection,
): boolean {
  const required = [
    pieceId,
    valueId,
    ...Object.entries(ownChoices).flatMap(([ownOptionId, ownValueId]) =>
      ownOptionId === optionId || ownOptionId === pieceOptionId || !ownValueId ? [] : [ownValueId],
    ),
  ]
  return payload.variants.some((variant) => variant.enabled && required.every((id) => variant.optionValueIds.includes(id)))
}

/**
 * Whether choosing `valueId` for the whole layout reaches any unit: at least one
 * unit that follows the layout on this option comes in it. A value no unit comes
 * in would change nothing, so it is offered crossed out. With every unit choosing
 * for itself, the layout's choice changes nothing either way and is never refused.
 */
export function layoutValueReachesAUnit(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  chain: readonly ChainEntry[],
  unitChoices: Readonly<Record<string, OptionSelection>>,
  optionId: string,
  valueId: string,
): boolean {
  const expanded = layoutEntriesExpanded(chain)
  const followers = expanded.filter((entry) => !unitChoices[entry.entryId]?.[optionId])
  if (followers.length === 0) return true
  return followers.some((entry) => unitIsMadeIn(payload, pieceOptionId, entry.pieceId, optionId, valueId, unitChoices[entry.entryId] ?? {}))
}

function compareRanks(first: readonly number[], second: readonly number[]): number {
  for (let index = 0; index < first.length; index += 1) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function priceLayout(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  chain: readonly ChainEntry[],
  layoutChoices: OptionSelection,
  unitChoices: Readonly<Record<string, OptionSelection>>,
): LayoutPrice {
  const units = layoutEntriesExpanded(chain).map((entry) =>
    priceUnit(payload, entry, pieceOptionId, layoutChoices, unitChoices[entry.entryId]),
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
