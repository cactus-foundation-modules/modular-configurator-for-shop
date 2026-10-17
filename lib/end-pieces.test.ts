import { describe, expect, it } from 'vitest'
import {
  addAtEnd,
  candidatesAtEnd,
  findChainProblem,
  removeEntry,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  endSpaceOutline,
  placeChain,
  type ChainEntry,
  type PieceDefinition,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { choiceFromShape, guessShapeFromLabel, shapeFromChoice } from '@/modules/modular-configurator-for-shop/lib/shape-choice'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'

// A reception desk range: two lengths of desk and a 1000 extension that hangs
// off either end of the run.
const DESK: PieceDefinition = { pieceId: 'desk', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 1662, depthMm: 890 }
const SHORT_DESK: PieceDefinition = { pieceId: 'short', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 1462, depthMm: 890 }
const EXTENSION: PieceDefinition = { pieceId: 'ext', shape: { kind: 'straight', closedLeft: false, closedRight: false, endPiece: true }, widthMm: 1000, depthMm: 890 }
const ALL = [DESK, SHORT_DESK, EXTENSION]
const DEFINITIONS = new Map(ALL.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 12 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

describe('an end piece', () => {
  it('is laid as it comes at the start and turned round at the far end, in the same box', () => {
    const placed = placeChain(chainOf('ext', 'desk', 'desk', 'ext'), DEFINITIONS)
    expect(placed[0]?.pose.rotationY).toBe(0)
    expect(placed[0]?.turnedRound).toBeUndefined()
    expect(Math.abs(placed[3]?.pose.rotationY ?? 0)).toBeCloseTo(Math.PI)
    expect(placed[3]?.turnedRound).toBe(true)
    expect(placed[3]?.footprint).toEqual({ minX: 3824, maxX: 4824, minZ: -445, maxZ: 445 })
    expect(findChainProblem(chainOf('ext', 'desk', 'desk', 'ext'), DEFINITIONS, LIMITS)).toBeNull()
  })

  it('never sits in the middle of a row, and two never join', () => {
    expect(findChainProblem(chainOf('desk', 'ext', 'desk'), DEFINITIONS, LIMITS)).toBe('neighbours-cannot-join')
    expect(findChainProblem(chainOf('ext', 'ext'), DEFINITIONS, LIMITS)).toBe('neighbours-cannot-join')
  })

  it('closes the end it finishes: a unit added there goes inside it', () => {
    const chain = chainOf('desk', 'ext')
    const added = addAtEnd(chain, 'end', { entryId: 'new', pieceId: 'short' }, DEFINITIONS, LIMITS)
    expect(added.ok && added.chain.map((entry) => entry.pieceId)).toEqual(['desk', 'short', 'ext'])
    const second = addAtEnd(chain, 'end', { entryId: 'new', pieceId: 'ext' }, DEFINITIONS, LIMITS)
    expect(second).toEqual({ ok: false, refusal: 'piece-closed-on-joining-side' })
    const atStart = addAtEnd(chainOf('ext', 'desk'), 'start', { entryId: 'new', pieceId: 'desk' }, DEFINITIONS, LIMITS)
    expect(atStart.ok && atStart.chain.map((entry) => entry.pieceId)).toEqual(['ext', 'desk', 'desk'])
  })

  it('can be added to either open end of a desk', () => {
    const left = addAtEnd(chainOf('desk'), 'start', { entryId: 'new', pieceId: 'ext' }, DEFINITIONS, LIMITS)
    const right = addAtEnd(chainOf('desk'), 'end', { entryId: 'new', pieceId: 'ext' }, DEFINITIONS, LIMITS)
    expect(left.ok && left.chain.map((entry) => entry.pieceId)).toEqual(['ext', 'desk'])
    expect(right.ok && right.chain.map((entry) => entry.pieceId)).toEqual(['desk', 'ext'])
  })

  it('on its own takes a desk on its open side only', () => {
    expect(addAtEnd(chainOf('ext'), 'start', { entryId: 'new', pieceId: 'desk' }, DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'end-is-closed' })
    expect(addAtEnd(chainOf('ext'), 'end', { entryId: 'new', pieceId: 'desk' }, DEFINITIONS, LIMITS).ok).toBe(true)
  })

  it('draws the space past a turned-round end on its outer side, not over the desk', () => {
    const placed = placeChain(chainOf('desk', 'ext'), DEFINITIONS)
    const last = placed[1]
    if (!last) throw new Error('no end piece')
    const xs = endSpaceOutline(last, 'end').map((corner) => corner.x)
    expect(Math.min(...xs)).toBeCloseTo(last.footprint.maxX)
    const offered = candidatesAtEnd(placed, 'end', ALL, LIMITS)
    expect(offered.find((candidate) => candidate.definition.pieceId === 'desk')?.refusal).toBeNull()
    expect(offered.find((candidate) => candidate.definition.pieceId === 'ext')?.refusal).toBe('piece-closed-on-joining-side')
  })

  it('leaves a lone end piece where it stood when the desk beside it goes', () => {
    const removed = removeEntry(chainOf('desk', 'ext'), 'e0', DEFINITIONS, LIMITS)
    expect(removed.ok && removed.chain.map((entry) => entry.pieceId)).toEqual(['ext'])
  })

  it('finishes both ends of the suggested row of three', () => {
    const presets = suggestPresets(ALL, LIMITS)
    expect(presets.map((preset) => preset.name)).toEqual(['Row of three'])
    expect(presets[0]?.units.map((unit) => unit.pieceId)).toEqual(['ext', 'desk', 'ext'])
  })
})

describe('the end piece choice on the set-up screen', () => {
  it('round-trips and is guessed from an extension', () => {
    expect(choiceFromShape(shapeFromChoice('end-piece'))).toBe('end-piece')
    expect(guessShapeFromLabel('100cm Extention')).toBe('end-piece')
    expect(guessShapeFromLabel('Desk extension')).toBe('end-piece')
  })
})
