import { describe, expect, it } from 'vitest'
import {
  addAtEnd,
  candidatesAtEnd,
  findChainProblem,
  removeEntry,
  replaceEntry,
  swapOptions,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { placeChain, type ChainEntry, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

const LEFT_END: PieceDefinition = { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760 }
const CENTRAL: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760 }
const RIGHT_END: PieceDefinition = { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 790, depthMm: 760 }
const CORNER: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 760, depthMm: 760 }

const ALL = [LEFT_END, CENTRAL, RIGHT_END, CORNER]
const DEFINITIONS = new Map(ALL.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 12 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function refusalsAt(chain: ChainEntry[], end: 'start' | 'end'): Record<string, string | null> {
  const placed = placeChain(chain, DEFINITIONS)
  return Object.fromEntries(candidatesAtEnd(placed, end, ALL, LIMITS).map((c) => [c.definition.pieceId, c.refusal]))
}

describe('what can be added where', () => {
  it('only offers pieces whose open side faces the layout', () => {
    expect(refusalsAt(chainOf('central'), 'end')).toEqual({
      left: 'piece-closed-on-joining-side',
      central: null,
      right: null,
      corner: null,
    })
    expect(refusalsAt(chainOf('central'), 'start')).toEqual({
      left: null,
      central: null,
      right: 'piece-closed-on-joining-side',
      corner: null,
    })
  })

  it('makes room inside an arm unit rather than refusing, so a finished sofa can still grow', () => {
    const sofa = chainOf('left', 'central', 'right')
    const placed = placeChain(sofa, DEFINITIONS)
    const atEnd = candidatesAtEnd(placed, 'end', ALL, LIMITS)
    expect(Object.fromEntries(atEnd.map((c) => [c.definition.pieceId, c.refusal]))).toEqual({
      left: 'piece-closed-on-joining-side',
      central: null,
      right: 'piece-closed-on-joining-side',
      corner: null,
    })
    // The space is drawn where the arm unit moves out to: just past its old spot.
    const centralSpace = atEnd.find((c) => c.definition.pieceId === 'central')?.footprint
    const armUnit = placed[2]
    expect(centralSpace?.minX).toBe((armUnit?.footprint.minX ?? Number.NaN) + 660)

    const grown = addAtEnd(sofa, 'end', { entryId: 'n', pieceId: 'central' }, DEFINITIONS, LIMITS)
    expect(grown.ok && grown.chain.map((entry) => entry.pieceId)).toEqual(['left', 'central', 'central', 'right'])
    expect(grown.ok && grown.displacedEntryId).toBe('e2')

    const grownAtStart = addAtEnd(sofa, 'start', { entryId: 'n', pieceId: 'corner' }, DEFINITIONS, LIMITS)
    expect(grownAtStart.ok && grownAtStart.chain.map((entry) => entry.pieceId)).toEqual(['left', 'corner', 'central', 'right'])
    expect(grownAtStart.ok && grownAtStart.displacedEntryId).toBe('e0')
  })

  it('offers a lone arm unit only its open side', () => {
    const placed = placeChain(chainOf('left'), DEFINITIONS)
    expect(candidatesAtEnd(placed, 'start', [CENTRAL], LIMITS)[0]?.refusal).toBe('end-is-closed')
    expect(candidatesAtEnd(placed, 'end', [CENTRAL], LIMITS)[0]?.refusal).toBeNull()
  })

  it('refuses a corner that would fold the layout back onto itself', () => {
    const ring = chainOf('corner', 'corner', 'corner', 'corner')
    expect(findChainProblem(ring, DEFINITIONS, LIMITS)).toBeNull()
    // Four corners meet all the way round: there is no end left to add to at all.
    expect(refusalsAt(ring, 'end').corner).toBe('layout-is-closed')
    expect(refusalsAt(chainOf('corner', 'corner', 'corner'), 'end').corner).toBeNull()
    expect(findChainProblem(chainOf('corner', 'corner', 'corner', 'corner', 'corner'), DEFINITIONS, LIMITS)).toBe('would-overlap')
  })

  it('stops at the size limit', () => {
    const full = chainOf('central', 'central')
    expect(refusalsAt(full, 'end').central).toBeNull()
    const placed = placeChain(full, DEFINITIONS)
    expect(candidatesAtEnd(placed, 'end', [CENTRAL], { maxPieces: 2 })[0]?.refusal).toBe('too-many-pieces')
  })
})

describe('editing a layout', () => {
  it('adds to either end and says no to an arm in the middle', () => {
    const added = addAtEnd(chainOf('central'), 'start', { entryId: 'n', pieceId: 'left' }, DEFINITIONS, LIMITS)
    expect(added.ok && added.chain.map((entry) => entry.pieceId)).toEqual(['left', 'central'])
    expect(addAtEnd(chainOf('central'), 'end', { entryId: 'n', pieceId: 'left' }, DEFINITIONS, LIMITS)).toEqual({
      ok: false,
      refusal: 'piece-closed-on-joining-side',
    })
  })

  it('closes up the gap when a unit is removed', () => {
    const removed = removeEntry(chainOf('left', 'corner', 'central', 'right'), 'e1', DEFINITIONS, LIMITS)
    expect(removed.ok && removed.chain.map((entry) => entry.pieceId)).toEqual(['left', 'central', 'right'])
  })

  it('offers only swaps that keep the layout buildable', () => {
    const chain = chainOf('left', 'central', 'right')
    expect(swapOptions(chain, 'e1', DEFINITIONS, LIMITS).map((definition) => definition.pieceId)).toEqual(['corner'])
    expect(swapOptions(chain, 'e0', DEFINITIONS, LIMITS).map((definition) => definition.pieceId)).toEqual(['central', 'corner'])
    expect(replaceEntry(chain, 'e1', { entryId: 'n', pieceId: 'right' }, DEFINITIONS, LIMITS)).toEqual({
      ok: false,
      refusal: 'neighbours-cannot-join',
    })
  })
})
