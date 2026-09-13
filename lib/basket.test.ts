import { describe, expect, it } from 'vitest'
import { buildLayoutBasketLines, layoutIdFromBytes, UnbuyableLayoutError } from '@/modules/modular-configurator-for-shop/lib/basket-lines'
import { planLayoutGroups, layoutGroupingKey } from '@/modules/modular-configurator-for-shop/lib/layout-groups'
import { priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { LAYOUT_META_KEY } from '@/modules/modular-configurator-for-shop/lib/line-meta'
import { SEATING_PAYLOAD } from '@/modules/modular-configurator-for-shop/lib/test-fixtures'
import type { ChainEntry } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

const L_SHAPE = chainOf('v-left', 'v-central', 'v-corner', 'v-central', 'v-right')
const CHOICES = { 'opt-fabric': 'v-synergy', 'opt-frame': 'v-black' }

function linesFor(layoutQuantity = 1) {
  return buildLayoutBasketLines({
    layoutId: 'abc1234567',
    parentProductId: 'parent',
    units: priceLayout(SEATING_PAYLOAD, 'opt-unit', L_SHAPE, CHOICES, {}).units,
    shapeLabel: 'L-shape',
    arrangement: 'Left Unit → Central Unit → Corner Unit → Central Unit → Right Unit',
    code: 'left-unit.central-unit.corner-unit.central-unit.right-unit',
    layoutQuantity,
  })
}

describe('a layout in the basket', () => {
  it('goes in as one line per variation, repeats folded into a quantity, first unit first', () => {
    const lines = linesFor()
    expect(lines.map((line) => [line.productId, line.quantity])).toEqual([
      ['child-left-unit-synergy-mix-black', 1],
      ['child-central-unit-synergy-mix-black', 2],
      ['child-corner-unit-synergy-mix-black', 1],
      ['child-right-unit-synergy-mix-black', 1],
    ])
    expect(lines.every((line) => line.lineId.length <= 64)).toBe(true)
    expect(lines.map((line) => (line.meta[LAYOUT_META_KEY] as { role: string }).role)).toEqual(['main', 'unit', 'unit', 'unit'])
    expect(lines.every((line) => JSON.stringify(line.meta).length < 2000)).toBe(true)
  })

  it('multiplies every line by the number of layouts', () => {
    expect(linesFor(3).map((line) => line.quantity)).toEqual([3, 6, 3, 3])
  })

  it('refuses a layout with a unit that cannot be bought', () => {
    const units = priceLayout(SEATING_PAYLOAD, 'opt-unit', chainOf('v-corner'), { 'opt-fabric': 'v-rivet', 'opt-frame': 'v-white' }, {}).units
    expect(() =>
      buildLayoutBasketLines({ layoutId: 'abc1234567', parentProductId: 'parent', units, shapeLabel: 'Straight', arrangement: '', code: '', layoutQuantity: 1 }),
    ).toThrow(UnbuyableLayoutError)
  })

  it('makes layout ids the meta reader accepts', () => {
    expect(layoutIdFromBytes(new Uint8Array([0, 1, 2, 35, 36, 255, 7, 8, 9, 10]))).toMatch(/^[a-z0-9]{10}$/)
  })
})

describe('grouping layout lines in the basket', () => {
  it('nests every unit under the first line', () => {
    const plan = planLayoutGroups(linesFor())
    const head = plan.get(layoutGroupingKey('abc1234567', 'child-left-unit-synergy-mix-black'))
    const corner = plan.get(layoutGroupingKey('abc1234567', 'child-corner-unit-synergy-mix-black'))
    expect(head).toMatchObject({ groupKey: 'mcl_abc1234567', isHead: true, complete: true, sharedGroup: false })
    expect(corner).toMatchObject({ groupKey: 'mcl_abc1234567', isHead: false })
  })

  it('joins the group an accessory already made one of its lines the head of', () => {
    const lines = linesFor().map((line) =>
      line.productId === 'child-corner-unit-synergy-mix-black'
        ? { ...line, meta: { ...line.meta, productAddons: { group: 'pad_xyz', role: 'main' } } }
        : line,
    )
    const plan = planLayoutGroups(lines)
    expect(plan.get(layoutGroupingKey('abc1234567', 'child-corner-unit-synergy-mix-black'))).toMatchObject({ groupKey: 'pad_xyz', isHead: true, sharedGroup: true })
    expect(plan.get(layoutGroupingKey('abc1234567', 'child-left-unit-synergy-mix-black'))).toMatchObject({ groupKey: 'pad_xyz', isHead: false })
  })

  it('notices when a line of the layout has been taken out of the basket', () => {
    const plan = planLayoutGroups(linesFor().filter((line) => !line.productId.startsWith('child-corner')))
    expect(plan.get(layoutGroupingKey('abc1234567', 'child-left-unit-synergy-mix-black'))?.complete).toBe(false)
  })

  it('ignores lines that are not from a layout, and meta it cannot read', () => {
    const plan = planLayoutGroups([
      { productId: 'plain', meta: undefined },
      { productId: 'forged', meta: { [LAYOUT_META_KEY]: { layoutId: 'NOT OK' } } },
    ])
    expect(plan.size).toBe(0)
  })
})
