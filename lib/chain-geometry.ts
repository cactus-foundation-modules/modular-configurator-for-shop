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
 *
 * A curve is a quarter of a ring, `widthMm` square (its outer radius), whose
 * two cut ends are its faces, each `seatDepthMm` long. With its back on the
 * OUTSIDE of the ring the seats face in and the chain turns towards their
 * front, like a corner; with its back on the INSIDE they face out and the chain
 * turns the other way. A curve with no back can be laid either way round: the
 * entry's `flipped` says it is laid the inside way.
 *   back outside -> ring centre at (-w/2, +w/2): enter left, leave front
 *   back inside  -> ring centre at (-w/2, -w/2): enter left, leave back
 *
 * A half curve is half a ring, `widthMm` wide (its outer diameter) and `depthMm`
 * deep (its outer radius). Both cut ends lie on its straight side, one each end,
 * with the hole between them, so it sends the chain back the way it came. Laid
 * the outside way the straight side is its front and the rows it joins face each
 * other across the hole (the seats face in); laid the inside way the straight
 * side is its back and the rows sit back to back with the hole between them.
 *   back outside -> ring centre at (0, +d/2): enter left end, leave right end, both facing +z
 *   back inside  -> ring centre at (0, -d/2): enter left end, leave right end, both facing -z
 * Like a quarter curve, one with no back is laid the inside way when flipped.
 *
 * A rounded end joins the end of one row to the end of the row behind it, back
 * to back: its flat side (`widthMm`) runs along z = -depth/2 and is two faces
 * sharing their back corner in its middle. Walking in through the left half and
 * out of the right half turns the chain right round.
 */

/** A 2D point or direction on the floor plane, in millimetres. */
export interface FloorVector {
  x: number
  z: number
}

/** Which side of a corner carries its second backrest, seen from its front. */
export type CornerBackSide = 'left' | 'right'

/** Where a curved unit carries its backrest, if it has one. */
export type CurveBack = 'outside' | 'inside' | 'none'

/** How one piece joins its neighbours. */
export type PieceShape =
  | {
      kind: 'straight'
      /** An arm or end panel on the left: nothing can join before this piece. */
      closedLeft: boolean
      /** An arm or end panel on the right: nothing can join after this piece. */
      closedRight: boolean
      /** No backrest at all. Joins exactly like a backed unit; drawn without one. */
      backless?: boolean
    }
  | {
      kind: 'corner'
      backSide: CornerBackSide
    }
  | {
      kind: 'curve'
      back: CurveBack
      /** Length of each cut end, from the back of the seat to its front. */
      seatDepthMm: number
    }
  | {
      kind: 'half-curve'
      back: CurveBack
      /** Length of each cut end, from the back of the seat to its front. */
      seatDepthMm: number
    }
  | {
      kind: 'round-end'
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
  /** A reversible piece (a curve or half curve with no back) laid the other way round. */
  flipped?: boolean
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

/** True for a piece that can be laid either way round (a curve or half curve with no back). */
export function isReversible(definition: PieceDefinition): boolean {
  const { shape } = definition
  return (shape.kind === 'curve' || shape.kind === 'half-curve') && shape.back === 'none'
}

/** Which way round a curve is laid: a backless one follows its entry's flip. */
export function curveLayOf(back: CurveBack, flipped: boolean | undefined): 'outside' | 'inside' {
  if (back === 'none') return flipped ? 'inside' : 'outside'
  return back
}

/** Centre of a curve's ring in its own frame, for the way round it is laid. */
export function curveCentre(widthMm: number, lay: 'outside' | 'inside'): FloorVector {
  return { x: -widthMm / 2, z: lay === 'outside' ? widthMm / 2 : -widthMm / 2 }
}

function curveEntryFace(widthMm: number, seatDepthMm: number, lay: 'outside' | 'inside'): JoinFace {
  const innerRadius = widthMm - seatDepthMm
  return lay === 'outside'
    ? { backCorner: { x: -widthMm / 2, z: -widthMm / 2 }, outward: { x: -1, z: 0 }, towardsFront: { x: 0, z: 1 } }
    : { backCorner: { x: -widthMm / 2, z: -widthMm / 2 + innerRadius }, outward: { x: -1, z: 0 }, towardsFront: { x: 0, z: 1 } }
}

function curveExitFace(widthMm: number, seatDepthMm: number, lay: 'outside' | 'inside'): JoinFace {
  const innerRadius = widthMm - seatDepthMm
  return lay === 'outside'
    ? { backCorner: { x: widthMm / 2, z: widthMm / 2 }, outward: { x: 0, z: 1 }, towardsFront: { x: -1, z: 0 } }
    : { backCorner: { x: -widthMm / 2 + innerRadius, z: -widthMm / 2 }, outward: { x: 0, z: -1 }, towardsFront: { x: 1, z: 0 } }
}

/** Centre of a half curve's ring in its own frame: the middle of its straight side. */
export function halfCurveCentre(depthMm: number, lay: 'outside' | 'inside'): FloorVector {
  return { x: 0, z: lay === 'outside' ? depthMm / 2 : -depthMm / 2 }
}

/**
 * One cut end of a half curve, on its straight side. The back corner is the end
 * of the cut nearest the backrest: its outer end laid the outside way, its inner
 * end laid the inside way.
 */
function halfCurveFace(widthMm: number, depthMm: number, seatDepthMm: number, lay: 'outside' | 'inside', side: 'left' | 'right'): JoinFace {
  const outerRadius = widthMm / 2
  const innerRadius = outerRadius - seatDepthMm
  const sign = side === 'left' ? -1 : 1
  if (lay === 'outside') {
    return { backCorner: { x: sign * outerRadius, z: depthMm / 2 }, outward: { x: 0, z: 1 }, towardsFront: { x: -sign, z: 0 } }
  }
  return { backCorner: { x: sign * innerRadius, z: -depthMm / 2 }, outward: { x: 0, z: -1 }, towardsFront: { x: sign, z: 0 } }
}

/** One half of a rounded end's flat side; both halves meet in its middle. */
function roundEndFace(depthMm: number, towardsLeft: boolean): JoinFace {
  return { backCorner: { x: 0, z: -depthMm / 2 }, outward: { x: 0, z: -1 }, towardsFront: { x: towardsLeft ? -1 : 1, z: 0 } }
}

/** The face a piece is joined through, in its own frame. */
function entryFaceOf(definition: PieceDefinition, flipped: boolean | undefined): JoinFace {
  const { shape, widthMm, depthMm } = definition
  switch (shape.kind) {
    case 'straight':
      return leftFace(widthMm, depthMm)
    case 'corner':
      return shape.backSide === 'left' ? cornerFrontFace(widthMm, depthMm, 'left') : leftFace(widthMm, depthMm)
    case 'curve':
      return curveEntryFace(widthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped))
    case 'half-curve':
      return halfCurveFace(widthMm, depthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped), 'left')
    case 'round-end':
      return roundEndFace(depthMm, true)
  }
}

/** The face the next piece joins, in the piece's own frame. */
function exitFaceOf(definition: PieceDefinition, flipped: boolean | undefined): JoinFace {
  const { shape, widthMm, depthMm } = definition
  switch (shape.kind) {
    case 'straight':
      return rightFace(widthMm, depthMm)
    case 'corner':
      return shape.backSide === 'left' ? rightFace(widthMm, depthMm) : cornerFrontFace(widthMm, depthMm, 'right')
    case 'curve':
      return curveExitFace(widthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped))
    case 'half-curve':
      return halfCurveFace(widthMm, depthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped), 'right')
    case 'round-end':
      return roundEndFace(depthMm, false)
  }
}

/** True when something may join before this piece. */
export function acceptsJoinBefore(definition: PieceDefinition): boolean {
  return definition.shape.kind !== 'straight' || !definition.shape.closedLeft
}

/** True when something may join after this piece. */
export function acceptsJoinAfter(definition: PieceDefinition): boolean {
  return definition.shape.kind !== 'straight' || !definition.shape.closedRight
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
function poseJoinedAfter(previousExit: JoinFace, definition: PieceDefinition, flipped: boolean | undefined): PiecePose {
  const entry = entryFaceOf(definition, flipped)
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
      ? poseJoinedAfter(previousExit, definition, entry.flipped)
      : { centre: { x: 0, z: 0 }, rotationY: 0 }
    placed.push({ entry, definition, pose, footprint: footprintAt(definition, pose) })
    previousExit = transformFace(exitFaceOf(definition, entry.flipped), pose)
  }
  return placed
}

function sameFloorPoint(first: FloorVector, second: FloorVector): boolean {
  return Math.abs(first.x - second.x) <= OVERLAP_TOLERANCE_MM && Math.abs(first.z - second.z) <= OVERLAP_TOLERANCE_MM
}

function sameDirection(first: FloorVector, second: FloorVector): boolean {
  return Math.abs(first.x - second.x) < 0.001 && Math.abs(first.z - second.z) < 0.001
}

/**
 * True when the layout joins up all the way round - a ring of curves, a capsule
 * of two rounded ends - so its last piece's exit face lies against its first
 * piece's entry face and neither end has anywhere left to add to.
 */
export function layoutIsClosed(placed: readonly PlacedPiece[]): boolean {
  const first = placed[0]
  const last = placed[placed.length - 1]
  if (!first || !last || placed.length < 2) return false
  const entry = transformFace(entryFaceOf(first.definition, first.entry.flipped), first.pose)
  const exit = transformFace(exitFaceOf(last.definition, last.entry.flipped), last.pose)
  return (
    sameFloorPoint(entry.backCorner, exit.backCorner) &&
    sameDirection(entry.outward, { x: -exit.outward.x, z: -exit.outward.z }) &&
    sameDirection(entry.towardsFront, exit.towardsFront)
  )
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

/** Straight sides each quarter of a curve or half curve, or half of a rounded end, is drawn with. */
const ARC_SEGMENTS = 12

/** The direction a share `share` (0..1) of the way round a quarter turn from `from` to `to`. */
function quarterWay(from: FloorVector, to: FloorVector, share: number): FloorVector {
  const angle = (share * Math.PI) / 2
  return { x: from.x * Math.cos(angle) + to.x * Math.sin(angle), z: from.z * Math.cos(angle) + to.z * Math.sin(angle) }
}

/**
 * A piece's floor shape, in its own frame, as convex polygons that together
 * cover it: one rectangle for a straight or corner unit, thin wedges round a
 * curve or half curve, a fan across a rounded end. Arcs are drawn with short straight sides,
 * which cut inside the true outline by a millimetre or two at most.
 */
function outlineOf(definition: PieceDefinition, flipped: boolean | undefined): FloorVector[][] {
  const { shape, widthMm: width, depthMm: depth } = definition
  const steps = Array.from({ length: ARC_SEGMENTS + 1 }, (_, index) => index / ARC_SEGMENTS)
  switch (shape.kind) {
    case 'straight':
    case 'corner':
      return [[{ x: -width / 2, z: -depth / 2 }, { x: width / 2, z: -depth / 2 }, { x: width / 2, z: depth / 2 }, { x: -width / 2, z: depth / 2 }]]
    case 'curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centre = curveCentre(width, lay)
      // From the entry face round to the exit face, as in curveEntryFace/curveExitFace.
      const from = lay === 'outside' ? { x: 0, z: -1 } : { x: 0, z: 1 }
      const to = { x: 1, z: 0 }
      const inner = width - shape.seatDepthMm
      const at = (radius: number, direction: FloorVector) => ({ x: centre.x + radius * direction.x, z: centre.z + radius * direction.z })
      return steps.slice(1).map((share, index) => {
        const start = quarterWay(from, to, steps[index] ?? 0)
        const end = quarterWay(from, to, share)
        return [at(inner, start), at(width, start), at(width, end), at(inner, end)]
      })
    }
    case 'half-curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centre = halfCurveCentre(depth, lay)
      const outer = width / 2
      const inner = outer - shape.seatDepthMm
      // From the left cut end round through the far side of the ring to the right one.
      const left = { x: -1, z: 0 }
      const far = lay === 'outside' ? { x: 0, z: -1 } : { x: 0, z: 1 }
      const right = { x: 1, z: 0 }
      const at = (radius: number, direction: FloorVector) => ({ x: centre.x + radius * direction.x, z: centre.z + radius * direction.z })
      const quarters: ReadonlyArray<readonly [FloorVector, FloorVector]> = [[left, far], [far, right]]
      return quarters.flatMap(([from, to]) =>
        steps.slice(1).map((share, index) => {
          const start = quarterWay(from, to, steps[index] ?? 0)
          const end = quarterWay(from, to, share)
          return [at(inner, start), at(outer, start), at(outer, end), at(inner, end)]
        }),
      )
    }
    case 'round-end': {
      const middle = { x: 0, z: -depth / 2 }
      const rim = (share: number) => ({ x: (width / 2) * Math.cos(share * Math.PI), z: -depth / 2 + depth * Math.sin(share * Math.PI) })
      return steps.slice(1).map((share, index) => [middle, rim(steps[index] ?? 0), rim(share)])
    }
  }
}

/** Each convex polygon's corners, on the floor where the piece is placed. */
export function floorOutline(piece: PlacedPiece): FloorVector[][] {
  return outlineOf(piece.definition, piece.entry.flipped).map((polygon) => polygon.map((corner) => pointOnPiece(piece.pose, corner)))
}

function projectedSpan(polygon: readonly FloorVector[], axis: FloorVector): [number, number] {
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const corner of polygon) {
    const along = corner.x * axis.x + corner.z * axis.z
    low = Math.min(low, along)
    high = Math.max(high, along)
  }
  return [low, high]
}

/** Separating axis test for two convex polygons; touching along an edge is not overlapping. */
function convexPolygonsOverlap(first: readonly FloorVector[], second: readonly FloorVector[]): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index]
      const end = polygon[(index + 1) % polygon.length]
      if (!start || !end) continue
      const length = Math.hypot(end.x - start.x, end.z - start.z)
      if (length === 0) continue
      const axis = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length }
      const [firstLow, firstHigh] = projectedSpan(first, axis)
      const [secondLow, secondHigh] = projectedSpan(second, axis)
      if (firstHigh - OVERLAP_TOLERANCE_MM <= secondLow || secondHigh - OVERLAP_TOLERANCE_MM <= firstLow) return false
    }
  }
  return true
}

/**
 * True when two placed pieces really sit on top of each other. Their footprint
 * rectangles are only the first check: a curve's square is mostly empty, and
 * a unit tucked into that emptiness is not in the way of anything.
 */
export function piecesOverlap(first: PlacedPiece, second: PlacedPiece): boolean {
  if (!footprintsOverlap(first.footprint, second.footprint)) return false
  const firstOutline = floorOutline(first)
  const secondOutline = floorOutline(second)
  return firstOutline.some((polygon) => secondOutline.some((other) => convexPolygonsOverlap(polygon, other)))
}

export function footprintsOverlap(first: FloorRectangle, second: FloorRectangle): boolean {
  return (
    first.minX < second.maxX - OVERLAP_TOLERANCE_MM &&
    second.minX < first.maxX - OVERLAP_TOLERANCE_MM &&
    first.minZ < second.maxZ - OVERLAP_TOLERANCE_MM &&
    second.minZ < first.maxZ - OVERLAP_TOLERANCE_MM
  )
}
