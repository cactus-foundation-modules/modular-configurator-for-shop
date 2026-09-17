import { describe, expect, it } from 'vitest'
import {
  addFrontSpur,
  candidatesAtEnd,
  candidatesInFront,
  frontSpaceKey,
  isSpaceKey,
  spaceOfKey,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  footprintsOverlap,
  mainChainOf,
  placeChain,
  placeLayout,
  type ChainEntry,
  type PieceDefinition,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

// A leather reception range: a 660 square backed chair and corner, and a
// shallower backless cube that can stand in front of a chair.
const CHAIR: PieceDefinition = { pieceId: 'chair', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 660 }
const CUBE: PieceDefinition = { pieceId: 'cube', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 660, depthMm: 520 }
const CORNER: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 660, depthMm: 660 }
const RANGE = [CHAIR, CUBE, CORNER]
const DEFINITIONS = new Map(RANGE.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 24 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function withCubeInFrontOf(chain: ChainEntry[], hostEntryId: string): ChainEntry[] {
  return chain.map((entry) => (entry.entryId === hostEntryId ? { ...entry, frontSpur: { entryId: 'cube-front', pieceId: 'cube' } } : entry))
}

describe('a layout with a cube in front of a chair', () => {
  it('lists each cube straight after its chair, the way the unit list numbers them', () => {
    const placed = placeLayout(withCubeInFrontOf(chainOf('chair', 'chair'), 'e0'), DEFINITIONS)
    expect(placed.map((piece) => piece.entry.entryId)).toEqual(['e0', 'cube-front', 'e1'])
    expect(mainChainOf(placed).map((entry) => entry.entryId)).toEqual(['e0', 'e1'])
  })

  it('offers the end of the row beside the last chair, not beyond the cube', () => {
    const placed = placeLayout(withCubeInFrontOf(chainOf('chair', 'chair'), 'e0'), DEFINITIONS)
    const chairAtEnd = candidatesAtEnd(placed, 'end', RANGE, LIMITS).find((candidate) => candidate.definition.pieceId === 'chair')
    expect(chairAtEnd?.refusal).toBeNull()
    expect(chairAtEnd?.footprint).toEqual({ minX: 990, maxX: 1650, minZ: -330, maxZ: 330 })
  })
})

describe('the space in front of a chair', () => {
  it('offers only the backless unit, standing on the chair seat front', () => {
    const placed = placeLayout(chainOf('chair', 'chair'), DEFINITIONS)
    const candidates = candidatesInFront(placed, 'e1', RANGE, LIMITS)
    expect(candidates.map((candidate) => [candidate.definition.pieceId, candidate.refusal])).toEqual([['cube', null]])
    expect(candidates[0]?.footprint).toEqual({ minX: 330, maxX: 990, minZ: 330, maxZ: 850 })
  })

  it('is not there in front of a cube, a corner, or a chair that already has one', () => {
    const placed = placeLayout(withCubeInFrontOf(chainOf('chair', 'cube', 'corner'), 'e0'), DEFINITIONS)
    expect(candidatesInFront(placed, 'e0', RANGE, LIMITS)).toEqual([])
    expect(candidatesInFront(placed, 'e1', RANGE, LIMITS)).toEqual([])
    expect(candidatesInFront(placed, 'e2', RANGE, LIMITS)).toEqual([])
  })

  it('is never offered by a range without both backed and backless straight units', () => {
    const sofas = [CHAIR, CORNER]
    expect(candidatesInFront(placeChain(chainOf('chair', 'corner'), DEFINITIONS), 'e0', sofas, LIMITS)).toEqual([])
    const stools = [CUBE]
    expect(candidatesInFront(placeChain(chainOf('cube', 'cube'), DEFINITIONS), 'e0', stools, LIMITS)).toEqual([])
  })

  it('says the layout is full when it is', () => {
    const placed = placeLayout(chainOf('chair', 'chair'), DEFINITIONS)
    expect(candidatesInFront(placed, 'e0', RANGE, { maxPieces: 2 }).map((candidate) => candidate.refusal)).toEqual(['too-many-pieces'])
  })

  it('can cover the same floor as another in the crook of an L, and only one can be used', () => {
    const chain = chainOf('chair', 'corner', 'chair')
    const placed = placeLayout(chain, DEFINITIONS)
    const beforeCorner = candidatesInFront(placed, 'e0', RANGE, LIMITS)[0]
    const afterCorner = candidatesInFront(placed, 'e2', RANGE, LIMITS)[0]
    expect(beforeCorner?.refusal).toBeNull()
    expect(afterCorner?.refusal).toBeNull()
    expect(beforeCorner && afterCorner && footprintsOverlap(beforeCorner.footprint, afterCorner.footprint)).toBe(true)
    const first = addFrontSpur(chain, 'e0', { entryId: 's0', pieceId: 'cube' }, DEFINITIONS, LIMITS)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(addFrontSpur(first.chain, 'e2', { entryId: 's2', pieceId: 'cube' }, DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'would-overlap' })
  })
})

describe('space keys', () => {
  it('round-trips an end and a front space', () => {
    expect(spaceOfKey('start')).toEqual({ kind: 'end', end: 'start' })
    expect(spaceOfKey(frontSpaceKey('u7'))).toEqual({ kind: 'front', hostEntryId: 'u7' })
    expect(['end', 'front:u7', 'front:', 'middle', 3, null].map(isSpaceKey)).toEqual([true, true, false, false, false, false])
  })
})
