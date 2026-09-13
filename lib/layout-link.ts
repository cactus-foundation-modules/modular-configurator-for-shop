// Where a "create your own layout" link goes, worked out from what the shopper
// has chosen on the product carrying it. Pure, so the storefront island, the
// set-up screen and the tests all build the same address.
//
// Three decisions, each small:
//   1. Which starting layout: the first one whose condition the shopper's
//      choices meet, else the one with no condition, else none at all.
//   2. Which choices travel: a choice goes across when the builder product has
//      an option of the same name holding the same value, or - where the names
//      differ ("Back Height" here, "Back" there) - when exactly one of its
//      options holds a value with that slug. Two candidates is a guess, and a
//      guess is left behind rather than picking the wrong fabric.
//   3. The address: the builder product's page, its own option parameters (so
//      its page opens on those choices) and the layout code, which opens the
//      "Build a layout" tab already laid out.
import { findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { LAYOUT_PARAM } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import type { StartingLayout } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import { sameOptionName } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'

/** What the storefront block hands its island (see layout-link-storefront.ts). */
export interface LayoutLinkBlockData {
  /** The product carrying the link: its selection is read by this slug. */
  slug: string
  leadText: string
  linkText: string
  newTab: boolean
  targetHref: string
  startingLayouts: StartingLayout[]
  targetOptions: TargetOption[]
}

/** One choice the shopper has made on the product carrying the link. */
export interface ChosenValue {
  optionName: string
  valueSlug: string
}

/** One of the builder product's options other than its unit option. */
export interface TargetOption {
  name: string
  /** The option's parameter name on the builder product's page. */
  paramKey: string
  valueSlugs: readonly string[]
}

export function pickStartingLayout(layouts: readonly StartingLayout[], chosen: readonly ChosenValue[]): StartingLayout | null {
  const matching = layouts.find(
    (layout) =>
      layout.when !== null &&
      chosen.some((choice) => sameOptionName(choice.optionName, layout.when?.optionName ?? '') && choice.valueSlug === layout.when?.valueSlug),
  )
  return matching ?? layouts.find((layout) => layout.when === null) ?? null
}

export function carriedChoices(chosen: readonly ChosenValue[], targetOptions: readonly TargetOption[]): Array<[paramKey: string, valueSlug: string]> {
  const carried: Array<[string, string]> = []
  const claimed = new Set<string>()
  for (const choice of chosen) {
    const byName = targetOptions.find((option) => sameOptionName(option.name, choice.optionName))
    // Same name, value not made there: the builder has no such choice, so
    // nothing travels - not even to an option that happens to share the slug.
    const target = byName
      ? byName.valueSlugs.includes(choice.valueSlug) ? byName : null
      : onlyOptionHolding(targetOptions, choice.valueSlug)
    if (!target || claimed.has(target.paramKey)) continue
    claimed.add(target.paramKey)
    carried.push([target.paramKey, choice.valueSlug])
  }
  return carried
}

function onlyOptionHolding(options: readonly TargetOption[], valueSlug: string): TargetOption | null {
  const holding = options.filter((option) => option.valueSlugs.includes(valueSlug))
  return holding.length === 1 ? holding[0] ?? null : null
}

/** The link's address. `targetHref` is the builder product's page, site-relative. */
export function layoutLinkHref(
  targetHref: string,
  layout: StartingLayout | null,
  carried: ReadonlyArray<readonly [string, string]>,
): string {
  const params = new URLSearchParams()
  for (const [key, valueSlug] of carried) params.set(key, valueSlug)
  if (layout) params.set(LAYOUT_PARAM, layout.valueSlugs.join('.'))
  const query = params.toString()
  return query ? `${targetHref}?${query}` : targetHref
}

/** The builder's units as the chain rules want them, keyed by value slug. */
export function definitionsBySlug(config: ConfiguratorConfig): Map<string, PieceDefinition> {
  return new Map(
    config.pieces.map((piece) => [
      piece.valueSlug,
      { pieceId: piece.valueSlug, shape: piece.shape, widthMm: piece.widthMm, depthMm: piece.depthMm },
    ]),
  )
}

/**
 * The starting layouts the builder can still draw today. One naming a unit since
 * taken out of the builder, or no longer joinable, is dropped: the link then
 * falls through to the next layout that fits rather than opening on a refusal.
 */
export function usableStartingLayouts(layouts: readonly StartingLayout[], config: ConfiguratorConfig): StartingLayout[] {
  const definitions = definitionsBySlug(config)
  return layouts.filter((layout) => {
    if (layout.valueSlugs.some((slug) => !definitions.has(slug))) return false
    const chain = layout.valueSlugs.map((pieceId, index) => ({ entryId: `link-${index}`, pieceId }))
    return findChainProblem(chain, definitions, { maxPieces: config.maxPieces }) === null
  })
}
