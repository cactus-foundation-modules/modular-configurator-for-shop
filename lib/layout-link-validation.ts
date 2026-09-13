// Checks a link to a layout builder against the two products it joins, beyond
// what the schema alone can say: the target really has a builder switched on,
// each condition names a choice this product offers, and each starting layout
// can be built from the target's units. Returns the first problem as a sentence
// for the owner, or null. Pure, so the save route and its tests agree.
import { findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import type { OptionForValidation } from '@/modules/modular-configurator-for-shop/lib/config-validation'
import { definitionsBySlug } from '@/modules/modular-configurator-for-shop/lib/layout-link'
import type { LayoutLink } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import { sameOptionName } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'
import { refusalSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'

export interface LinkTargetForValidation {
  productId: string
  /** Null when the product has no builder switched on. */
  config: ConfiguratorConfig | null
  unitLabelBySlug: ReadonlyMap<string, string>
}

export function validateLayoutLink(
  link: LayoutLink,
  productId: string,
  ownOptions: readonly OptionForValidation[],
  target: LinkTargetForValidation | null,
): string | null {
  if (link.targetProductId === productId) return 'This product cannot link to its own layout builder - its tabs are already on the page'
  if (!target?.config) return 'Choose a product that has its layout builder switched on'
  const config = target.config

  const definitions = definitionsBySlug(config)
  const seenConditions = new Set<string>()
  for (const layout of link.startingLayouts) {
    const conditionName = layout.when ? conditionWording(layout.when, ownOptions) : 'Whatever is chosen'
    if (typeof conditionName !== 'string') return conditionName.problem

    const key = layout.when ? `${layout.when.optionName.trim().toLowerCase()}=${layout.when.valueSlug}` : ''
    if (seenConditions.has(key)) return `There are two starting layouts for "${conditionName}"`
    seenConditions.add(key)

    const unknown = layout.valueSlugs.find((slug) => !definitions.has(slug))
    if (unknown) return `"${conditionName}" uses ${target.unitLabelBySlug.get(unknown) ?? unknown}, which is not set up as a unit on that product`
    const chain = layout.valueSlugs.map((pieceId, index) => ({ entryId: `check-${index}`, pieceId }))
    const problem = findChainProblem(chain, definitions, { maxPieces: config.maxPieces })
    if (problem) return `"${conditionName}" cannot be built. ${refusalSentence(problem, config.maxPieces)}`
  }
  return null
}

function conditionWording(
  when: NonNullable<LayoutLink['startingLayouts'][number]['when']>,
  options: readonly OptionForValidation[],
): string | { problem: string } {
  const option = options.find((candidate) => sameOptionName(candidate.name, when.optionName))
  if (!option) return { problem: `This product has no option called "${when.optionName}"` }
  const value = option.values.find((candidate) => candidate.slug === when.valueSlug)
  if (!value) return { problem: `"${when.valueSlug}" is not one of the ${option.name} choices` }
  return `${option.name}: ${value.label}`
}
