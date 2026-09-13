import { describe, expect, it } from 'vitest'
import { decodeLayout, encodeLayout, type LayoutCodeVocabulary } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import {
  describeArrangement,
  describeFootprint,
  describeUnitCounts,
  footprintOfLayout,
  layoutShapeOf,
} from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { fromPriceOfPiece, priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { placeChain, type ChainEntry } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import {
  CENTRAL,
  CORNER,
  FABRIC_OPTION,
  FRAME_OPTION,
  LEFT_END,
  RIGHT_END,
  SEATING_PAYLOAD,
  SEATING_PIECES,
  UNIT_OPTION,
} from '@/modules/modular-configurator-for-shop/lib/test-fixtures'

const VOCABULARY: LayoutCodeVocabulary = {
  pieceSlugById: new Map(UNIT_OPTION.values.map((value) => [value.id, value.slug])),
  otherOptions: [FABRIC_OPTION, FRAME_OPTION],
}

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

describe('the layout link code', () => {
  it('round-trips units in order with each unit’s own choices', () => {
    const code = encodeLayout(['v-left', 'v-central', 'v-corner'], [{}, { 'opt-fabric': 'v-rivet' }, {}], VOCABULARY)
    expect(code).toBe('left-unit.central-unit~upholstery-colour:rivet-olive.corner-unit')
    expect(decodeLayout(code, VOCABULARY)).toEqual({
      pieceIds: ['v-left', 'v-central', 'v-corner'],
      unitChoices: [{}, { 'opt-fabric': 'v-rivet' }, {}],
    })
  })

  it('opens an old link on whatever of it still exists', () => {
    expect(decodeLayout('left-unit.withdrawn-unit.right-unit~frame-colour:gold', VOCABULARY)).toEqual({
      pieceIds: ['v-left', 'v-right'],
      unitChoices: [{}, {}],
    })
    expect(decodeLayout('nothing-here', VOCABULARY)).toBeNull()
  })
})

describe('suggested starting layouts', () => {
  it('climbs from a pair to a U out of the range’s own units', () => {
    expect(suggestPresets(SEATING_PIECES, { maxPieces: 12 })).toEqual([
      { name: 'Pair', pieceIds: ['v-left', 'v-right'] },
      { name: 'Row of three', pieceIds: ['v-left', 'v-central', 'v-right'] },
      { name: 'L-shape', pieceIds: ['v-left', 'v-central', 'v-corner', 'v-central', 'v-right'] },
      { name: 'U-shape', pieceIds: ['v-left', 'v-corner', 'v-central', 'v-corner', 'v-right'] },
    ])
  })

  it('leaves out shapes the range cannot make or the limit will not allow', () => {
    expect(suggestPresets([CENTRAL, CORNER], { maxPieces: 12 })).toEqual([])
    expect(suggestPresets(SEATING_PIECES, { maxPieces: 3 }).map((preset) => preset.name)).toEqual(['Pair', 'Row of three'])
  })
})

describe('describing a layout', () => {
  it('names the shape from its corners and reads its size like a tape measure', () => {
    expect([0, 1, 2, 3].map(layoutShapeOf)).toEqual(['straight', 'l-shape', 'u-shape', 'wraparound'])
    const placed = placeChain(chainOf('v-left', 'v-central', 'v-corner', 'v-central', 'v-right'), new Map(SEATING_PIECES.map((piece) => [piece.pieceId, piece])))
    const footprint = footprintOfLayout(placed)
    expect(footprint && describeFootprint(footprint)).toBe('2.21 m wide × 2.21 m deep')
    expect(describeUnitCounts(['Left Unit', 'Central Unit', 'Corner Unit', 'Central Unit'])).toBe('Left Unit, Central Unit ×2, Corner Unit')
    expect(describeArrangement(['Left Unit', 'Right Unit'])).toBe('Left Unit → Right Unit')
  })
})

describe('pricing a layout', () => {
  const layoutChoices = { 'opt-fabric': 'v-synergy', 'opt-frame': 'v-black' }

  it('adds up each unit as the variation it resolves to, per-unit fabric included', () => {
    const price = priceLayout(SEATING_PAYLOAD, 'opt-unit', chainOf('v-left', 'v-corner', 'v-right'), layoutChoices, {
      e1: { 'opt-fabric': 'v-rivet' },
    })
    // 402 + 417 + 402: the corner is in the cheaper fabric of its own.
    expect(price.total).toBe(1221)
    expect(price.units.map((unit) => unit.variant?.childProductId)).toEqual([
      'child-left-unit-synergy-mix-black',
      'child-corner-unit-rivet-olive-black',
      'child-right-unit-synergy-mix-black',
    ])
    expect(price.buyable).toBe(true)
    expect(price.retailTotal).toBeGreaterThan(price.total)
  })

  it('will not call a layout buyable while a unit is out of stock or a choice is missing', () => {
    const outOfStock = priceLayout(SEATING_PAYLOAD, 'opt-unit', chainOf('v-corner'), { 'opt-fabric': 'v-rivet', 'opt-frame': 'v-white' }, {})
    expect(outOfStock.units[0]?.problem).toBe('out-of-stock')
    expect(outOfStock.buyable).toBe(false)
    const unchosen = priceLayout(SEATING_PAYLOAD, 'opt-unit', chainOf('v-central'), { 'opt-fabric': 'v-rivet' }, {})
    expect(unchosen.units[0]?.problem).toBe('needs-choice')
    expect(unchosen.retailTotal).toBeNull()
  })

  it('quotes each unit from its cheapest combination', () => {
    expect(fromPriceOfPiece(SEATING_PAYLOAD, LEFT_END.pieceId)).toBe(344)
    expect(fromPriceOfPiece(SEATING_PAYLOAD, RIGHT_END.pieceId)).toBe(344)
    expect(fromPriceOfPiece(SEATING_PAYLOAD, 'v-missing')).toBeNull()
  })
})
