// A ready-made layout's written units turned into the units a chain is built
// from. Pure, so the save check, the set-up screen's drawing and the storefront
// read a ready-made layout exactly alike.
import type { LayoutUnitSpec } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { presetUnitsOf, type PresetConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'

/**
 * The layout's units, each slug looked up with `idOf` - the slug itself where
 * units are keyed by slug, an option value id on the storefront. Null when any
 * unit, or any unit stood in front of one, is not there to look up.
 */
export function presetLayoutUnits(
  preset: Pick<PresetConfig, 'valueSlugs' | 'units'>,
  idOf: (valueSlug: string) => string | undefined,
): LayoutUnitSpec[] | null {
  const specs: LayoutUnitSpec[] = []
  for (const unit of presetUnitsOf(preset)) {
    const pieceId = idOf(unit.valueSlug)
    const frontPieceId = unit.frontSlug === undefined ? undefined : idOf(unit.frontSlug)
    if (!pieceId || (unit.frontSlug !== undefined && !frontPieceId)) return null
    specs.push({
      pieceId,
      ...(frontPieceId ? { frontPieceId } : {}),
      ...(unit.turned ? { turned: true } : {}),
      ...(unit.flipped ? { flipped: true } : {}),
      ...(unit.cornered ? { cornered: unit.cornered } : {}),
    })
  }
  return specs
}
