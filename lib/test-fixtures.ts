// A small modular seating range as the variation payload describes it, for the
// module's tests. Four units, two fabrics, two frames; the corner costs more,
// one fabric is dearer, and one combination is out of stock.
import type { SvrOptionWithValues, VariantSelectorPayload, VariantSelectorVariant } from '@/modules/shop-variations/lib/types'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

function option(id: string, name: string, values: Array<[id: string, slug: string, label: string]>): SvrOptionWithValues {
  return {
    id,
    productId: 'parent',
    name,
    controlType: 'PILL',
    position: 0,
    requiresPreviousOption: false,
    sourceProvider: null,
    sourceRef: null,
    nameOverridden: false,
    cardDisplay: false,
    cardLabel: null,
    cardLimit: null,
    cardFitLines: null,
    values: values.map(([valueId, slug, label], position) => ({
      id: valueId,
      optionId: id,
      label,
      slug,
      swatch: null,
      position,
      sourceRef: null,
    })),
  }
}

export const UNIT_OPTION = option('opt-unit', 'Unit', [
  ['v-left', 'left-unit', 'Left Unit'],
  ['v-central', 'central-unit', 'Central Unit'],
  ['v-right', 'right-unit', 'Right Unit'],
  ['v-corner', 'corner-unit', 'Corner Unit'],
])
export const FABRIC_OPTION = option('opt-fabric', 'Upholstery Colour', [
  ['v-rivet', 'rivet-olive', 'Rivet Olive'],
  ['v-synergy', 'synergy-mix', 'Synergy Mix'],
])
export const FRAME_OPTION = option('opt-frame', 'Frame Colour', [
  ['v-black', 'black', 'Black'],
  ['v-white', 'white', 'White'],
])

const UNIT_PRICES: Record<string, number> = { 'v-left': 344, 'v-central': 306, 'v-right': 344, 'v-corner': 417 }
const FABRIC_UPLIFT: Record<string, number> = { 'v-rivet': 0, 'v-synergy': 58 }

function variantsFor(): VariantSelectorVariant[] {
  const variants: VariantSelectorVariant[] = []
  for (const unit of UNIT_OPTION.values) {
    for (const fabric of FABRIC_OPTION.values) {
      for (const frame of FRAME_OPTION.values) {
        const price = (UNIT_PRICES[unit.id] ?? 0) + (FABRIC_UPLIFT[fabric.id] ?? 0)
        variants.push({
          id: `var-${unit.slug}-${fabric.slug}-${frame.slug}`,
          childProductId: `child-${unit.slug}-${fabric.slug}-${frame.slug}`,
          optionValueIds: [unit.id, fabric.id, frame.id],
          enabled: true,
          price,
          compareAtPrice: null,
          retailPrice: Math.round(price * 2.55),
          inStock: !(unit.id === 'v-corner' && fabric.id === 'v-rivet' && frame.id === 'v-white'),
          stockCount: null,
          imageUrls: [],
          sku: null,
          supplier: null,
        })
      }
    }
  }
  return variants
}

export const SEATING_PAYLOAD: VariantSelectorPayload = {
  productId: 'parent',
  productName: 'Modular Seating Unit',
  basePrice: 0,
  baseImages: [],
  options: [UNIT_OPTION, FABRIC_OPTION, FRAME_OPTION],
  variants: variantsFor(),
  addons: [],
  priceSuffix: 'ex. VAT',
}

export const LEFT_END: PieceDefinition = { pieceId: 'v-left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760 }
export const CENTRAL: PieceDefinition = { pieceId: 'v-central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760 }
export const RIGHT_END: PieceDefinition = { pieceId: 'v-right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 790, depthMm: 760 }
export const CORNER: PieceDefinition = { pieceId: 'v-corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 760, depthMm: 760 }
export const SEATING_PIECES: PieceDefinition[] = [LEFT_END, CENTRAL, RIGHT_END, CORNER]
