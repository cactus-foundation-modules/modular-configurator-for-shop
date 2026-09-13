/**
 * Chain geometry for modular layouts.
 *
 * Pattern: pure "turtle walk" over an ordered chain of pieces. A layout is an
 * ordered list of pieces; each piece has one ENTRY face and one EXIT face in
 * its own frame, and the walk glues every piece's entry face onto the previous
 * piece's exit face. No three.js, no DOM, no I/O - the same function places
 * units in the 3D view, draws the plan and validates a basket.
 *
 * Piece frame (millimetres, looking down from above):
 *   x -> the shopper's right when facing the piece's front
 *   z -> towards the shopper (the seat's front edge is at +depth/2)
 *   the backrest runs along z = -depth/2
 *
 * Walking the chain from first to last is walking each straight run from its
 * left end to its right end, as seen from the front of the seats. So a piece
 * closed on its left (an arm on the left) can only open a chain, and one
 * closed on its right can only close it.
 *
 * A corner has a second backrest down one side. Its two open faces are the
 * other side and the front, and which of the two is the entry is fixed by
 * that side:
 *   second back on the LEFT  -> enter through the front, leave through the right
 *   second back on the RIGHT -> enter through the left, leave through the front
 * Both turn the chain the same way (towards the seats' front), so one corner
 * product builds an L either way round, and the units after it always land
 * against the corner's open side with their backs in line with its backs.
 */

/** A 2D point or direction on the floor plane, in millimetres. */
export interface FloorVector {
  x: number
  z: number
}

/** Which side of a corner carries its second backrest, seen from its front. */
export type CornerBackSide = 'left' | 'right'

/** How one piece joins its neighbours. */
export type PieceShape =
  | {
      kind: 'straight'
      /** An arm or end panel on the left: nothing can join before this piece. */
      closedLeft: boolean
      /** An arm or end panel on the right: nothing can join after this piece. */
      closedRight: boolean
    }
  | {
      kind: 'corner'
      backSide: CornerBackSide
    }

/** Everything the walk needs to know about one kind of piece. */
export interface PieceDefinition {
  /** Stable id of the piece type (the variation option value id). */
  pieceId: string
  shape: PieceShape
  /** Footprint across the piece's front, in millimetres. */
  widthMm: number
  /** Footprint from back to front, in millimetres. */
  depthMm: number
}

/** One placed piece of a layout, as the shopper built it. */
export interface ChainEntry {
  /** Unique within the layout; survives reordering so animations can track it. */
  entryId: string
  pieceId: string
}

/** Where one piece sits on the floor. `rotationY` matches three.js `rotation.y`. */
export interface PiecePose {
  centre: FloorVector
  rotationY: number
}

/** One face of a piece that can join another, in some frame. */
interface JoinFace {
  /** The end of the face nearest the backrest. Joins line these points up. */
  backCorner: FloorVector
  /** Unit vector pointing out of the piece through this face. */
  outward: FloorVector
  /** Unit vector along the face, from its back end towards its front end. */
  towardsFront: FloorVector
}

/** Axis-aligned footprint rectangle on the floor. */
export interface FloorRectangle {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface PlacedPiece {
  entry: ChainEntry
  definition: PieceDefinition
  pose: PiecePose
  footprint: FloorRectangle
}

/** Which open end of the chain a new piece would join. */
export type ChainEnd = 'start' | 'end'

export class UnknownPieceError extends Error {
  constructor(pieceId: string) {
    super(`No piece definition for "${pieceId}"`)
    this.name = 'UnknownPieceError'
  }
}

const RIGHT_ANGLE = Math.PI / 2
/** Footprints touching along an edge share it; only real overlap counts. */
const OVERLAP_TOLERANCE_MM = 1

/** Rotates a floor vector the way three.js `rotation.y` does. */
function rotateOnFloor(vector: FloorVector, angle: number): FloorVector {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: roundMillimetre(vector.x * cosine + vector.z * sine),
    z: roundMillimetre(-vector.x * sine + vector.z * cosine),
  }
}

/** Kills floating-point dust so 90 degree turns land on whole numbers. */
function roundMillimetre(value: number): number {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

/** Heading of a direction in the same sense `rotateOnFloor` turns. */
function headingOf(direction: FloorVector): number {
  return Math.atan2(-direction.z, direction.x)
}

/** Snaps an angle to the nearest quarter turn, in (-PI, PI]. */
function snapToQuarterTurn(angle: number): number {
  const quarterTurns = Math.round(angle / RIGHT_ANGLE)
  let snapped = quarterTurns * RIGHT_ANGLE
  while (snapped <= -Math.PI) snapped += 2 * Math.PI
  while (snapped > Math.PI) snapped -= 2 * Math.PI
  return snapped
}

function leftFace(widthMm: number, depthMm: number): JoinFace {
  return {
    backCorner: { x: -widthMm / 2, z: -depthMm / 2 },
    outward: { x: -1, z: 0 },
    towardsFront: { x: 0, z: 1 },
  }
}

function rightFace(widthMm: number, depthMm: number): JoinFace {
  return {
    backCorner: { x: widthMm / 2, z: -depthMm / 2 },
    outward: { x: 1, z: 0 },
    towardsFront: { x: 0, z: 1 },
  }
}

/** A corner's front face, whose back end is the side carrying the second backrest. */
function cornerFrontFace(widthMm: number, depthMm: number, backSide: CornerBackSide): JoinFace {
  return backSide === 'left'
    ? { backCorner: { x: -widthMm / 2, z: depthMm / 2 }, outward: { x: 0, z: 1 }, towardsFront: { x: 1, z: 0 } }
    : { backCorner: { x: widthMm / 2, z: depthMm / 2 }, outward: { x: 0, z: 1 }, towardsFront: { x: -1, z: 0 } }
}

/** The face a piece is joined through, in its own frame. */
function entryFaceOf(definition: PieceDefinition): JoinFace {
  const { shape, widthMm, depthMm } = definition
  if (shape.kind === 'straight') return leftFace(widthMm, depthMm)
  return shape.backSide === 'left' ? cornerFrontFace(widthMm, depthMm, 'left') : leftFace(widthMm, depthMm)
}

/** The face the next piece joins, in the piece's own frame. */
function exitFaceOf(definition: PieceDefinition): JoinFace {
  const { shape, widthMm, depthMm } = definition
  if (shape.kind === 'straight') return rightFace(widthMm, depthMm)
  return shape.backSide === 'left' ? rightFace(widthMm, depthMm) : cornerFrontFace(widthMm, depthMm, 'right')
}

/** True when something may join before this piece. */
export function acceptsJoinBefore(definition: PieceDefinition): boolean {
  return definition.shape.kind === 'corner' || !definition.shape.closedLeft
}

/** True when something may join after this piece. */
export function acceptsJoinAfter(definition: PieceDefinition): boolean {
  return definition.shape.kind === 'corner' || !definition.shape.closedRight
}

function transformFace(face: JoinFace, pose: PiecePose): JoinFace {
  const rotatedCorner = rotateOnFloor(face.backCorner, pose.rotationY)
  return {
    backCorner: {
      x: roundMillimetre(rotatedCorner.x + pose.centre.x),
      z: roundMillimetre(rotatedCorner.z + pose.centre.z),
    },
    outward: rotateOnFloor(face.outward, pose.rotationY),
    towardsFront: rotateOnFloor(face.towardsFront, pose.rotationY),
  }
}

/**
 * Pose that glues `definition`'s entry face onto `previousExit` (world frame):
 * faces back to back, back ends touching, fronts running the same way.
 */
function poseJoinedAfter(previousExit: JoinFace, definition: PieceDefinition): PiecePose {
  const entry = entryFaceOf(definition)
  const facingBack = { x: -previousExit.outward.x, z: -previousExit.outward.z }
  const rotationY = snapToQuarterTurn(headingOf(facingBack) - headingOf(entry.outward))
  const rotatedCorner = rotateOnFloor(entry.backCorner, rotationY)
  return {
    centre: {
      x: roundMillimetre(previousExit.backCorner.x - rotatedCorner.x),
      z: roundMillimetre(previousExit.backCorner.z - rotatedCorner.z),
    },
    rotationY,
  }
}

export function footprintAt(definition: PieceDefinition, pose: PiecePose): FloorRectangle {
  const halfWidth = definition.widthMm / 2
  const halfDepth = definition.depthMm / 2
  const corners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ].map((corner) => rotateOnFloor(corner, pose.rotationY))
  return {
    minX: roundMillimetre(Math.min(...corners.map((corner) => corner.x)) + pose.centre.x),
    maxX: roundMillimetre(Math.max(...corners.map((corner) => corner.x)) + pose.centre.x),
    minZ: roundMillimetre(Math.min(...corners.map((corner) => corner.z)) + pose.centre.z),
    maxZ: roundMillimetre(Math.max(...corners.map((corner) => corner.z)) + pose.centre.z),
  }
}

/**
 * Walks a chain and places every piece. The first piece sits at the origin
 * facing +z; callers that want a stable world use `anchorLayout`.
 */
export function placeChain(
  chain: readonly ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): PlacedPiece[] {
  const placed: PlacedPiece[] = []
  let previousExit: JoinFace | null = null
  for (const entry of chain) {
    const definition = definitions.get(entry.pieceId)
    if (!definition) throw new UnknownPieceError(entry.pieceId)
    const pose: PiecePose = previousExit
      ? poseJoinedAfter(previousExit, definition)
      : { centre: { x: 0, z: 0 }, rotationY: 0 }
    placed.push({ entry, definition, pose, footprint: footprintAt(definition, pose) })
    previousExit = transformFace(exitFaceOf(definition), pose)
  }
  return placed
}

/**
 * Moves a freshly placed chain so the pieces the shopper already had stay
 * exactly where they were. The anchor is the first piece of the previous
 * layout that is still in the new one; with no survivor the chain is left at
 * the origin. Without this, adding a unit before the first piece would swing
 * the whole layout round under the shopper's eyes. A piece the edit deliberately
 * moved (an arm unit making room inside it) is never the anchor.
 */
export function anchorLayout(
  placedNow: readonly PlacedPiece[],
  placedBefore: readonly PlacedPiece[],
  movedEntryId: string | null = null,
): PlacedPiece[] {
  const nowByEntryId = new Map(placedNow.map((piece) => [piece.entry.entryId, piece]))
  const anchorBefore = placedBefore.find((piece) => piece.entry.entryId !== movedEntryId && nowByEntryId.has(piece.entry.entryId))
  const anchorNow = anchorBefore ? nowByEntryId.get(anchorBefore.entry.entryId) : undefined
  if (!anchorBefore || !anchorNow) return [...placedNow]
  const turn = snapToQuarterTurn(anchorBefore.pose.rotationY - anchorNow.pose.rotationY)
  const turnedAnchorCentre = rotateOnFloor(anchorNow.pose.centre, turn)
  const shift = {
    x: anchorBefore.pose.centre.x - turnedAnchorCentre.x,
    z: anchorBefore.pose.centre.z - turnedAnchorCentre.z,
  }
  return placedNow.map((piece) => {
    const turnedCentre = rotateOnFloor(piece.pose.centre, turn)
    const pose: PiecePose = {
      centre: { x: roundMillimetre(turnedCentre.x + shift.x), z: roundMillimetre(turnedCentre.z + shift.z) },
      rotationY: snapToQuarterTurn(piece.pose.rotationY + turn),
    }
    return { ...piece, pose, footprint: footprintAt(piece.definition, pose) }
  })
}

/** Overall floor rectangle of a layout, or null when it is empty. */
export function layoutBounds(placed: readonly PlacedPiece[]): FloorRectangle | null {
  if (placed.length === 0) return null
  return {
    minX: Math.min(...placed.map((piece) => piece.footprint.minX)),
    maxX: Math.max(...placed.map((piece) => piece.footprint.maxX)),
    minZ: Math.min(...placed.map((piece) => piece.footprint.minZ)),
    maxZ: Math.max(...placed.map((piece) => piece.footprint.maxZ)),
  }
}

/** A point given in a piece's own frame, on the floor. */
export function pointOnPiece(pose: PiecePose, local: FloorVector): FloorVector {
  const rotated = rotateOnFloor(local, pose.rotationY)
  return { x: roundMillimetre(rotated.x + pose.centre.x), z: roundMillimetre(rotated.z + pose.centre.z) }
}

export function footprintsOverlap(first: FloorRectangle, second: FloorRectangle): boolean {
  return (
    first.minX < second.maxX - OVERLAP_TOLERANCE_MM &&
    second.minX < first.maxX - OVERLAP_TOLERANCE_MM &&
    first.minZ < second.maxZ - OVERLAP_TOLERANCE_MM &&
    second.minZ < first.maxZ - OVERLAP_TOLERANCE_MM
  )
}
