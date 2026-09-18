import { describe, expect, it } from 'vitest'
import {
  addAtEnd,
  candidatesAtEnd,
  candidatesRoundCorner,
  chainFromUnits,
  findChainProblem,
  removeEntry,
  replaceEntry,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  anchorLayout,
  piecesOverlap,
  placeChain,
  type ChainEntry,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { decodeLayout, encodeLayout } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import { shapeOfPlaced } from '@/modules/modular-configurator-for-shop/lib/layout-describe'

// A soft-seating range: 690 deep seats whose cushion stands 57 proud of a 633
// base, and a 620 square table that can sit in a corner.
const SEAT: PieceDefinition = { pieceId: 'seat', shape: { kind: 'straight', closedLeft: false, closedRight: false, overhangMm: 57 }, widthMm: 572, depthMm: 690 }
const TABLE: PieceDefinition = { pieceId: 'table', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true, cornerable: true }, widthMm: 620, depthMm: 620 }
const STOOL: PieceDefinition = { pieceId: 'stool', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 620, depthMm: 620 }
const PIECES = [SEAT, TABLE, STOOL]
const DEFINITIONS = new Map(PIECES.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 24 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function pieceWithId(placed: readonly PlacedPiece[], entryId: string): PlacedPiece {
  const piece = placed.find((candidate) => candidate.entry.entryId === entryId)
  if (!piece) throw new Error(`no piece ${entryId}`)
  return piece
}

function anyOverlap(placed: readonly PlacedPiece[]): boolean {
  return placed.some((piece, index) => placed.slice(index + 1).some((other) => piecesOverlap(piece, other)))
}

describe('a table beside a seat whose cushion stands proud', () => {
  it('lines up with the front of the seat base, not the cushion', () => {
    const placed = placeChain(chainOf('seat', 'table'), DEFINITIONS)
    expect(pieceWithId(placed, 'e0').footprint.maxZ).toBe(345)
    expect(pieceWithId(placed, 'e1').footprint.maxZ).toBe(288)
  })

  it('still lines up with the cushion front on a seat with no overhang set', () => {
    const plainSeat: PieceDefinition = { ...SEAT, shape: { kind: 'straight', closedLeft: false, closedRight: false } }
    const placed = placeChain(chainOf('seat', 'table'), new Map([[plainSeat.pieceId, plainSeat], [TABLE.pieceId, TABLE]]))
    expect(pieceWithId(placed, 'e1').footprint.maxZ).toBe(345)
  })
})

describe('a table at the end of a row, turned into a corner', () => {
  it('is offered round the corner at the end, with the new seat going off its front', () => {
    const placed = placeChain(chainOf('seat', 'table'), DEFINITIONS)
    const candidates = candidatesRoundCorner(placed, 'end', PIECES, LIMITS)
    const seat = candidates.find((candidate) => candidate.definition.pieceId === 'seat')
    expect(seat?.refusal).toBeNull()
    const table = pieceWithId(placed, 'e1')
    expect(seat?.space.footprint.minZ).toBe(table.footprint.maxZ)
  })

  it('builds an L with the table in the crook, flush with both rows and nothing on top of anything', () => {
    const result = addAtEnd(chainOf('seat', 'table'), 'end', { entryId: 'new', pieceId: 'seat' }, DEFINITIONS, LIMITS, { roundCorner: true })
    if (!result.ok) throw new Error(result.refusal)
    expect(result.chain[1]?.cornered).toBe('right')
    const placed = placeChain(result.chain, DEFINITIONS)
    const table = pieceWithId(placed, 'e1')
    const turnedSeat = pieceWithId(placed, 'new')
    // The new row runs forwards from the table's front, its base front along the
    // table's inner side and its back past the table's outer side.
    expect(turnedSeat.footprint.minZ).toBe(table.footprint.maxZ)
    expect(turnedSeat.footprint.minX).toBe(table.footprint.minX - 57)
    expect(turnedSeat.footprint.maxX).toBe(table.footprint.minX + 633)
    expect(anyOverlap(placed)).toBe(false)
    expect(shapeOfPlaced(placed)).toBe('l-shape')
    // The row goes on from the new seat, not from the table any more.
    const more = addAtEnd(result.chain, 'end', { entryId: 'more', pieceId: 'seat' }, DEFINITIONS, LIMITS)
    expect(more.ok).toBe(true)
  })

  it('works from the start of the row too, mirrored', () => {
    const result = addAtEnd(chainOf('table', 'seat'), 'start', { entryId: 'new', pieceId: 'seat' }, DEFINITIONS, LIMITS, { roundCorner: true })
    if (!result.ok) throw new Error(result.refusal)
    expect(result.chain[1]?.cornered).toBe('left')
    // Held where the shopper had it, as the builder does.
    const placed = anchorLayout(placeChain(result.chain, DEFINITIONS), placeChain(chainOf('table', 'seat'), DEFINITIONS))
    const table = pieceWithId(placed, 'e0')
    const turnedSeat = pieceWithId(placed, 'new')
    expect(turnedSeat.footprint.minZ).toBe(table.footprint.maxZ)
    expect(turnedSeat.footprint.maxX).toBe(table.footprint.maxX + 57)
    expect(anyOverlap(placed)).toBe(false)
  })

  it('is not offered for a backless unit the range has not marked, nor a lone table', () => {
    expect(candidatesRoundCorner(placeChain(chainOf('seat', 'stool'), DEFINITIONS), 'end', PIECES, LIMITS)).toEqual([])
    expect(candidatesRoundCorner(placeChain(chainOf('table'), DEFINITIONS), 'end', PIECES, LIMITS)).toEqual([])
    expect(candidatesRoundCorner(placeChain(chainOf('seat', 'seat'), DEFINITIONS), 'end', PIECES, LIMITS)).toEqual([])
  })

  it('leaves the ordinary end space as it was', () => {
    const candidates = candidatesAtEnd(placeChain(chainOf('seat', 'table'), DEFINITIONS), 'end', PIECES, LIMITS)
    expect(candidates.find((candidate) => candidate.definition.pieceId === 'seat')?.refusal).toBeNull()
  })

  it('refuses a corner on a unit that cannot sit in one', () => {
    const chain = chainFromUnits([{ pieceId: 'seat' }, { pieceId: 'stool', cornered: 'right' }, { pieceId: 'seat' }], 'e')
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBe('cannot-corner')
  })

  it('goes back to carrying the row straight on once the row round it is taken away', () => {
    const chain = chainFromUnits([{ pieceId: 'seat' }, { pieceId: 'table', cornered: 'right' }, { pieceId: 'seat' }], 'e')
    const result = removeEntry(chain, 'e2', DEFINITIONS, LIMITS)
    if (!result.ok) throw new Error(result.refusal)
    expect(result.chain[1]?.cornered).toBeUndefined()
  })

  it('keeps the L when the table is swapped for another that can sit in a corner, and straightens it otherwise', () => {
    const chain = chainFromUnits([{ pieceId: 'seat' }, { pieceId: 'table', cornered: 'right' }, { pieceId: 'seat' }], 'e')
    const kept = replaceEntry(chain, 'e1', { entryId: 'swap', pieceId: 'table' }, DEFINITIONS, LIMITS)
    expect(kept.ok && kept.chain[1]?.cornered).toBe('right')
    const straightened = replaceEntry(chain, 'e1', { entryId: 'swap', pieceId: 'stool' }, DEFINITIONS, LIMITS)
    expect(straightened.ok && straightened.chain[1]?.cornered).toBeUndefined()
  })

  it('survives the address bar', () => {
    const vocabulary = { pieceSlugById: new Map(PIECES.map((piece) => [piece.pieceId, piece.pieceId])), otherOptions: [] }
    const code = encodeLayout(
      [
        { pieceId: 'seat', choices: {}, flipped: false },
        { pieceId: 'table', choices: {}, flipped: false, cornered: 'right' },
        { pieceId: 'seat', choices: {}, flipped: false },
      ],
      vocabulary,
    )
    expect(code).toBe('seat.table~corner-right.seat')
    expect(decodeLayout(code, vocabulary)?.units[1]?.cornered).toBe('right')
  })
})
