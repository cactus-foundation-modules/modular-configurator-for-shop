// Checks a set-up against the product it is for, beyond what the schema alone
// can say: the unit option exists, every unit is one of its values, and each
// ready-made layout can actually be built. Returns the first problem as a
// sentence for the owner, or null. Pure, so the save route and its tests agree.
import { chainFromUnits, findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { canBeFrontSpur, canHostFrontSpur, segmentInset, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { presetUnitsOf, type PieceConfig, type SaveConfiguratorBody } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { sameOptionName } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'
import { presetFreeProblem, presetFreeUnits, presetLayoutUnits } from '@/modules/modular-configurator-for-shop/lib/preset-units'

export interface OptionForValidation {
  name: string
  values: ReadonlyArray<{ slug: string; label: string }>
}

export function validateConfigAgainstOptions(
  body: SaveConfiguratorBody,
  options: readonly OptionForValidation[],
): string | null {
  const { config } = body
  const pieceOption = options.find((option) => sameOptionName(option.name, config.pieceOptionName))
  if (!pieceOption) return `This product has no option called "${config.pieceOptionName}"`

  const labelBySlug = new Map(pieceOption.values.map((value) => [value.slug, value.label]))
  const seen = new Set<string>()
  for (const piece of config.pieces) {
    if (!labelBySlug.has(piece.valueSlug)) return `"${piece.valueSlug}" is not one of the ${pieceOption.name} choices`
    const label = labelBySlug.get(piece.valueSlug) ?? piece.valueSlug
    if (seen.has(piece.valueSlug)) return `${label} is set up twice`
    seen.add(piece.valueSlug)
    const sizeProblem = pieceSizeProblem(piece)
    if (sizeProblem) return `${label} ${sizeProblem}`
  }
  if (body.enabled && config.pieces.length === 0) return 'Set up at least one unit before switching the layout builder on'

  const definitions = new Map<string, PieceDefinition>(
    config.pieces.map((piece) => [
      piece.valueSlug,
      { pieceId: piece.valueSlug, shape: piece.shape, widthMm: piece.widthMm, depthMm: piece.depthMm },
    ]),
  )
  const presetNames = new Set<string>()
  for (const preset of config.presets) {
    const name = preset.name.trim().toLowerCase()
    if (presetNames.has(name)) return `There are two ready-made layouts called "${preset.name}"`
    presetNames.add(name)
    const units = presetUnitsOf(preset)
    const labelOf = (slug: string) => labelBySlug.get(slug) ?? slug
    const unknown = units.flatMap((unit) => [unit.valueSlug, ...(unit.frontSlug ? [unit.frontSlug] : [])]).find((slug) => !definitions.has(slug))
    if (unknown) return `"${preset.name}" uses ${labelOf(unknown)}, which is not set up as a unit`
    for (const unit of units) {
      const host = definitions.get(unit.valueSlug)
      const front = unit.frontSlug ? definitions.get(unit.frontSlug) : undefined
      if (unit.frontSlug && !config.frontUnits) {
        return `"${preset.name}" stands ${labelOf(unit.frontSlug)} in front of ${labelOf(unit.valueSlug)}, but this range is not set to stand units in front of one another. Switch "Units in front of other units" on, or take it out of the layout`
      }
      if (unit.frontSlug && host && front && !(canHostFrontSpur(host) && canBeFrontSpur(front))) {
        return `"${preset.name}" stands ${labelOf(unit.frontSlug)} in front of ${labelOf(unit.valueSlug)}: only a straight unit with no back can stand in front, and only of a straight unit with one`
      }
    }
    const specs = presetLayoutUnits(preset, (slug) => (definitions.has(slug) ? slug : undefined)) ?? []
    const problem = findChainProblem(chainFromUnits(specs, 'check-'), definitions, { maxPieces: config.maxPieces, frontUnits: config.frontUnits })
    if (problem) return `"${preset.name}" cannot be built: ${PRESET_PROBLEM_WORDING[problem]}`
    const unknownFree = (preset.free ?? []).find((unit) => !definitions.has(unit.valueSlug))
    if (unknownFree) return `"${preset.name}" uses ${labelOf(unknownFree.valueSlug)}, which is not set up as a unit`
    const free = presetFreeUnits(preset, (slug) => (definitions.has(slug) ? slug : undefined)) ?? []
    const freeProblem = presetFreeProblem(specs, free, definitions, { maxPieces: config.maxPieces, frontUnits: config.frontUnits, freeUnits: config.freeUnits })
    if (freeProblem) return `"${preset.name}" cannot be built: ${PRESET_PROBLEM_WORDING[freeProblem]}`
  }
  return null
}

/**
 * Sizes a shape cannot have. A curve is a quarter ring, so its footprint is a
 * square as big as the ring, and its seat has to fit inside that. A half curve
 * is half a ring, as wide as the ring and half as deep (a millimetre either way,
 * for an odd width), and its seat has to fit inside the radius. A wedge's sides
 * come in by its angle across its depth, and must not cross before its front
 * (or back): a wedge that comes to a point is a triangle, which is fine.
 */
export function pieceSizeProblem(piece: PieceConfig): string | null {
  const { shape } = piece
  if (shape.kind === 'curve') {
    if (piece.widthMm !== piece.depthMm) return 'is curved, so its width and depth are both the size of the curve and must match'
    if (shape.seatDepthMm >= piece.widthMm) return 'has a seat deeper than the curve it sits in'
  }
  if (shape.kind === 'half-curve') {
    if (Math.abs(piece.depthMm * 2 - piece.widthMm) > 1) return 'is a half curve, so its depth must be half its width'
    if (shape.seatDepthMm * 2 >= piece.widthMm) return 'has a seat deeper than the curve it sits in'
  }
  if (shape.kind === 'segment') {
    const narrowSide = piece.widthMm - 2 * segmentInset(piece.depthMm, shape.angleDegrees)
    if (narrowSide < -1) {
      return `is too deep for its width at ${shape.angleDegrees}°: its sides would cross before they reach its ${shape.back === 'inside' ? 'back' : 'front'}`
    }
  }
  return null
}

const PRESET_PROBLEM_WORDING: Record<NonNullable<ReturnType<typeof findChainProblem>>, string> = {
  'end-is-closed': 'a unit is joined on to an arm',
  'layout-is-closed': 'it carries on after it has joined up all the way round',
  'cannot-flip': 'it lays a unit the other way round that only goes one way',
  'cannot-turn': 'it turns a unit that has a back',
  'cannot-corner': 'it lays a unit as a corner that is not set to sit in one',
  'piece-closed-on-joining-side': 'a unit is joined on to an arm',
  'neighbours-cannot-join': 'two neighbouring units meet arm to seat',
  'front-units-not-offered': 'it stands a unit in front of another, which this range is not set to allow',
  'cannot-stand-free': 'it stands a unit on its own that only joins a layout',
  'free-units-not-offered': 'it stands a unit on its own, which this range is not set to allow. Switch "Units on their own" on, or take it out of the layout',
  'would-overlap': 'the units would sit on top of each other',
  'too-many-pieces': 'it has more units than the layout limit',
  'unknown-entry': 'it names a unit that is not set up',
  'unknown-piece': 'it names a unit that is not set up',
}
