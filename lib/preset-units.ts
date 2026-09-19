// A ready-made layout's written units turned into the units a chain is built
// from. Pure, so the save check, the set-up screen's drawing and the storefront
// read a ready-made layout exactly alike.
import { chainFromUnits, type ChainLimits, type EditRefusal, type LayoutUnitSpec } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { layoutPieceCount, piecesOverlap, placeLayout, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { presetUnitsOf, type PresetConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { canStandFree, freeUnitFromSpot, placeFreeUnits, type FreeUnitSpot } from '@/modules/modular-configurator-for-shop/lib/free-units'

/** A ready-made layout's unit standing on its own, looked up the way its layout units are. */
export interface PresetFreeSpec {
  pieceId: string
  spot: FreeUnitSpot
}

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

/** The layout's units standing on their own, looked up with `idOf`. Null when any is not there to look up. */
export function presetFreeUnits(
  preset: Pick<PresetConfig, 'free'>,
  idOf: (valueSlug: string) => string | undefined,
): PresetFreeSpec[] | null {
  const specs: PresetFreeSpec[] = []
  for (const unit of preset.free ?? []) {
    const pieceId = idOf(unit.valueSlug)
    if (!pieceId) return null
    specs.push({ pieceId, spot: { x: unit.x, z: unit.z, turnDegrees: unit.turnDegrees } })
  }
  return specs
}

/**
 * What stops a ready-made layout's units on their own from standing where it
 * puts them, or null: the range does not allow them, one is a unit that only
 * joins a layout, there are more units in all than the limit, or one sits on
 * the layout or on another. The layout's own units are placed the way a link
 * reopens them - the first at the origin, facing forward.
 */
export function presetFreeProblem(
  units: readonly LayoutUnitSpec[],
  free: readonly PresetFreeSpec[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditRefusal | null {
  if (free.length === 0) return null
  if (limits.freeUnits !== true) return 'free-units-not-offered'
  if (free.some((unit) => { const definition = definitions.get(unit.pieceId); return !definition || !canStandFree(definition) })) return 'cannot-stand-free'
  const chain = chainFromUnits(units, 'preset-')
  if (layoutPieceCount(chain) + free.length > limits.maxPieces) return 'too-many-pieces'
  const layout = placeLayout(chain, definitions)
  const placedFree = placeFreeUnits(free.map((unit, index) => freeUnitFromSpot(`preset-free-${index}`, unit.pieceId, unit.spot)), definitions)
  const clash = placedFree.some((unit, index) =>
    [...layout, ...placedFree.slice(index + 1)].some((other) => piecesOverlap(unit, other)),
  )
  return clash ? 'would-overlap' : null
}
