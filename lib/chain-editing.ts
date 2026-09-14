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
  isReversible,
  layoutIsClosed,
  piecesOverlap,
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
  /** The layout joins up all the way round, so it has no end to add to. */
  | 'layout-is-closed'
  /** Only a curve with no back can be turned the other way round. */
  | 'cannot-flip'
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
    placed.slice(index + 1).some((later) => piecesOverlap(piece, later)),
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
  if (isClosedChain(chain, definitions)) return null
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

/** True when the chain joins up all the way round. */
export function isClosedChain(chain: readonly ChainEntry[], definitions: ReadonlyMap<string, PieceDefinition>): boolean {
  if (chain.length < 2 || chain.some((entry) => !definitions.has(entry.pieceId))) return false
  return layoutIsClosed(placeChain(chain, definitions))
}

/**
 * The ways a new entry may be laid: as given, and for a reversible piece the
 * other way round too. A backless curve goes in whichever way fits, the usual
 * way first, so a shopper never has to know it could be turned to make room.
 */
function waysToLay(entry: ChainEntry, definitions: ReadonlyMap<string, PieceDefinition>): ChainEntry[] {
  const definition = definitions.get(entry.pieceId)
  if (!definition || !isReversible(definition)) return [{ entryId: entry.entryId, pieceId: entry.pieceId }]
  return [
    { entryId: entry.entryId, pieceId: entry.pieceId, flipped: entry.flipped === true },
    { entryId: entry.entryId, pieceId: entry.pieceId, flipped: entry.flipped !== true },
  ]
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
 * unit lands. At a closed arm end that is the space just inside the arm; the
 * arm unit moves out when the shopper picks a unit, but the prompt belongs
 * where the new unit will actually sit.
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
  const closed = isClosedChain(chain, byId)
  return definitions.map((definition) => {
    if (!plan) {
      const refusal = closed ? 'layout-is-closed' : 'end-is-closed'
      return { definition, pose: ORIGIN_POSE, footprint: footprintAt(definition, ORIGIN_POSE), refusal }
    }
    const trials = waysToLay({ entryId: PROBE_ENTRY_ID, pieceId: definition.pieceId }, byId).map((probe) => {
      const trialChain = insertedAt(chain, plan.insertAt, probe)
      return { trialChain, problem: refusalForAddition(findChainProblem(trialChain, byId, limits)) }
    })
    const fitting = trials.find((candidate) => candidate.problem === null) ?? trials[0]
    const trial = fitting?.trialChain ?? chain
    const refusal = placed.length >= limits.maxPieces ? 'too-many-pieces' : (fitting?.problem ?? null)
    const trialPlaced = anchorLayout(placeChain(trial, byId), placed, plan.displacedEntryId)
    const marker = trialPlaced.find((piece) => piece.entry.entryId === PROBE_ENTRY_ID)
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
  if (!plan) return { ok: false, refusal: isClosedChain(chain, definitions) ? 'layout-is-closed' : 'end-is-closed' }
  if (chain.length >= limits.maxPieces) return { ok: false, refusal: 'too-many-pieces' }
  let firstRefusal: EditRefusal | null = null
  for (const laid of waysToLay(entry, definitions)) {
    const trial = insertedAt(chain, plan.insertAt, laid)
    const refusal = refusalForAddition(findChainProblem(trial, definitions, limits))
    if (!refusal) return { ok: true, chain: trial, displacedEntryId: plan.displacedEntryId }
    firstRefusal ??= refusal
  }
  return { ok: false, refusal: firstRefusal ?? 'would-overlap' }
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
  let firstRefusal: EditResult | null = null
  for (const laid of waysToLay(replacement, definitions)) {
    const next = [...chain]
    next[index] = laid
    const result = checked(next, definitions, limits)
    if (result.ok) return result
    firstRefusal ??= result
  }
  return firstRefusal ?? { ok: false, refusal: 'unknown-piece' }
}

/** Lays a reversible unit (a curve with no back) the other way round. */
export function flipEntry(
  chain: readonly ChainEntry[],
  entryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const index = chain.findIndex((entry) => entry.entryId === entryId)
  const current = chain[index]
  if (!current) return { ok: false, refusal: 'unknown-entry' }
  const definition = definitions.get(current.pieceId)
  if (!definition) return { ok: false, refusal: 'unknown-piece' }
  if (!isReversible(definition)) return { ok: false, refusal: 'cannot-flip' }
  const next = [...chain]
  next[index] = { entryId: current.entryId, pieceId: current.pieceId, flipped: current.flipped !== true }
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
