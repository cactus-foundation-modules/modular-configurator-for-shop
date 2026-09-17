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
  canBeFrontSpur,
  canBeTurned,
  canHostFrontSpur,
  footprintAt,
  isReversible,
  layoutIsClosed,
  layoutPieceCount,
  mainChainOf,
  piecesOverlap,
  placeChain,
  placeFrontSpur,
  placeLayout,
  type ChainEnd,
  type ChainEntry,
  type FrontSpur,
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
  /** Only a curve or wedge with no back can be turned the other way round. */
  | 'cannot-flip'
  /** Only a straight unit with no back can be turned a quarter. */
  | 'cannot-turn'
  /** The new piece's arm or end panel would face into the layout. */
  | 'piece-closed-on-joining-side'
  /** The piece would sit on top of another. */
  | 'would-overlap'
  /** The layout is at its size limit. */
  | 'too-many-pieces'
  /** Two neighbours would meet arm to seat. */
  | 'neighbours-cannot-join'
  /** This range does not stand units in front of one another. */
  | 'front-units-not-offered'
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
  /** Laid the other way round to fit (a curve or wedge with no back), so its outline is drawn that way. */
  flipped: boolean
  refusal: EditRefusal | null
}

export interface ChainLimits {
  maxPieces: number
  /**
   * Whether this range stands a backless unit in front of a backed one. Off
   * (the default) in a range that has both kinds of straight unit but does not
   * mean them to stack that way, so the shape of the range alone never decides
   * it. Every path that could put one there reads this: the spaces offered, the
   * edits themselves, and the check a whole chain is put through.
   */
  frontUnits?: boolean
}

/**
 * A space a new unit can go in, as one string the view islands can pass around:
 * an open end of the chain, or the floor in front of a backed unit
 * (`front:<host entry id>`) where a backless one can stand.
 */
export type SpaceKey = ChainEnd | `front:${string}`

export type LayoutSpace = { kind: 'end'; end: ChainEnd } | { kind: 'front'; hostEntryId: string }

const FRONT_SPACE_PREFIX = 'front:'

export function frontSpaceKey(hostEntryId: string): SpaceKey {
  return `${FRONT_SPACE_PREFIX}${hostEntryId}`
}

export function isSpaceKey(value: unknown): value is SpaceKey {
  return value === 'start' || value === 'end' || (typeof value === 'string' && value.startsWith(FRONT_SPACE_PREFIX) && value.length > FRONT_SPACE_PREFIX.length)
}

export function spaceOfKey(key: SpaceKey): LayoutSpace {
  return key === 'start' || key === 'end' ? { kind: 'end', end: key } : { kind: 'front', hostEntryId: key.slice(FRONT_SPACE_PREFIX.length) }
}

/** One unit of a layout written down rather than built: a ready-made layout's, say. */
export interface LayoutUnitSpec {
  pieceId: string
  /** A backless unit stood in front of this one. */
  frontPieceId?: string
  /** This backless unit turned a quarter. */
  turned?: boolean
  /** This unit with no back (a curve or wedge) laid the other way round. */
  flipped?: boolean
}

/** The chain a written-down layout describes, with entry ids made from `idPrefix`. */
export function chainFromUnits(units: readonly LayoutUnitSpec[], idPrefix: string): ChainEntry[] {
  return units.map((unit, index) => ({
    entryId: `${idPrefix}${index}`,
    pieceId: unit.pieceId,
    ...(unit.flipped ? { flipped: true } : {}),
    ...(unit.turned ? { turned: true } : {}),
    ...(unit.frontPieceId ? { frontSpur: { entryId: `${idPrefix}${index}-front`, pieceId: unit.frontPieceId } } : {}),
  }))
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
  if (layoutPieceCount(chain) > limits.maxPieces) return 'too-many-pieces'
  let previous: PieceDefinition | null = null
  for (const entry of chain) {
    const definition = definitions.get(entry.pieceId)
    if (!definition) return 'unknown-piece'
    if (previous && !canJoin(previous, definition)) return 'neighbours-cannot-join'
    if (entry.turned && !canBeTurned(definition)) return 'cannot-turn'
    if (entry.frontSpur) {
      if (limits.frontUnits !== true) return 'front-units-not-offered'
      const spurDefinition = definitions.get(entry.frontSpur.pieceId)
      if (!spurDefinition) return 'unknown-piece'
      if (!canHostFrontSpur(definition) || !canBeFrontSpur(spurDefinition)) return 'would-overlap'
    }
    previous = definition
  }
  const placed = placeLayout(chain, definitions)
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
  // Front spurs ride on their hosts; only the main chain has ends to add to.
  const chain = mainChainOf(placed)
  const byId = new Map([...placed.map((piece) => piece.definition), ...definitions].map((definition) => [definition.pieceId, definition]))
  const plan = endPlan(chain, end, byId)
  const closed = isClosedChain(chain, byId)
  return definitions.map((definition) => {
    if (!plan) {
      const refusal = closed ? 'layout-is-closed' : 'end-is-closed'
      return { definition, pose: ORIGIN_POSE, footprint: footprintAt(definition, ORIGIN_POSE), flipped: false, refusal }
    }
    const trials = waysToLay({ entryId: PROBE_ENTRY_ID, pieceId: definition.pieceId }, byId).map((probe) => {
      const trialChain = insertedAt(chain, plan.insertAt, probe)
      return { trialChain, problem: refusalForAddition(findChainProblem(trialChain, byId, limits)) }
    })
    const fitting = trials.find((candidate) => candidate.problem === null) ?? trials[0]
    const trial = fitting?.trialChain ?? chain
    const refusal = layoutPieceCount(chain) >= limits.maxPieces ? 'too-many-pieces' : (fitting?.problem ?? null)
    const trialPlaced = anchorLayout(placeChain(trial, byId), placed, plan.displacedEntryId)
    const marker = trialPlaced.find((piece) => piece.entry.entryId === PROBE_ENTRY_ID)
    const pose = marker?.pose ?? ORIGIN_POSE
    const flipped = marker?.entry.flipped === true
    return { definition, pose, footprint: marker?.footprint ?? footprintAt(definition, pose, flipped), flipped, refusal }
  })
}

const ORIGIN_POSE: PiecePose = { centre: { x: 0, z: 0 }, rotationY: 0 }

/**
 * Every backless type offered in front of one backed straight unit, each drawn
 * where it would stand and refused where it cannot (the layout is full, or it
 * would sit on another unit). Empty when the unit cannot take one at all: the
 * range does not stand units in front of one another, it has a unit in front
 * already, it is not a backed straight, or the range has no backless straight
 * to offer.
 */
export function candidatesInFront(
  placed: readonly PlacedPiece[],
  hostEntryId: string,
  definitions: readonly PieceDefinition[],
  limits: ChainLimits,
): EndCandidate[] {
  if (limits.frontUnits !== true) return []
  const host = placed.find((piece) => piece.entry.entryId === hostEntryId)
  if (!host || host.entry.frontSpur || !canHostFrontSpur(host.definition)) return []
  const chain = mainChainOf(placed)
  const byId = new Map([...placed.map((piece) => piece.definition), ...definitions].map((definition) => [definition.pieceId, definition]))
  return definitions.filter(canBeFrontSpur).map((definition) => {
    const spur = { entryId: PROBE_ENTRY_ID, pieceId: definition.pieceId }
    const result = addFrontSpur(chain, hostEntryId, spur, byId, limits)
    const marker = placeFrontSpur(host, spur, definition)
    return { definition, pose: marker.pose, footprint: marker.footprint, flipped: false, refusal: result.ok ? null : result.refusal }
  })
}

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
  if (layoutPieceCount(chain) >= limits.maxPieces) return { ok: false, refusal: 'too-many-pieces' }
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
  const spurHost = chain.find((entry) => entry.frontSpur?.entryId === entryId)
  if (spurHost) {
    const next = chain.map((entry) =>
      entry.entryId === spurHost.entryId ? { entryId: entry.entryId, pieceId: entry.pieceId, flipped: entry.flipped } : entry,
    )
    return checked(next, definitions, limits)
  }
  const index = chain.findIndex((entry) => entry.entryId === entryId)
  if (index === -1) return { ok: false, refusal: 'unknown-entry' }
  return checked(
    chain.filter((entry) => entry.entryId !== entryId),
    definitions,
    limits,
  )
}

/** Puts a backless unit on the front edge of a backed straight module. */
export function addFrontSpur(
  chain: readonly ChainEntry[],
  hostEntryId: string,
  spur: FrontSpur,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  if (limits.frontUnits !== true) return { ok: false, refusal: 'front-units-not-offered' }
  if (layoutPieceCount(chain) >= limits.maxPieces) return { ok: false, refusal: 'too-many-pieces' }
  const host = chain.find((entry) => entry.entryId === hostEntryId)
  if (!host) return { ok: false, refusal: 'unknown-entry' }
  if (host.frontSpur) return { ok: false, refusal: 'would-overlap' }
  const hostDefinition = definitions.get(host.pieceId)
  const spurDefinition = definitions.get(spur.pieceId)
  if (!hostDefinition || !spurDefinition) return { ok: false, refusal: 'unknown-piece' }
  if (!canHostFrontSpur(hostDefinition) || !canBeFrontSpur(spurDefinition)) return { ok: false, refusal: 'would-overlap' }
  const next = chain.map((entry) => (entry.entryId === hostEntryId ? { ...entry, frontSpur: spur } : entry))
  return checked(next, definitions, limits)
}

/** Backless piece types that may sit in front of this host. */
export function frontSpurOptions(
  chain: readonly ChainEntry[],
  hostEntryId: string,
  definitions: readonly PieceDefinition[],
  limits: ChainLimits,
): PieceDefinition[] {
  const host = chain.find((entry) => entry.entryId === hostEntryId)
  const hostDefinition = host ? definitions.find((definition) => definition.pieceId === host.pieceId) : undefined
  if (!host?.frontSpur && host && hostDefinition && canHostFrontSpur(hostDefinition)) {
    return definitions.filter(
      (definition) =>
        canBeFrontSpur(definition) &&
        addFrontSpur(
          chain,
          hostEntryId,
          { entryId: `${hostEntryId}:probe`, pieceId: definition.pieceId },
          new Map(definitions.map((d) => [d.pieceId, d])),
          limits,
        ).ok,
    )
  }
  return []
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
    const replacementDefinition = definitions.get(laid.pieceId)
    const carried = next[index]?.frontSpur
    next[index] =
      carried && replacementDefinition && canHostFrontSpur(replacementDefinition)
        ? { ...laid, frontSpur: carried }
        : laid
    const result = checked(next, definitions, limits)
    if (result.ok) return result
    firstRefusal ??= result
  }
  return firstRefusal ?? { ok: false, refusal: 'unknown-piece' }
}

/** Lays a reversible unit (a curve or wedge with no back) the other way round. */
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

/** Turns a backless straight unit a quarter, or back again. */
export function turnEntry(
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
  if (!canBeTurned(definition)) return { ok: false, refusal: 'cannot-turn' }
  const { turned: _wasTurned, ...rest } = current
  const next = [...chain]
  next[index] = current.turned ? rest : { ...rest, turned: true }
  return checked(next, definitions, limits)
}

/**
 * Whether to offer turning this unit a quarter. Only where it is the answer to
 * something: a backless unit that is not square, beside a corner, where lying
 * along the run after the corner leaves it square-on to the row before it. One
 * already turned can always be turned back. Never offered where the turn would
 * not fit.
 */
export function turnIsOffered(
  chain: readonly ChainEntry[],
  entryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): boolean {
  const index = chain.findIndex((entry) => entry.entryId === entryId)
  const current = chain[index]
  const definition = current ? definitions.get(current.pieceId) : undefined
  if (!current || !definition || !canBeTurned(definition)) return false
  if (!current.turned) {
    if (definition.widthMm === definition.depthMm) return false
    const besideCorner = [chain[index - 1], chain[index + 1]].some((neighbour) => neighbour && definitions.get(neighbour.pieceId)?.shape.kind === 'corner')
    if (!besideCorner) return false
  }
  return turnEntry(chain, entryId, definitions, limits).ok
}

/** Host entry when `entryId` is a front spur; null for main-chain entries. */
export function hostEntryIdForSpur(chain: readonly ChainEntry[], spurEntryId: string): string | null {
  const host = chain.find((entry) => entry.frontSpur?.entryId === spurEntryId)
  return host?.entryId ?? null
}

/** Piece types a front spur could be swapped for. */
export function swapSpurOptions(
  chain: readonly ChainEntry[],
  spurEntryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): PieceDefinition[] {
  const hostId = hostEntryIdForSpur(chain, spurEntryId)
  if (!hostId) return []
  const host = chain.find((entry) => entry.entryId === hostId)
  const currentId = host?.frontSpur?.pieceId
  if (!currentId) return []
  return [...definitions.values()].filter(
    (definition) =>
      definition.pieceId !== currentId &&
      replaceFrontSpur(chain, hostId, definition.pieceId, definitions, limits).ok,
  )
}

/** Swaps the piece type of a front spur on its host. */
export function replaceFrontSpur(
  chain: readonly ChainEntry[],
  hostEntryId: string,
  pieceId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): EditResult {
  const host = chain.find((entry) => entry.entryId === hostEntryId)
  if (!host?.frontSpur) return { ok: false, refusal: 'unknown-entry' }
  return addFrontSpur(
    chain.map((entry) => (entry.entryId === hostEntryId ? { entryId: entry.entryId, pieceId: entry.pieceId, flipped: entry.flipped } : entry)),
    hostEntryId,
    { entryId: host.frontSpur.entryId, pieceId },
    definitions,
    limits,
  )
}

/** Piece types the given entry could be swapped for without breaking the layout. */
export function swapOptions(
  chain: readonly ChainEntry[],
  entryId: string,
  definitions: ReadonlyMap<string, PieceDefinition>,
  limits: ChainLimits,
): PieceDefinition[] {
  const spurHost = hostEntryIdForSpur(chain, entryId)
  if (spurHost) return swapSpurOptions(chain, entryId, definitions, limits)
  const current = chain.find((entry) => entry.entryId === entryId)
  if (!current) return []
  return [...definitions.values()].filter(
    (definition) =>
      definition.pieceId !== current.pieceId &&
      replaceEntry(chain, entryId, { entryId: `${entryId}:probe`, pieceId: definition.pieceId }, definitions, limits).ok,
  )
}
