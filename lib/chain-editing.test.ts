import { describe, expect, it } from 'vitest'
import {
  addAtEnd,
  candidatesAtEnd,
  endIsOpen,
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

  it('closes an end that finishes on an arm', () => {
    const placed = placeChain(chainOf('left', 'central', 'right'), DEFINITIONS)
    expect(endIsOpen(placed, 'start')).toBe(false)
    expect(endIsOpen(placed, 'end')).toBe(false)
    expect(refusalsAt(chainOf('left', 'central', 'right'), 'end').central).toBe('end-is-closed')
  })

  it('refuses a corner that would fold the layout back onto itself', () => {
    const ring = chainOf('corner', 'corner', 'corner', 'corner')
    expect(findChainProblem(ring, DEFINITIONS, LIMITS)).toBeNull()
    expect(refusalsAt(ring, 'end').corner).toBe('would-overlap')
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
