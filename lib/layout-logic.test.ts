import { describe, expect, it } from 'vitest'
import { decodeLayout, encodeLayout, type LayoutCodeUnit, type LayoutCodeVocabulary } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import {
  describeArrangement,
  describeFootprint,
  describeUnitCounts,
  footprintOfLayout,
  layoutShapeOf,
} from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { fromPriceOfPiece, layoutValueReachesAUnit, priceLayout, unitIsMadeIn } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
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
    const units: LayoutCodeUnit[] = [
      { pieceId: 'v-left', choices: {}, flipped: false },
      { pieceId: 'v-central', choices: { 'opt-fabric': 'v-rivet' }, flipped: false },
      { pieceId: 'v-corner', choices: {}, flipped: false },
    ]
    const code = encodeLayout(units, VOCABULARY)
    expect(code).toBe('left-unit.central-unit~upholstery-colour:rivet-olive.corner-unit')
    expect(decodeLayout(code, VOCABULARY)).toEqual({ units })
  })

  it('marks a unit laid the other way round, and an older reader simply skips the mark', () => {
    const units = [{ pieceId: 'v-central', choices: { 'opt-fabric': 'v-rivet' }, flipped: true }]
    const code = encodeLayout(units, VOCABULARY)
    expect(code).toBe('central-unit~flip~upholstery-colour:rivet-olive')
    expect(decodeLayout(code, VOCABULARY)).toEqual({ units })
  })

  it('opens an old link on whatever of it still exists', () => {
    expect(decodeLayout('left-unit.withdrawn-unit.right-unit~frame-colour:gold', VOCABULARY)).toEqual({
      units: [
        { pieceId: 'v-left', choices: {}, flipped: false },
        { pieceId: 'v-right', choices: {}, flipped: false },
      ],
    })
    expect(decodeLayout('nothing-here', VOCABULARY)).toBeNull()
  })
})

describe('suggested starting layouts', () => {
  it('climbs from a pair to a U out of the range’s own units', () => {
    expect(suggestPresets(SEATING_PIECES, { maxPieces: 12 })).toEqual([
      { name: 'Pair', units: [{ pieceId: 'v-left' }, { pieceId: 'v-right' }] },
      { name: 'Row of three', units: [{ pieceId: 'v-left' }, { pieceId: 'v-central' }, { pieceId: 'v-right' }] },
      { name: 'L-shape', units: [{ pieceId: 'v-left' }, { pieceId: 'v-central' }, { pieceId: 'v-corner' }, { pieceId: 'v-central' }, { pieceId: 'v-right' }] },
      { name: 'U-shape', units: [{ pieceId: 'v-left' }, { pieceId: 'v-corner' }, { pieceId: 'v-central' }, { pieceId: 'v-corner' }, { pieceId: 'v-right' }] },
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

/** Backed units come in a high or low back; the corner only in a standard one. */
function backHeightRange() {
  const unit = { ...UNIT_OPTION, id: 'o-unit', values: [
    { ...UNIT_OPTION.values[0]!, id: 'u-central' },
    { ...UNIT_OPTION.values[0]!, id: 'u-corner' },
  ] }
  const back = { ...FRAME_OPTION, id: 'o-back', values: [
    { ...FRAME_OPTION.values[0]!, id: 'b-high', position: 0 },
    { ...FRAME_OPTION.values[0]!, id: 'b-low', position: 1 },
    { ...FRAME_OPTION.values[0]!, id: 'b-standard', position: 2 },
  ] }
  const madeIn = (unitId: string, backId: string, inStock = true) => ({
    ...SEATING_PAYLOAD.variants[0]!,
    id: `${unitId}-${backId}`,
    childProductId: `child-${unitId}-${backId}`,
    optionValueIds: [unitId, backId],
    price: 100,
    inStock,
  })
  const payload = {
    ...SEATING_PAYLOAD,
    options: [unit, back],
    variants: [madeIn('u-central', 'b-high'), madeIn('u-central', 'b-low'), madeIn('u-corner', 'b-standard')],
  }
  return payload
}

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

  it('matches a unit not made in the layout’s choice to the nearest combination it is made in', () => {
    const payload = backHeightRange()
    const layout = chainOf('u-central', 'u-corner')

    const inStandard = priceLayout(payload, 'o-unit', layout, { 'o-back': 'b-standard' }, {})
    // Standard is listed next to Low, so Low is nearer than High.
    expect(inStandard.units.map((priced) => priced.variant?.childProductId)).toEqual(['child-u-central-b-low', 'child-u-corner-b-standard'])
    expect(inStandard.units.map((priced) => priced.adjustedOptionIds)).toEqual([['o-back'], []])
    expect(inStandard.buyable).toBe(true)

    const inHigh = priceLayout(payload, 'o-unit', layout, { 'o-back': 'b-high' }, {})
    expect(inHigh.units.map((priced) => priced.selection['o-back'])).toEqual(['b-high', 'b-standard'])

    // A choice the unit made for itself is never swapped for a nearer one.
    const ownHigh = priceLayout(payload, 'o-unit', layout, { 'o-back': 'b-standard' }, { e0: { 'o-back': 'b-high' } })
    expect(ownHigh.units[0]?.selection['o-back']).toBe('b-high')
    expect(ownHigh.units[0]?.adjustedOptionIds).toEqual([])
    const impossible = priceLayout(payload, 'o-unit', layout, { 'o-back': 'b-standard' }, { e1: { 'o-back': 'b-high' } })
    expect(impossible.units[1]?.problem).toBe('unavailable')
    expect(impossible.buyable).toBe(false)
  })

  it('knows which choices a unit comes in at all, and which layout choices reach no unit', () => {
    const payload = backHeightRange()
    expect(['b-high', 'b-low', 'b-standard'].map((back) => unitIsMadeIn(payload, 'o-unit', 'u-central', 'o-back', back, {}))).toEqual([true, true, false])
    // Its own back is what is being asked about, so it does not rule the others out.
    expect(unitIsMadeIn(payload, 'o-unit', 'u-central', 'o-back', 'b-low', { 'o-back': 'b-high' })).toBe(true)
    const corners = chainOf('u-corner', 'u-corner')
    expect(layoutValueReachesAUnit(payload, 'o-unit', corners, {}, 'o-back', 'b-high')).toBe(false)
    expect(layoutValueReachesAUnit(payload, 'o-unit', chainOf('u-corner', 'u-central'), {}, 'o-back', 'b-high')).toBe(true)
    // Every unit choosing its own back: the layout's choice changes nothing, so nothing is refused.
    expect(layoutValueReachesAUnit(payload, 'o-unit', corners, { e0: { 'o-back': 'b-standard' }, e1: { 'o-back': 'b-standard' } }, 'o-back', 'b-high')).toBe(true)
  })

  it('quotes each unit from its cheapest combination', () => {
    expect(fromPriceOfPiece(SEATING_PAYLOAD, LEFT_END.pieceId)).toBe(344)
    expect(fromPriceOfPiece(SEATING_PAYLOAD, RIGHT_END.pieceId)).toBe(344)
    expect(fromPriceOfPiece(SEATING_PAYLOAD, 'v-missing')).toBeNull()
  })
})
