// Server-only: what the "Build your own layout link" block needs on a product
// page - the link's words, the builder product's address, the starting layouts
// its builder can still draw, and its options, so the island can carry the
// shopper's choices across. Reaches prisma; never import it from a 'use client' file.
import { getProductById, getProductBySlugCached } from '@/modules/shop/lib/db/products'
import { productHref } from '@/modules/shop/lib/product-url'
import { getProductUrlStyle } from '@/modules/shop/lib/product-url-server'
import { optionParamKey } from '@/modules/shop-variations/lib/url-selection'
import { getVariantSelectorPayload } from '@/modules/shop-variations/lib/variants-service'
import { getProductConfiguratorCached } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { getLayoutLinkCached } from '@/modules/modular-configurator-for-shop/lib/db/layout-links'
import { usableStartingLayouts, type LayoutLinkBlockData } from '@/modules/modular-configurator-for-shop/lib/layout-link'
import { resolvePieceCatalogue } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'

/**
 * Null - render nothing - for a product with no link, and for one whose target
 * has since been hidden, archived or had its builder switched off: a link to a
 * page with no builder on it would be a broken promise.
 */
export async function loadLayoutLinkBlockData(slug: string): Promise<LayoutLinkBlockData | null> {
  const product = await getProductBySlugCached(slug)
  if (!product) return null
  const link = await getLayoutLinkCached(product.id)
  if (!link) return null

  const [target, saved] = await Promise.all([getProductById(link.targetProductId), getProductConfiguratorCached(link.targetProductId)])
  if (!target || target.status !== 'ACTIVE' || target.catalogueHidden || !saved?.enabled) return null
  const [variations, style] = await Promise.all([getVariantSelectorPayload(target.id), getProductUrlStyle()])
  if (!variations) return null
  const catalogue = resolvePieceCatalogue(variations, saved.config)
  if (!catalogue || catalogue.pieces.length === 0) return null

  return {
    slug: product.slug,
    leadText: link.leadText,
    linkText: link.linkText,
    newTab: link.newTab,
    targetHref: productHref(target.slug, style),
    // Against the units that still exist as values, not merely the ones set up.
    startingLayouts: usableStartingLayouts(link.startingLayouts, { ...saved.config, pieces: catalogue.pieces.map((piece) => piece.config) }),
    targetOptions: variations.options
      .filter((option) => option.id !== catalogue.pieceOption.id)
      .map((option) => ({
        name: option.name,
        paramKey: optionParamKey(option.name),
        valueSlugs: option.values.map((value) => value.slug),
      })),
  }
}
