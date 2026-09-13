import { describe, expect, it } from 'vitest'
import {
  anchorLayout,
  layoutBounds,
  placeChain,
  type ChainEntry,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

// Real footprints of a modular seating range, in millimetres: an armless
// central seat, two end seats with an arm, and a corner with a second back.
const LEFT_END: PieceDefinition = { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760 }
const CENTRAL: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760 }
const RIGHT_END: PieceDefinition = { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 790, depthMm: 760 }
const CORNER_BACK_LEFT: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 760, depthMm: 760 }
const CORNER_BACK_RIGHT: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'right' }, widthMm: 760, depthMm: 760 }

function definitionsWith(corner: PieceDefinition): Map<string, PieceDefinition> {
  return new Map([LEFT_END, CENTRAL, RIGHT_END, corner].map((definition) => [definition.pieceId, definition]))
}

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function pieceAt(placed: PlacedPiece[], index: number): PlacedPiece {
  const piece = placed[index]
  if (!piece) throw new Error(`no piece at ${index}`)
  return piece
}

describe('a straight run', () => {
  it('sits each unit flush against the last, facing the shopper', () => {
    const placed = placeChain(chainOf('left', 'central', 'right'), definitionsWith(CORNER_BACK_LEFT))
    expect(placed.map((piece) => piece.pose.centre)).toEqual([
      { x: 0, z: 0 },
      { x: 725, z: 0 },
      { x: 1450, z: 0 },
    ])
    expect(placed.every((piece) => piece.pose.rotationY === 0)).toBe(true)
    expect(layoutBounds(placed)).toEqual({ minX: -395, maxX: 1845, minZ: -380, maxZ: 380 })
  })
})

describe('turning a corner', () => {
  const lShape = chainOf('left', 'central', 'corner', 'central', 'right')

  it('puts the unit after a corner against its open side, backs in line with the corner', () => {
    const placed = placeChain(lShape, definitionsWith(CORNER_BACK_LEFT))
    const corner = pieceAt(placed, 2)
    const afterCorner = pieceAt(placed, 3)

    // The corner closes the first run: flush against the central seat before it.
    expect(corner.footprint).toEqual({ minX: 1055, maxX: 1815, minZ: -380, maxZ: 380 })
    // The next seat comes forward out of the corner's open front, the same width
    // as the corner, never off the end of the row or behind it.
    expect(afterCorner.footprint).toEqual({ minX: 1055, maxX: 1815, minZ: 380, maxZ: 1040 })
    // It is turned to face into the L (towards -x), so its back lines up with
    // the corner's second back on the outside edge.
    expect(afterCorner.pose.rotationY).toBeCloseTo(-Math.PI / 2)
    expect(afterCorner.footprint.maxX).toBe(corner.footprint.maxX)
  })

  it('carries on down the new run and closes it with the end unit', () => {
    const placed = placeChain(lShape, definitionsWith(CORNER_BACK_LEFT))
    expect(pieceAt(placed, 4).footprint).toEqual({ minX: 1055, maxX: 1815, minZ: 1040, maxZ: 1830 })
    expect(layoutBounds(placed)).toEqual({ minX: -395, maxX: 1815, minZ: -380, maxZ: 1830 })
  })

  it('builds the same L whichever side the corner model carries its second back', () => {
    const withBackLeft = placeChain(lShape, definitionsWith(CORNER_BACK_LEFT))
    const withBackRight = placeChain(lShape, definitionsWith(CORNER_BACK_RIGHT))
    expect(withBackRight.map((piece) => piece.footprint)).toEqual(withBackLeft.map((piece) => piece.footprint))
    // Only the corner itself is turned differently, to put its backs outside.
    expect(pieceAt(withBackRight, 2).pose.rotationY).toBe(0)
    expect(pieceAt(withBackLeft, 2).pose.rotationY).toBeCloseTo(-Math.PI / 2)
  })

  it('makes a U from two corners, the two outer runs facing each other', () => {
    const placed = placeChain(chainOf('left', 'corner', 'central', 'corner', 'right'), definitionsWith(CORNER_BACK_LEFT))
    const firstEnd = pieceAt(placed, 0)
    const lastEnd = pieceAt(placed, 4)
    expect(firstEnd.pose.rotationY).toBe(0)
    expect(Math.abs(lastEnd.pose.rotationY)).toBeCloseTo(Math.PI)
    // The closing end sits on the far side of the U, level with the opening one.
    expect(lastEnd.footprint.minX).toBe(firstEnd.footprint.minX)
  })
})

describe('adding before the first unit', () => {
  it('leaves the units already there exactly where they were', () => {
    const definitions = definitionsWith(CORNER_BACK_LEFT)
    const before = placeChain(chainOf('corner', 'central', 'right'), definitions)
    // A corner before the first unit swings the walk round; the anchor undoes it.
    const after = anchorLayout(
      placeChain([{ entryId: 'new', pieceId: 'corner' }, ...chainOf('corner', 'central', 'right')], definitions),
      before,
    )
    expect(after.slice(1).map((piece) => piece.footprint)).toEqual(before.map((piece) => piece.footprint))
  })
})

describe('making room inside an arm unit', () => {
  it('holds the rest still and lets the moved unit go', () => {
    const definitions = definitionsWith(CORNER_BACK_LEFT)
    const before = placeChain(chainOf('left', 'central', 'right'), definitions)
    // A central seat goes in just before the first unit; the first unit (the arm
    // end) is the one that moves, so it must not be what everything else is held to.
    const walked = placeChain([{ entryId: 'e0', pieceId: 'left' }, { entryId: 'new', pieceId: 'central' }, ...chainOf('left', 'central', 'right').slice(1)], definitions)
    const after = anchorLayout(walked, before, 'e0')
    expect(pieceAt(after, 2).footprint).toEqual(pieceAt(before, 1).footprint)
    expect(pieceAt(after, 3).footprint).toEqual(pieceAt(before, 2).footprint)
    expect(pieceAt(after, 0).footprint.maxX).toBe(pieceAt(before, 1).footprint.minX - 660)
  })
})

describe('taking a unit away', () => {
  it('keeps the rest of the layout still when the first unit goes', () => {
    const definitions = definitionsWith(CORNER_BACK_LEFT)
    const before = placeChain(chainOf('left', 'central', 'corner', 'central'), definitions)
    const after = anchorLayout(placeChain(chainOf('left', 'central', 'corner', 'central').slice(1), definitions), before)
    expect(after.map((piece) => piece.footprint)).toEqual(before.slice(1).map((piece) => piece.footprint))
  })
})
