import { describe, expect, it } from 'vitest'
import { placeChain, piecesOverlap, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import {
  canStandFree,
  chainLimitsBeside,
  fitsAt,
  freeUnitFromSpot,
  freeUnitSpot,
  placeFreeUnit,
  placeFreeUnits,
  settleFreeUnits,
  spotForFreeUnit,
  turnedFreeUnit,
  type FreeUnit,
} from '@/modules/modular-configurator-for-shop/lib/free-units'
import { decodeLayout, encodeLayout, type LayoutCodeVocabulary } from '@/modules/modular-configurator-for-shop/lib/layout-code'

const LEFT: PieceDefinition = { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 650, depthMm: 690 }
const CENTRAL: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 570, depthMm: 690 }
const RIGHT: PieceDefinition = { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 650, depthMm: 690 }
const ARMCHAIR: PieceDefinition = { pieceId: 'armchair', shape: { kind: 'straight', closedLeft: true, closedRight: true }, widthMm: 730, depthMm: 690 }
const TABLE: PieceDefinition = { pieceId: 'table', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true, cornerable: true }, widthMm: 620, depthMm: 620 }
const CORNER: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'right' }, widthMm: 690, depthMm: 690 }

const DEFINITIONS = new Map([LEFT, CENTRAL, RIGHT, ARMCHAIR, TABLE, CORNER].map((definition) => [definition.pieceId, definition]))

function sofa() {
  return placeChain(
    [
      { entryId: 'u1', pieceId: 'left' },
      { entryId: 'u2', pieceId: 'central' },
      { entryId: 'u3', pieceId: 'right' },
    ],
    DEFINITIONS,
  )
}

describe('units standing on their own', () => {
  it('offers a table or an armchair on its own, never half a sofa or a corner', () => {
    expect([LEFT, CENTRAL, RIGHT, ARMCHAIR, TABLE, CORNER].filter(canStandFree).map((definition) => definition.pieceId)).toEqual(['armchair', 'table'])
  })

  it('puts a new coffee table in front of the sofa, clear of it, and a second one beside the first', () => {
    const placed = sofa()
    const first = spotForFreeUnit(TABLE, 'u4', placed)
    const tableOne = placeFreeUnit({ entryId: 'u4', pieceId: 'table', centre: first, rotationY: 0 }, TABLE)
    expect(first.z).toBeGreaterThan(690 / 2)
    expect(placed.some((piece) => piecesOverlap(piece, tableOne))).toBe(false)

    const second = spotForFreeUnit(TABLE, 'u5', [...placed, tableOne])
    const tableTwo = placeFreeUnit({ entryId: 'u5', pieceId: 'table', centre: second, rotationY: 0 }, TABLE)
    expect(second).not.toEqual(first)
    expect([...placed, tableOne].some((piece) => piecesOverlap(piece, tableTwo))).toBe(false)
  })

  it('says where a dragged unit would sit on something and where it would not', () => {
    const placed = [...sofa(), placeFreeUnit({ entryId: 'u4', pieceId: 'armchair', centre: { x: 0, z: 2000 }, rotationY: 0 }, ARMCHAIR)]
    expect(fitsAt(placed, 'u4', { x: 0, z: 0 })).toBe(false)
    expect(fitsAt(placed, 'u4', { x: 3000, z: 0 })).toBe(true)
    // Its own old spot is never in its way.
    expect(fitsAt(placed, 'u4', { x: 10, z: 2000 })).toBe(true)
  })

  it('moves a free unit out of the way of a layout grown into it, and leaves the rest alone', () => {
    const inTheWay: FreeUnit = { entryId: 'u4', pieceId: 'table', centre: { x: 0, z: 100 }, rotationY: 0 }
    const clear: FreeUnit = { entryId: 'u5', pieceId: 'table', centre: { x: 4000, z: 0 }, rotationY: 0 }
    const layout = sofa()
    const settled = settleFreeUnits(layout, [inTheWay, clear], DEFINITIONS)
    expect(settled[1]).toEqual(clear)
    const moved = placeFreeUnits(settled, DEFINITIONS)
    expect(moved.some((unit) => layout.some((piece) => piecesOverlap(piece, unit)))).toBe(false)
    expect(settled[0]?.centre).not.toEqual(inTheWay.centre)
  })

  it('takes its room from the layout limit', () => {
    const free: FreeUnit[] = [{ entryId: 'u4', pieceId: 'table', centre: { x: 0, z: 0 }, rotationY: 0 }]
    expect(chainLimitsBeside(free, { maxPieces: 12, frontUnits: false }).maxPieces).toBe(11)
  })

  it('turns an eighth at a time and comes back round to where it started', () => {
    let unit: FreeUnit = { entryId: 'u4', pieceId: 'armchair', centre: { x: 0, z: 0 }, rotationY: 0 }
    for (let turn = 0; turn < 8; turn += 1) unit = turnedFreeUnit(unit)
    expect(unit.rotationY).toBe(0)
  })

  it('writes a free unit beside the first unit of a turned layout, and reads it back beside a fresh one', () => {
    const anchor = { centre: { x: 500, z: -300 }, rotationY: Math.PI / 2 }
    const unit: FreeUnit = { entryId: 'u4', pieceId: 'armchair', centre: { x: 1500, z: -300 }, rotationY: Math.PI / 2 + Math.PI / 4 }
    const spot = freeUnitSpot(unit, anchor)
    // A metre out in front of the anchor, whose front faces +x once it is turned a quarter.
    expect(spot).toEqual({ x: 0, z: 1000, turnDegrees: 45 })
    const back = freeUnitFromSpot('u9', 'armchair', spot)
    expect(back.centre).toEqual({ x: 0, z: 1000 })
    expect(back.rotationY).toBeCloseTo(Math.PI / 4, 6)
  })
})

describe('layout code with units on their own', () => {
  const vocabulary: LayoutCodeVocabulary = {
    pieceSlugById: new Map([
      ['left', 'brs-r'],
      ['table', 'bts'],
    ]),
    otherOptions: [],
  }

  it('round-trips where each stands, with no "." to split the layout on', () => {
    const code = encodeLayout(
      [
        { pieceId: 'left', choices: {}, flipped: false },
        { pieceId: 'table', choices: {}, flipped: false, free: { x: -850, z: 1200, turnDegrees: 22.5 } },
      ],
      vocabulary,
    )
    expect(code).toBe('brs-r.bts~free:-850_1200_2250')
    const decoded = decodeLayout(code, vocabulary)
    expect(decoded?.units.map((unit) => unit.free ?? null)).toEqual([null, { x: -850, z: 1200, turnDegrees: 22.5 }])
  })

  it('keeps the unit when its place is garbled, only losing where it stood', () => {
    const decoded = decodeLayout('brs-r.bts~free:oops', vocabulary)
    expect(decoded?.units).toHaveLength(2)
    expect(decoded?.units[1]?.free).toBeUndefined()
  })
})
