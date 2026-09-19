// What the product page's layout builder is handed by the server. Plain,
// JSON-serialisable data only: it crosses the server/client boundary as a prop,
// and Puck deep-copies block props on the way in (a Date would arrive as {}).
import type { LayoutUnitSpec } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PresetFreeSpec } from '@/modules/modular-configurator-for-shop/lib/preset-units'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { P3dFormat } from '@/modules/product-3d-views-for-shop/lib/formats'
import type { PieceConfig, ViewSummaryChoice } from '@/modules/modular-configurator-for-shop/lib/config-schema'

/** One kind of unit the shopper can place. `pieceId` is the option value id. */
export interface StorefrontPiece {
  pieceId: string
  valueSlug: string
  label: string
  definition: PieceDefinition
  /** Quarter turns that bring the model round to face the shopper, or 'auto' to work them out per file. */
  modelTurnDegrees: PieceConfig['modelTurnDegrees']
  /**
   * A model file for the unit, already signed, used when the variation has no
   * painted bundle of its own (no fabric set-up on the 3D views side). Null
   * when there is no model at all, and a plain block stands in.
   */
  fallbackModel: { url: string; format: P3dFormat } | null
}

/** A ready-made starting layout: its units in order, by unit option value id, with any front units and turns. */
export interface StorefrontPreset {
  name: string
  units: LayoutUnitSpec[]
  /** Units standing on their own round it, by unit option value id. */
  free?: PresetFreeSpec[]
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
  /** Whether a backless unit may stand in front of a backed one in this range. */
  frontUnits: boolean
  /** Whether a table, stool or armchair may stand on its own, anywhere on the floor round the layout. */
  freeUnits: boolean
  /** When the one-line summary sits over the layout view. */
  viewSummary: ViewSummaryChoice
  viewer: StorefrontViewerLook
}
