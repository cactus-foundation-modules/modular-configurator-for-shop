// Server-only: everything the product page's layout builder needs, resolved while
// the page renders so the builder's card is in the first HTML. Reaches prisma
// through the database readers below; never import it from a 'use client' file.
import { signAssetUrl } from '@/lib/media/asset-token'
import { getProductBySlugCached } from '@/modules/shop/lib/db/products'
import { getPackedVariationBootstrap, getVariationBootstrap } from '@/modules/shop-variations/lib/variation-bootstrap'
import type { PackedVariationBootstrap } from '@/modules/shop-variations/lib/variation-bootstrap-pack'
import { getModelsForProducts } from '@/modules/product-3d-views-for-shop/lib/db/models'
import { getP3dConfigCached } from '@/modules/product-3d-views-for-shop/lib/config'
import { applyProductOverrides, getP3dProductConfig } from '@/modules/product-3d-views-for-shop/lib/db/product-settings'
import type { P3dConfig } from '@/modules/product-3d-views-for-shop/lib/config-shared'
import { getProductConfiguratorCached } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { resolvePieceCatalogue, type ResolvedPiece } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import { findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import type {
  ConfiguratorStorefrontPayload,
  StorefrontPiece,
  StorefrontPreset,
  StorefrontViewerLook,
} from '@/modules/modular-configurator-for-shop/lib/storefront-types'

export interface ConfiguratorBlockData {
  payload: ConfiguratorStorefrontPayload
  /** The variation payload in its wire shape, so the builder shares the page's selection. */
  bootstrap: PackedVariationBootstrap
}

/**
 * Null - render nothing - for every product that has not switched the builder
 * on, which is nearly all of them. Placing the block in the shared product
 * layout therefore costs those products one cached read and no markup.
 */
export async function loadConfiguratorBlockData(slug: string): Promise<ConfiguratorBlockData | null> {
  const product = await getProductBySlugCached(slug)
  if (!product) return null
  const saved = await getProductConfiguratorCached(product.id)
  if (!saved?.enabled) return null

  const [bootstrap, packed] = await Promise.all([getVariationBootstrap(slug), getPackedVariationBootstrap(slug)])
  if (!bootstrap || !packed) return null

  const catalogue = resolvePieceCatalogue(bootstrap.payload, saved.config)
  if (!catalogue || catalogue.pieces.length === 0) return null

  const [modelByPiece, viewer] = await Promise.all([
    fallbackModelsFor(catalogue.pieces),
    viewerLookFor(product.id),
  ])
  const pieces = catalogue.pieces.map((piece): StorefrontPiece => ({
    pieceId: piece.valueId,
    valueSlug: piece.config.valueSlug,
    label: piece.label,
    definition: {
      pieceId: piece.valueId,
      shape: piece.config.shape,
      widthMm: piece.config.widthMm,
      depthMm: piece.config.depthMm,
    },
    modelTurnDegrees: piece.config.modelTurnDegrees,
    fallbackModel: modelByPiece.get(piece.valueId) ?? null,
  }))

  return {
    bootstrap: packed,
    payload: {
      slug,
      parentProductId: product.id,
      productName: bootstrap.payload.productName,
      pieceOptionId: catalogue.pieceOption.id,
      pieceOptionName: catalogue.pieceOption.name,
      pieces,
      presets: presetsFor(saved.config, catalogue.valueIdBySlug, pieces),
      maxPieces: saved.config.maxPieces,
      viewer,
    },
  }
}

/**
 * The owner's own starting layouts where there are any - each checked against
 * the units that exist today, since a withdrawn unit would otherwise open the
 * builder on a layout it cannot draw - or the range's suggested ones.
 */
function presetsFor(
  config: ConfiguratorConfig,
  valueIdBySlug: ReadonlyMap<string, string>,
  pieces: readonly StorefrontPiece[],
): StorefrontPreset[] {
  const definitions = new Map(pieces.map((piece) => [piece.pieceId, piece.definition]))
  const limits = { maxPieces: config.maxPieces }
  if (config.presets.length === 0) return suggestPresets(pieces.map((piece) => piece.definition), limits)
  return config.presets.flatMap((preset) => {
    const pieceIds = preset.valueSlugs.map((slug) => valueIdBySlug.get(slug))
    if (pieceIds.some((pieceId) => !pieceId || !definitions.has(pieceId))) return []
    const known = pieceIds.filter((pieceId): pieceId is string => typeof pieceId === 'string')
    const chain = known.map((pieceId, index) => ({ entryId: `preset-${index}`, pieceId }))
    return findChainProblem(chain, definitions, limits) === null ? [{ name: preset.name, pieceIds: known }] : []
  })
}

/**
 * One model file per unit, for a variation with no painted bundle to draw from:
 * the representative variation's own file. Never the listing's own model - on a
 * modular range that is usually a whole arrangement, and drawing it in place of
 * one corner seat would be worse than the plain block that stands in instead.
 * Signed on the way out, never stored signed - see lib/media/asset-token.ts.
 */
async function fallbackModelsFor(pieces: readonly ResolvedPiece[]): Promise<Map<string, StorefrontPiece['fallbackModel']>> {
  const childIds = pieces.flatMap((piece) => (piece.representativeChildId ? [piece.representativeChildId] : []))
  const models = await getModelsForProducts(childIds)
  const firstByProduct = new Map<string, (typeof models)[number]>()
  for (const model of models) if (!firstByProduct.has(model.productId)) firstByProduct.set(model.productId, model)

  const byPiece = new Map<string, StorefrontPiece['fallbackModel']>()
  for (const piece of pieces) {
    const model = piece.representativeChildId ? firstByProduct.get(piece.representativeChildId) : undefined
    byPiece.set(piece.valueId, model ? { url: signAssetUrl(model.url), format: model.format } : null)
  }
  return byPiece
}

async function viewerLookFor(parentProductId: string): Promise<StorefrontViewerLook> {
  const [site, product] = await Promise.all([getP3dConfigCached(), getP3dProductConfig(parentProductId)])
  const settings: P3dConfig = applyProductOverrides(site, product)
  return {
    toneMapping: settings.toneMapping,
    exposure: settings.exposure,
    environmentIntensity: settings.environmentIntensity,
    ambientIntensity: settings.ambientIntensity,
    keyLightIntensity: settings.keyLightIntensity,
    fillLightIntensity: settings.fillLightIntensity,
    shadowOpacity: settings.shadowOpacity,
    pixelRatioCap: settings.pixelRatioCap,
  }
}
