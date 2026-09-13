// What the product page's layout builder is handed by the server. Plain,
// JSON-serialisable data only: it crosses the server/client boundary as a prop,
// and Puck deep-copies block props on the way in (a Date would arrive as {}).
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { P3dFormat } from '@/modules/product-3d-views-for-shop/lib/formats'

/** One kind of unit the shopper can place. `pieceId` is the option value id. */
export interface StorefrontPiece {
  pieceId: string
  valueSlug: string
  label: string
  definition: PieceDefinition
  /** Quarter turns that bring the model round to face the shopper. */
  modelTurnDegrees: 0 | 90 | 180 | 270
  /**
   * A model file for the unit, already signed, used when the variation has no
   * painted bundle of its own (no fabric set-up on the 3D views side). Null
   * when there is no model at all, and a plain block stands in.
   */
  fallbackModel: { url: string; format: P3dFormat } | null
}

/** A ready-made starting layout, as an ordered list of unit option value ids. */
export interface StorefrontPreset {
  name: string
  pieceIds: string[]
}

/** The 3D views module's look, so the builder's scene matches the gallery's. */
export interface StorefrontViewerLook {
  toneMapping: 'none' | 'aces' | 'neutral'
  exposure: number
  environmentIntensity: number
  ambientIntensity: number
  keyLightIntensity: number
  fillLightIntensity: number
  shadowOpacity: number
  pixelRatioCap: number
}

export interface ConfiguratorStorefrontPayload {
  slug: string
  parentProductId: string
  productName: string
  /** The variation option whose values are the units. */
  pieceOptionId: string
  pieceOptionName: string
  pieces: StorefrontPiece[]
  presets: StorefrontPreset[]
  maxPieces: number
  viewer: StorefrontViewerLook
}
