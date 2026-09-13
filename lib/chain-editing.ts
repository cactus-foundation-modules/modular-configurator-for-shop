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
  anchorLayout,
  footprintAt,
  footprintsOverlap,
  placeChain,
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

export type EditResult =
  /** `displacedEntryId`: a unit the edit moved out of the way, which the view should not hold still. */
  | { ok: true; chain: ChainEntry[]; displacedEntryId: string | null }
  | { ok: false; refusal: EditRefusal }

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

/**
 * How a unit added at one end of the layout goes in.
 *
 * At an open end it simply joins on. At an end that finishes with an arm it goes
 * just inside the arm unit instead, and the arm unit moves out to stay at the
 * end - so a ready-made sofa can still be made longer from either end, the way
 * a shopper would picture it, without anyone having to take the end off first.
 */
export interface EndPlan {
  /** Where in the chain the new unit is inserted. */
  insertAt: number
  /** The arm unit the new one goes inside of, which moves out; null at an open end. */
  displacedEntryId: string | null
}

export function endPlan(
  chain: readonly ChainEntry[],
  end: ChainEnd,
  definitions: ReadonlyMap<string, PieceDefinition>,
): EndPlan | null {
  const first = chain[0]
  const last = chain[chain.length - 1]
  if (!first || !last) return end === 'end' ? { insertAt: 0, displacedEntryId: null } : null
  const edge = end === 'end' ? last : first
  const edgeDefinition = definitions.get(edge.pieceId)
  if (!edgeDefinition) return null
  const open = end === 'end' ? acceptsJoinAfter(edgeDefinition) : acceptsJoinBefore(edgeDefinition)
  if (open) return { insertAt: end === 'end' ? chain.length : 0, displacedEntryId: null }
  // A lone unit with an arm is extended from its open side, which the other end
  // already offers; offering it here too would be the same space twice.
  if (chain.length < 2) return null
  return { insertAt: end === 'end' ? chain.length - 1 : 1, displacedEntryId: edge.entryId }
}

function insertedAt(chain: readonly ChainEntry[], index: number, entry: ChainEntry): ChainEntry[] {
  return [...chain.slice(0, index), entry, ...chain.slice(index)]
}

/** A neighbour it cannot join is, from where the shopper stands, its arm in the way. */
function refusalForAddition(problem: EditRefusal | null): EditRefusal | null {
  return problem === 'neighbours-cannot-join' ? 'piece-closed-on-joining-side' : problem
}

const PROBE_ENTRY_ID = 'mcf-probe'

/**
 * Every piece type offered at one end, each with where its space is drawn and
 * why it is refused if it is. Refused pieces stay in the list so the picker can
 * say why, rather than options silently vanishing. The space is where the new
 * unit lands at an open end, and where the arm unit moves out to at a closed one.
 */
export function candidatesAtEnd(
  placed: readonly PlacedPiece[],
  end: ChainEnd,
  definitions: readonly PieceDefinition[],
  limits: ChainLimits,
): EndCandidate[] {
  const chain = placed.map((piece) => piece.entry)
  const byId = new Map([...placed.map((piece) => piece.definition), ...definitions].map((definition) => [definition.pieceId, definition]))
  const plan = endPlan(chain, end, byId)
  return definitions.map((definition) => {
    if (!plan) {
      return { definition, pose: ORIGIN_POSE, footprint: footprintAt(definition, ORIGIN_POSE), refusal: 'end-is-closed' }
    }
    const trial = insertedAt(chain, plan.insertAt, { entryId: PROBE_ENTRY_ID, pieceId: definition.pieceId })
    const refusal = placed.length >= limits.maxPieces ? 'too-many-pieces' : refusalForAddition(findChainProblem(trial, byId, limits))
    const trialPlaced = anchorLayout(placeChain(trial, byId), placed, plan.displacedEntryId)
    const marker = trialPlaced.find((piece) => piece.entry.entryId === (plan.displacedEntryId ?? PROBE_ENTRY_ID))
    const pose = marker?.pose ?? ORIGIN_POSE
    return { definition, pose, footprint: marker?.footprint ?? footprintAt(definition, pose), refusal }
  })
}

const ORIGIN_POSE: PiecePose = { centre: { x: 0, z: 0 }, rotationY: 0 }

function checked(
  chain: ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const problem = findChainProblem(chain, definitions, limits)
  return problem ? { ok: false, refusal: problem } : { ok: true, chain, displacedEntryId: null }
}

export function addAtEnd(
  chain: readonly ChainEntry[],
  end: ChainEnd,
  entry: ChainEntry,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  if (!definitions.has(entry.pieceId)) return { ok: false, refusal: 'unknown-piece' }
  const plan = endPlan(chain, end, definitions)
  if (!plan) return { ok: false, refusal: 'end-is-closed' }
  if (chain.length >= limits.maxPieces) return { ok: false, refusal: 'too-many-pieces' }
  const trial = insertedAt(chain, plan.insertAt, entry)
  const refusal = refusalForAddition(findChainProblem(trial, definitions, limits))
  return refusal ? { ok: false, refusal } : { ok: true, chain: trial, displacedEntryId: plan.displacedEntryId }
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
