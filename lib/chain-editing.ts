/**
 * Editing rules for a modular layout chain.
 *
 * Pattern: every edit is a pure function from (chain, definitions) to either a
 * new chain or a refusal with a reason the shopper can read. The UI never
 * builds a chain by hand, so an invalid layout cannot be shown, priced or put
 * in the basket.
 */
import {
  acceptsJoinAfter,
  acceptsJoinBefore,
  footprintAt,
  footprintsOverlap,
  placeChain,
  poseAtEnd,
  type ChainEnd,
  type ChainEntry,
  type PieceDefinition,
  type PiecePose,
  type PlacedPiece,
  type FloorRectangle,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

/** Why an edit was refused. Each maps to one sentence in the UI. */
export type EditRefusal =
  /** The piece at that end has an arm or end panel there. */
  | 'end-is-closed'
  /** The new piece's arm or end panel would face into the layout. */
  | 'piece-closed-on-joining-side'
  /** The piece would sit on top of another. */
  | 'would-overlap'
  /** The layout is at its size limit. */
  | 'too-many-pieces'
  /** Two neighbours would meet arm to seat. */
  | 'neighbours-cannot-join'
  | 'unknown-entry'
  | 'unknown-piece'

export type EditResult = { ok: true; chain: ChainEntry[] } | { ok: false; refusal: EditRefusal }

/** One option in the "add a unit here" picker. */
export interface EndCandidate {
  definition: PieceDefinition
  pose: PiecePose
  footprint: FloorRectangle
  refusal: EditRefusal | null
}

export interface ChainLimits {
  maxPieces: number
}

export function canJoin(before: PieceDefinition, after: PieceDefinition): boolean {
  return acceptsJoinAfter(before) && acceptsJoinBefore(after)
}

/** First problem with a whole chain, or null when it is a buildable layout. */
export function findChainProblem(
  chain: readonly ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditRefusal | null {
  if (chain.length > limits.maxPieces) return 'too-many-pieces'
  let previous: PieceDefinition | null = null
  for (const entry of chain) {
    const definition = definitions.get(entry.pieceId)
    if (!definition) return 'unknown-piece'
    if (previous && !canJoin(previous, definition)) return 'neighbours-cannot-join'
    previous = definition
  }
  const placed = placeChain(chain, definitions)
  return anyFootprintsOverlap(placed) ? 'would-overlap' : null
}

function anyFootprintsOverlap(placed: readonly PlacedPiece[]): boolean {
  return placed.some((piece, index) =>
    placed.slice(index + 1).some((later) => footprintsOverlap(piece.footprint, later.footprint)),
  )
}

/** Whether a unit can be added at this end at all, before choosing which. */
export function endIsOpen(placed: readonly PlacedPiece[], end: ChainEnd): boolean {
  const first = placed[0]
  const last = placed[placed.length - 1]
  if (!first || !last) return end === 'end'
  return end === 'end' ? acceptsJoinAfter(last.definition) : acceptsJoinBefore(first.definition)
}

/**
 * Every piece type offered at one end, each with where it would land and why
 * it is refused if it is. Refused pieces stay in the list so the picker can
 * say why, rather than options silently vanishing.
 */
export function candidatesAtEnd(
  placed: readonly PlacedPiece[],
  end: ChainEnd,
  definitions: readonly PieceDefinition[],
  limits: ChainLimits,
): EndCandidate[] {
  const open = endIsOpen(placed, end)
  return definitions.map((definition) => {
    const pose = poseAtEnd(placed, end, definition)
    const footprint = footprintAt(definition, pose)
    return { definition, pose, footprint, refusal: refusalAtEnd(placed, end, definition, footprint, open, limits) }
  })
}

function refusalAtEnd(
  placed: readonly PlacedPiece[],
  end: ChainEnd,
  definition: PieceDefinition,
  footprint: FloorRectangle,
  endOpen: boolean,
  limits: ChainLimits,
): EditRefusal | null {
  if (placed.length >= limits.maxPieces) return 'too-many-pieces'
  if (!endOpen) return 'end-is-closed'
  if (placed.length > 0) {
    const joinsOnOpenSide = end === 'end' ? acceptsJoinBefore(definition) : acceptsJoinAfter(definition)
    if (!joinsOnOpenSide) return 'piece-closed-on-joining-side'
  }
  return placed.some((piece) => footprintsOverlap(piece.footprint, footprint)) ? 'would-overlap' : null
}

function checked(
  chain: ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const problem = findChainProblem(chain, definitions, limits)
  return problem ? { ok: false, refusal: problem } : { ok: true, chain }
}

export function addAtEnd(
  chain: readonly ChainEntry[],
  end: ChainEnd,
  entry: ChainEntry,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const definition = definitions.get(entry.pieceId)
  if (!definition) return { ok: false, refusal: 'unknown-piece' }
  const placed = placeChain(chain, definitions)
  const pose = poseAtEnd(placed, end, definition)
  const refusal = refusalAtEnd(placed, end, definition, footprintAt(definition, pose), endIsOpen(placed, end), limits)
  if (refusal) return { ok: false, refusal }
  return checked(end === 'end' ? [...chain, entry] : [entry, ...chain], definitions, limits)
}

/** Removes one piece; its neighbours close up and join each other. */
export function removeEntry(
  chain: readonly ChainEntry[],
  entryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const index = chain.findIndex((entry) => entry.entryId === entryId)
  if (index === -1) return { ok: false, refusal: 'unknown-entry' }
  return checked(
    chain.filter((entry) => entry.entryId !== entryId),
    definitions,
    limits,
  )
}

/**
 * Swaps one piece for another type. The replacement gets a new entry id so
 * the layout re-anchors on the pieces either side rather than on a piece
 * whose shape just changed.
 */
export function replaceEntry(
  chain: readonly ChainEntry[],
  entryId: string,
  replacement: ChainEntry,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const index = chain.findIndex((entry) => entry.entryId === entryId)
  if (index === -1) return { ok: false, refusal: 'unknown-entry' }
  const next = [...chain]
  next[index] = replacement
  return checked(next, definitions, limits)
}

/** Piece types the given entry could be swapped for without breaking the layout. */
export function swapOptions(
  chain: readonly ChainEntry[],
  entryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): PieceDefinition[] {
  const current = chain.find((entry) => entry.entryId === entryId)
  if (!current) return []
  return [...definitions.values()].filter(
    (definition) =>
      definition.pieceId !== current.pieceId &&
      replaceEntry(chain, entryId, { entryId: `${entryId}:probe`, pieceId: definition.pieceId }, definitions, limits).ok,
  )
}
