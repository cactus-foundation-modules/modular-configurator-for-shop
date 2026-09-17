import { describe, expect, it } from 'vitest'
import { addAtEnd, candidatesAtEnd, findChainProblem, flipEntry } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  footprintsOverlap,
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

// A rounded modular range's real footprints, in millimetres: 710 deep seats, a
// 550 wide central unit (backed and backless), 1200 quarter-circle curves with
// the back outside, inside or not at all, and a 1420 wide rounded end.
const CENTRAL: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 550, depthMm: 710 }
const BACKLESS: PieceDefinition = { pieceId: 'backless', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 550, depthMm: 710 }
const LEFT_END: PieceDefinition = { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 710, depthMm: 710 }
const RIGHT_END: PieceDefinition = { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 710, depthMm: 710 }
const CURVE_OUT: PieceDefinition = { pieceId: 'outer', shape: { kind: 'curve', back: 'outside', seatDepthMm: 710 }, widthMm: 1200, depthMm: 1200 }
const CURVE_IN: PieceDefinition = { pieceId: 'inner', shape: { kind: 'curve', back: 'inside', seatDepthMm: 710 }, widthMm: 1200, depthMm: 1200 }
const CURVE_NONE: PieceDefinition = { pieceId: 'either', shape: { kind: 'curve', back: 'none', seatDepthMm: 710 }, widthMm: 1200, depthMm: 1200 }
const ROUND_END: PieceDefinition = { pieceId: 'd-end', shape: { kind: 'round-end' }, widthMm: 1420, depthMm: 710 }

const ALL = [CENTRAL, BACKLESS, LEFT_END, RIGHT_END, CURVE_OUT, CURVE_IN, CURVE_NONE, ROUND_END]
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

describe('a curve with its back outside', () => {
  it('turns the row towards the seats, its inner edge starting at the seat front before it', () => {
    const placed = placeChain(chainOf('central', 'outer', 'central'), DEFINITIONS)
    // The central unit sits at the origin: x -275..275, back at z -355, front at +355.
    expect(pieceAt(placed, 1).footprint).toEqual({ minX: 275, maxX: 1475, minZ: -355, maxZ: 845 })
    // The ring is centred on (275, 845), so its inner radius (490) meets the
    // central unit's front corner and its outer radius (1200) its back corner.
    // The next unit leaves the curve's far end facing back along the row.
    expect(pieceAt(placed, 2).footprint).toEqual({ minX: 765, maxX: 1475, minZ: 845, maxZ: 1395 })
    expect(pieceAt(placed, 2).pose.rotationY).toBeCloseTo(-Math.PI / 2)
  })

  it('makes a booth from three and joins up into a ring with four', () => {
    const booth = placeChain(chainOf('outer', 'outer', 'outer'), DEFINITIONS)
    expect(findChainProblem(chainOf('outer', 'outer', 'outer'), DEFINITIONS, LIMITS)).toBeNull()
    expect(layoutIsClosed(booth)).toBe(false)
    const ring = placeChain(chainOf('outer', 'outer', 'outer', 'outer'), DEFINITIONS)
    expect(layoutIsClosed(ring)).toBe(true)
    // Turning towards the seats from the first curve at the origin, the ring is
    // centred on that curve's front-left corner, (-600, 600).
    expect(layoutBounds(ring)).toEqual({ minX: -1800, maxX: 600, minZ: -600, maxZ: 1800 })
    expect(shapeOfPlaced(ring)).toBe('island')
    expect(shapeOfPlaced(booth)).toBe('wraparound')
  })
})

describe('a curve with its back inside', () => {
  it('turns the row away from the seats and rings round into an island', () => {
    const placed = placeChain(chainOf('central', 'inner', 'central'), DEFINITIONS)
    // Away from the seats' front: the unit after it runs off towards -z.
    expect(pieceAt(placed, 2).footprint.maxZ).toBeLessThanOrEqual(pieceAt(placed, 1).footprint.minZ)
    const ring = placeChain(chainOf('inner', 'inner', 'inner', 'inner'), DEFINITIONS)
    expect(findChainProblem(chainOf('inner', 'inner', 'inner', 'inner'), DEFINITIONS, LIMITS)).toBeNull()
    expect(layoutIsClosed(ring)).toBe(true)
    const bounds = layoutBounds(ring)
    expect(bounds && [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]).toEqual([2400, 2400])
  })

  it('names a row that bends both ways a serpentine', () => {
    expect(shapeOfPlaced(placeChain(chainOf('central', 'outer', 'inner', 'central'), DEFINITIONS))).toBe('serpentine')
  })
})

describe('a curve with no back', () => {
  it('is laid like a back-outside curve, or like a back-inside one when flipped', () => {
    const usual = placeChain(chainOf('backless', 'either', 'backless'), DEFINITIONS)
    const outside = placeChain(chainOf('backless', 'outer', 'backless'), DEFINITIONS)
    expect(usual.map((piece) => piece.footprint)).toEqual(outside.map((piece) => piece.footprint))
    const flippedChain: ChainEntry[] = [
      { entryId: 'e0', pieceId: 'backless' },
      { entryId: 'e1', pieceId: 'either', flipped: true },
      { entryId: 'e2', pieceId: 'backless' },
    ]
    const inside = placeChain(chainOf('backless', 'inner', 'backless'), DEFINITIONS)
    expect(placeChain(flippedChain, DEFINITIONS).map((piece) => piece.footprint)).toEqual(inside.map((piece) => piece.footprint))
  })

  it('goes in the other way round by itself when the usual way has no room', () => {
    // Three back-outside curves take the row three quarters of the way round; a
    // fourth curve the same way would land on the central unit it started from.
    const chain = chainOf('central', 'outer', 'outer', 'outer')
    const added = addAtEnd(chain, 'end', { entryId: 'n', pieceId: 'either' }, DEFINITIONS, LIMITS)
    expect(added.ok && added.chain[4]).toEqual({ entryId: 'n', pieceId: 'either', flipped: true })
    const placed = placeChain(chain, DEFINITIONS)
    expect(candidatesAtEnd(placed, 'end', [CURVE_NONE, CURVE_OUT], LIMITS).map((candidate) => candidate.refusal)).toEqual([null, 'would-overlap'])
    // Laid that way its square clips the central unit's corner, but the curve
    // itself swings clear: only the shapes count, not the boxes round them.
    const grown = added.ok ? placeChain(added.chain, DEFINITIONS) : []
    expect(footprintsOverlap(pieceAt(grown, 0).footprint, pieceAt(grown, 4).footprint)).toBe(true)
    expect(piecesOverlap(pieceAt(grown, 0), pieceAt(grown, 4))).toBe(false)
  })

  it('can be flipped once placed, and nothing else can', () => {
    const chain = chainOf('backless', 'either', 'backless')
    const flipped = flipEntry(chain, 'e1', DEFINITIONS, LIMITS)
    expect(flipped.ok && flipped.chain[1]?.flipped).toBe(true)
    expect(flipEntry(chain, 'e0', DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'cannot-flip' })
  })
})

describe('a rounded end', () => {
  it('wraps the row round behind itself, back to back', () => {
    const placed = placeChain(chainOf('central', 'd-end', 'central'), DEFINITIONS)
    const front = pieceAt(placed, 0)
    const end = pieceAt(placed, 1)
    const behind = pieceAt(placed, 2)
    // The flat side runs across both rows' ends: 1420 deep, from the front row's
    // seat front to the back row's.
    expect(end.footprint).toEqual({ minX: 275, maxX: 985, minZ: -1065, maxZ: 355 })
    // The row behind shares the front row's back line and faces the other way.
    expect(behind.footprint).toEqual({ minX: -275, maxX: 275, minZ: -1065, maxZ: -355 })
    expect(Math.abs(behind.pose.rotationY)).toBeCloseTo(Math.PI)
    expect(front.footprint.minZ).toBe(behind.footprint.maxZ)
    expect(shapeOfPlaced(placed)).toBe('back-to-back')
  })

  it('makes a capsule island from two ends and two rows, which then has no end to add to', () => {
    const capsule = chainOf('d-end', 'central', 'central', 'd-end', 'central', 'central')
    expect(findChainProblem(capsule, DEFINITIONS, LIMITS)).toBeNull()
    const placed = placeChain(capsule, DEFINITIONS)
    expect(layoutIsClosed(placed)).toBe(true)
    const bounds = layoutBounds(placed)
    expect(bounds && [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ].sort()).toEqual([1420, 2520])
    expect(shapeOfPlaced(placed)).toBe('island')
    expect(addAtEnd(capsule, 'end', { entryId: 'n', pieceId: 'central' }, DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'layout-is-closed' })
    expect(candidatesAtEnd(placed, 'start', [CENTRAL], LIMITS)[0]?.refusal).toBe('layout-is-closed')
  })
})

describe('starting layouts for a rounded range', () => {
  it('offers a booth and both islands alongside the sofas, backed central units first', () => {
    expect(suggestPresets(ALL, { maxPieces: 12 })).toEqual([
      { name: 'Pair', units: [{ pieceId: 'left' }, { pieceId: 'right' }] },
      { name: 'Row of three', units: [{ pieceId: 'left' }, { pieceId: 'central' }, { pieceId: 'right' }] },
      { name: 'Booth', units: [{ pieceId: 'outer' }, { pieceId: 'outer' }, { pieceId: 'outer' }] },
      { name: 'Round island', units: [{ pieceId: 'inner' }, { pieceId: 'inner' }, { pieceId: 'inner' }, { pieceId: 'inner' }] },
      { name: 'Capsule island', units: [{ pieceId: 'd-end' }, { pieceId: 'central' }, { pieceId: 'central' }, { pieceId: 'd-end' }, { pieceId: 'central' }, { pieceId: 'central' }] },
    ])
  })
})
