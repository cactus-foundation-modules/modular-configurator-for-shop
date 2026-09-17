import { describe, expect, it } from 'vitest'
import { addAtEnd, findChainProblem, flipEntry } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  isReversible,
  layoutBounds,
  layoutIsClosed,
  piecesOverlap,
  placeChain,
  type ChainEntry,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { shapeOfPlaced } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'

// A rounded range's 710 deep seats joined by half curves 2400 across (1200 deep),
// each with a 710 seat, so an inner hole 980 across. And a stool range's backless
// half curve: 1890 across, 450 seat, beside 450 square stools.
const CENTRAL: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 550, depthMm: 710 }
const LEFT_END: PieceDefinition = { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 710, depthMm: 710 }
const RIGHT_END: PieceDefinition = { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 710, depthMm: 710 }
const HALF_OUT: PieceDefinition = { pieceId: 'half-out', shape: { kind: 'half-curve', back: 'outside', seatDepthMm: 710 }, widthMm: 2400, depthMm: 1200 }
const HALF_IN: PieceDefinition = { pieceId: 'half-in', shape: { kind: 'half-curve', back: 'inside', seatDepthMm: 710 }, widthMm: 2400, depthMm: 1200 }
const HALF_NONE: PieceDefinition = { pieceId: 'half-none', shape: { kind: 'half-curve', back: 'none', seatDepthMm: 710 }, widthMm: 2400, depthMm: 1200 }
const STOOL: PieceDefinition = { pieceId: 'stool', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 450, depthMm: 450 }
const STOOL_HALF: PieceDefinition = { pieceId: 'stool-half', shape: { kind: 'half-curve', back: 'none', seatDepthMm: 450 }, widthMm: 1890, depthMm: 945 }

const ALL = [CENTRAL, LEFT_END, RIGHT_END, HALF_OUT, HALF_IN, HALF_NONE, STOOL, STOOL_HALF]
const DEFINITIONS = new Map(ALL.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 12 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function pieceAt(placed: PlacedPiece[], index: number): PlacedPiece {
  const piece = placed[index]
  if (!piece) throw new Error(`no piece at ${index}`)
  return piece
}

describe('a half curve with its back outside', () => {
  it('sends the row back the way it came, the two rows facing each other across the hole', () => {
    const placed = placeChain(chainOf('central', 'half-out', 'central'), DEFINITIONS)
    // The central unit sits at the origin: x -275..275, back at z -355, front at +355.
    // The half curve lies on its side against the unit's right end, its ring
    // centred on (275, 845), so its outer end meets the unit's back corner.
    expect(pieceAt(placed, 1).footprint).toEqual({ minX: 275, maxX: 1475, minZ: -355, maxZ: 2045 })
    const across = pieceAt(placed, 2)
    // The unit after it faces back towards the first, its back on the ring's far outer end.
    expect(across.footprint).toEqual({ minX: -275, maxX: 275, minZ: 1335, maxZ: 2045 })
    expect(Math.abs(across.pose.rotationY)).toBeCloseTo(Math.PI)
    // Seat front to seat front is the hole: twice the inner radius (1200 - 710).
    expect(across.footprint.minZ - pieceAt(placed, 0).footprint.maxZ).toBe(980)
    expect(shapeOfPlaced(placed)).toBe('u-shape')
  })

  it('joins up into a round booth with two', () => {
    const chain = chainOf('half-out', 'half-out')
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    const ring = placeChain(chain, DEFINITIONS)
    expect(layoutIsClosed(ring)).toBe(true)
    const bounds = layoutBounds(ring)
    expect(bounds && [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]).toEqual([2400, 2400])
    expect(shapeOfPlaced(ring)).toBe('island')
    expect(addAtEnd(chain, 'end', { entryId: 'n', pieceId: 'central' }, DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'layout-is-closed' })
  })

  it('closes a horseshoe of two rows into an island with a second half curve', () => {
    const chain = chainOf('half-out', 'central', 'central', 'half-out', 'central', 'central')
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    expect(layoutIsClosed(placeChain(chain, DEFINITIONS))).toBe(true)
  })
})

describe('a half curve with its back inside', () => {
  it('wraps the row round behind itself, back to back with the hole between them', () => {
    const placed = placeChain(chainOf('central', 'half-in', 'central'), DEFINITIONS)
    // Laid the inside way its outer end meets the unit's seat front, and it hangs back behind the row.
    expect(pieceAt(placed, 1).footprint).toEqual({ minX: 275, maxX: 1475, minZ: -2045, maxZ: 355 })
    const behind = pieceAt(placed, 2)
    expect(behind.footprint).toEqual({ minX: -275, maxX: 275, minZ: -2045, maxZ: -1335 })
    expect(Math.abs(behind.pose.rotationY)).toBeCloseTo(Math.PI)
    // Back to back: from the front row's back (-355) to the row behind's back (-1335) is the hole.
    expect(pieceAt(placed, 0).footprint.minZ - behind.footprint.maxZ).toBe(980)
    expect(shapeOfPlaced(placed)).toBe('back-to-back')
  })

  it('makes a round island from two', () => {
    const ring = placeChain(chainOf('half-in', 'half-in'), DEFINITIONS)
    expect(layoutIsClosed(ring)).toBe(true)
    expect(shapeOfPlaced(ring)).toBe('island')
  })
})

describe('a half curve with no back', () => {
  it('is laid like a back-outside half curve, or like a back-inside one when flipped', () => {
    expect(isReversible(HALF_NONE)).toBe(true)
    expect(isReversible(HALF_OUT)).toBe(false)
    const usual = placeChain(chainOf('central', 'half-none', 'central'), DEFINITIONS)
    const outside = placeChain(chainOf('central', 'half-out', 'central'), DEFINITIONS)
    expect(usual.map((piece) => piece.footprint)).toEqual(outside.map((piece) => piece.footprint))
    const flippedChain: ChainEntry[] = [
      { entryId: 'e0', pieceId: 'central' },
      { entryId: 'e1', pieceId: 'half-none', flipped: true },
      { entryId: 'e2', pieceId: 'central' },
    ]
    const inside = placeChain(chainOf('central', 'half-in', 'central'), DEFINITIONS)
    expect(placeChain(flippedChain, DEFINITIONS).map((piece) => piece.footprint)).toEqual(inside.map((piece) => piece.footprint))
    expect(flipEntry(chainOf('central', 'half-none'), 'e1', DEFINITIONS, LIMITS)).toMatchObject({ ok: true })
  })

  it('makes a circle of stools from two, 1.89 m across', () => {
    const ring = placeChain(chainOf('stool-half', 'stool-half'), DEFINITIONS)
    expect(layoutIsClosed(ring)).toBe(true)
    const bounds = layoutBounds(ring)
    expect(bounds && [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]).toEqual([1890, 1890])
  })

  it('goes in the other way round by itself when the usual way would land on the layout', () => {
    // Two half curves and a two-stool run between them make a racetrack open at
    // one side. A third half curve laid the usual way would come round into the
    // first one; laid the inside way it swings off clear of it.
    const chain = chainOf('stool-half', 'stool', 'stool', 'stool-half')
    const usual = placeChain([...chain, { entryId: 'n', pieceId: 'stool-half' }], DEFINITIONS)
    const third = pieceAt(usual, 4)
    expect(usual.slice(0, 4).some((piece) => piecesOverlap(piece, third))).toBe(true)
    const added = addAtEnd(chain, 'end', { entryId: 'n', pieceId: 'stool-half' }, DEFINITIONS, LIMITS)
    expect(added.ok && added.chain[4]).toEqual({ entryId: 'n', pieceId: 'stool-half', flipped: true })
  })

  it('leaves room in its hole: a stool across the hole from its ends clears the ring', () => {
    const placed = placeChain(chainOf('stool', 'stool-half', 'stool'), DEFINITIONS)
    // The two stools face each other 990 apart (the 1890 ring's inner diameter)
    // and neither touches the curve except at the ends they join.
    expect(pieceAt(placed, 2).footprint.minZ - pieceAt(placed, 0).footprint.maxZ).toBe(990)
    expect(piecesOverlap(pieceAt(placed, 0), pieceAt(placed, 1))).toBe(false)
    expect(piecesOverlap(pieceAt(placed, 2), pieceAt(placed, 1))).toBe(false)
  })
})

describe('starting layouts for a range with half curves', () => {
  it('offers a horseshoe, a round booth and a round island made of half curves', () => {
    expect(suggestPresets([CENTRAL, LEFT_END, RIGHT_END, HALF_OUT, HALF_IN, HALF_NONE], LIMITS)).toEqual([
      { name: 'Pair', units: [{ pieceId: 'left' }, { pieceId: 'right' }] },
      { name: 'Row of three', units: [{ pieceId: 'left' }, { pieceId: 'central' }, { pieceId: 'right' }] },
      { name: 'Horseshoe', units: [{ pieceId: 'left' }, { pieceId: 'central' }, { pieceId: 'half-out' }, { pieceId: 'central' }, { pieceId: 'right' }] },
      { name: 'Round booth', units: [{ pieceId: 'half-out' }, { pieceId: 'half-out' }] },
      { name: 'Round island', units: [{ pieceId: 'half-in' }, { pieceId: 'half-in' }] },
    ])
  })
})
