// Server-only: what the "Link to a layout builder" part of a product's edit
// screen reads - the saved link, this product's own options (for the conditions)
// and every product with a builder switched on, with its units (for the starting
// layouts and their plans).
import { getVariantSelectorPayload } from '@/modules/shop-variations/lib/variants-service'
import type { ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { getProductConfigurator } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { getLayoutLink, listBuilderProducts } from '@/modules/modular-configurator-for-shop/lib/db/layout-links'
import type { LayoutLink } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import type { LinkTargetForValidation } from '@/modules/modular-configurator-for-shop/lib/layout-link-validation'
import { resolvePieceCatalogue } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'

export interface LinkOption {
  name: string
  values: Array<{ slug: string; label: string }>
}

export interface LinkBuilderProduct {
  productId: string
  name: string
  config: ConfiguratorConfig
  /** The units set up on it, in the builder's order, that still exist as values. */
  units: Array<{ slug: string; label: string }>
}

export interface LayoutLinkAdminPayload {
  productId: string
  link: LayoutLink | null
  ownOptions: LinkOption[]
  builders: LinkBuilderProduct[]
}

export async function loadLayoutLinkAdminPayload(productId: string): Promise<LayoutLinkAdminPayload> {
  const [link, own, builderRows] = await Promise.all([
    getLayoutLink(productId),
    getVariantSelectorPayload(productId),
    listBuilderProducts(),
  ])
  const builders = await Promise.all(
    builderRows.filter((row) => row.productId !== productId).map(async (row): Promise<LinkBuilderProduct | null> => {
      const [saved, variations] = await Promise.all([getProductConfigurator(row.productId), getVariantSelectorPayload(row.productId)])
      if (!saved?.enabled || !variations) return null
      const catalogue = resolvePieceCatalogue(variations, saved.config)
      if (!catalogue || catalogue.pieces.length === 0) return null
      return {
        productId: row.productId,
        name: row.name,
        config: saved.config,
        units: catalogue.pieces.map((piece) => ({ slug: piece.config.valueSlug, label: piece.label })),
      }
    }),
  )
  return {
    productId,
    link,
    ownOptions: (own?.options ?? []).map((option) => ({
      name: option.name,
      values: option.values.map((value) => ({ slug: value.slug, label: value.label })),
    })),
    builders: builders.filter((builder): builder is LinkBuilderProduct => builder !== null),
  }
}

/** The payload's view of a target, in the shape the link validation takes. */
export function linkTargetFrom(payload: LayoutLinkAdminPayload, targetProductId: string): LinkTargetForValidation | null {
  const builder = payload.builders.find((candidate) => candidate.productId === targetProductId)
  if (!builder) return null
  return {
    productId: builder.productId,
    config: builder.config,
    unitLabelBySlug: new Map(builder.units.map((unit) => [unit.slug, unit.label])),
  }
}
