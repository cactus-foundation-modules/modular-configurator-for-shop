// Server-only: what the set-up screen on a product's edit page reads - the saved
// set-up, the product's variation options to choose the unit option from, and
// footprint suggestions from each unit's specification.
import { getVariantSelectorPayload } from '@/modules/shop-variations/lib/variants-service'
import {
  EMPTY_CONFIGURATOR_CONFIG,
  type ConfiguratorConfig,
} from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { getProductConfigurator } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { suggestFootprints } from '@/modules/modular-configurator-for-shop/lib/db/spec-sizes'
import { representativeChildFor } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'

export interface AdminOptionValue {
  slug: string
  label: string
  /** From the value's specification, where it gives one in units we can trust. */
  suggestedWidthMm: number | null
  suggestedDepthMm: number | null
}

export interface AdminOption {
  name: string
  values: AdminOptionValue[]
}

export interface ConfiguratorAdminPayload {
  productId: string
  enabled: boolean
  config: ConfiguratorConfig
  /** Null until the set-up has been saved once. */
  updatedAt: string | null
  options: AdminOption[]
}

export async function loadConfiguratorAdminPayload(productId: string): Promise<ConfiguratorAdminPayload | null> {
  const [variations, saved] = await Promise.all([getVariantSelectorPayload(productId), getProductConfigurator(productId)])
  if (!variations) return null

  const representativeByValue = new Map<string, string>()
  for (const option of variations.options) {
    for (const value of option.values) {
      const childId = representativeChildFor(variations, value.id)
      if (childId) representativeByValue.set(value.id, childId)
    }
  }
  const footprints = await suggestFootprints([...representativeByValue.values()])

  return {
    productId,
    enabled: saved?.enabled ?? false,
    config: saved?.config ?? EMPTY_CONFIGURATOR_CONFIG,
    updatedAt: saved?.updatedAt ?? null,
    options: variations.options.map((option) => ({
      name: option.name,
      values: option.values.map((value) => {
        const childId = representativeByValue.get(value.id)
        const footprint = childId ? footprints.get(childId) : undefined
        return {
          slug: value.slug,
          label: value.label,
          suggestedWidthMm: footprint?.widthMm ?? null,
          suggestedDepthMm: footprint?.depthMm ?? null,
        }
      }),
    })),
  }
}
