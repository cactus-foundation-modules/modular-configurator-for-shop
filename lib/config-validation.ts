// Checks a set-up against the product it is for, beyond what the schema alone
// can say: the unit option exists, every unit is one of its values, and each
// ready-made layout can actually be built. Returns the first problem as a
// sentence for the owner, or null. Pure, so the save route and its tests agree.
import { findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { SaveConfiguratorBody } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { sameOptionName } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'

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
    if (seen.has(piece.valueSlug)) return `${labelBySlug.get(piece.valueSlug)} is set up twice`
    seen.add(piece.valueSlug)
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
    const unknown = preset.valueSlugs.find((slug) => !definitions.has(slug))
    if (unknown) return `"${preset.name}" uses ${labelBySlug.get(unknown) ?? unknown}, which is not set up as a unit`
    const chain = preset.valueSlugs.map((pieceId, index) => ({ entryId: `check-${index}`, pieceId }))
    const problem = findChainProblem(chain, definitions, { maxPieces: config.maxPieces })
    if (problem) return `"${preset.name}" cannot be built: ${PRESET_PROBLEM_WORDING[problem]}`
  }
  return null
}

const PRESET_PROBLEM_WORDING: Record<NonNullable<ReturnType<typeof findChainProblem>>, string> = {
  'end-is-closed': 'a unit is joined on to an arm',
  'piece-closed-on-joining-side': 'a unit is joined on to an arm',
  'neighbours-cannot-join': 'two neighbouring units meet arm to seat',
  'would-overlap': 'the units would sit on top of each other',
  'too-many-pieces': 'it has more units than the layout limit',
  'unknown-entry': 'it names a unit that is not set up',
  'unknown-piece': 'it names a unit that is not set up',
}
