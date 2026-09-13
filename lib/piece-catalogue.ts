// Joins a saved set-up to the product's live variation options: which option is
// the unit option today, which of its values the set-up describes, and one real
// variation standing for each (for its model file and its specification). Pure,
// so the storefront payload and the set-up screen resolve units identically.
import type { SvrOptionWithValues, VariantSelectorPayload } from '@/modules/shop-variations/lib/types'
import type { ConfiguratorConfig, PieceConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'

export interface ResolvedPiece {
  config: PieceConfig
  valueId: string
  label: string
  /** A variation carrying this unit, preferring one that is switched on and in stock. */
  representativeChildId: string | null
}

export interface ResolvedPieceCatalogue {
  pieceOption: SvrOptionWithValues
  pieces: ResolvedPiece[]
  /** Unit option value slug -> value id, for presets and link codes. */
  valueIdBySlug: ReadonlyMap<string, string>
}

/** Option names compare loosely: a renamed "unit " must not detach the set-up. */
export function sameOptionName(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase()
}

export function findOptionByName(
  options: readonly SvrOptionWithValues[],
  name: string,
): SvrOptionWithValues | null {
  return options.find((option) => sameOptionName(option.name, name)) ?? null
}

/** A variation carrying `valueId`, best candidate first. */
export function representativeChildFor(payload: VariantSelectorPayload, valueId: string): string | null {
  const carrying = payload.variants.filter((variant) => variant.optionValueIds.includes(valueId))
  const best =
    carrying.find((variant) => variant.enabled && variant.inStock) ??
    carrying.find((variant) => variant.enabled) ??
    carrying[0]
  return best?.childProductId ?? null
}

export function resolvePieceCatalogue(
  payload: VariantSelectorPayload,
  config: ConfiguratorConfig,
): ResolvedPieceCatalogue | null {
  const pieceOption = findOptionByName(payload.options, config.pieceOptionName)
  if (!pieceOption) return null
  const valueBySlug = new Map(pieceOption.values.map((value) => [value.slug, value]))
  const pieces: ResolvedPiece[] = []
  for (const pieceConfig of config.pieces) {
    const value = valueBySlug.get(pieceConfig.valueSlug)
    if (!value) continue
    pieces.push({
      config: pieceConfig,
      valueId: value.id,
      label: value.label,
      representativeChildId: representativeChildFor(payload, value.id),
    })
  }
  return {
    pieceOption,
    pieces,
    valueIdBySlug: new Map(pieceOption.values.map((value) => [value.slug, value.id])),
  }
}
