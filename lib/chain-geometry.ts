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
 *
 * A backless straight unit can be TURNED a quarter: the walk then goes in through
 * its back and out through its front instead of its sides, and a join either
 * side of it lines up the middles of the two faces. Out of a corner, that stands
 * the unit square to the row before the corner rather than along the row after it.
 *
 * A wedge is a straight-sided slice of a ring: flat back, flat front, and two
 * cut sides that splay apart by `angleDegrees`, so every wedge turns the row by
 * its angle (twelve 30 degree wedges make a full circle). `widthMm` is its wide
 * side, `depthMm` back to front, and the cut sides are its faces. With its back
 * OUTSIDE the wide side is its back and the seats face in, turning the chain
 * towards their front like a corner; with its back INSIDE the narrow side is its
 * back, the seats face out and the chain turns away. One with no back is laid
 * the inside way when flipped. Unlike a curve it can carry an arm on either cut
 * side, which closes that side the way a straight unit's arm does.
 *   back outside -> back corners at (-w/2, -d/2) and (w/2, -d/2)
 *   back inside  -> back corners at (-w/2 + t, -d/2) and (w/2 - t, -d/2), t = d tan(angle / 2)
 *
 * Every turn is exact to a millionth of a degree rather than snapped to a
 * quarter, so a ring of wedges closes on itself however many it takes.
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
      /** No backrest. Side joins align seat fronts, not backs, so a shallower
       *  module sits flush with its neighbours' fronts rather than its rear edge. */
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
  | {
      kind: 'segment'
      back: CurveBack
      /** How far apart its cut sides splay, which is how far it turns the row. */
      angleDegrees: number
      /** An arm on the left cut side: nothing can join before this piece. */
      closedLeft: boolean
      /** An arm on the right cut side: nothing can join after this piece. */
      closedRight: boolean
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

/** A backless module on the front edge of a backed straight unit (a cube / ottoman). */
export interface FrontSpur {
  entryId: string
  pieceId: string
}

/** One placed piece of a layout, as the shopper built it. */
export interface ChainEntry {
  /** Unique within the layout; survives reordering so animations can track it. */
  entryId: string
  pieceId: string
  /** A reversible piece (a curve, half curve or wedge with no back) laid the other way round. */
  flipped?: boolean
  /** Backless unit in front of this one's seat (backed straights only). */
  frontSpur?: FrontSpur
  /** A backless straight unit turned a quarter, joined through its back and front. */
  turned?: boolean
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
/** Turns are kept to this many steps per degree: fine enough for any wedge, coarse enough to kill floating-point dust. */
const TURN_STEPS_PER_DEGREE = 1_000_000

/** Rotates a floor point the way three.js `rotation.y` does, to the thousandth of a millimetre. */
function rotateOnFloor(vector: FloorVector, angle: number): FloorVector {
  const turned = turnDirection(vector, angle)
  return { x: roundMillimetre(turned.x), z: roundMillimetre(turned.z) }
}

/**
 * Rotates a direction the way three.js `rotation.y` does, unrounded: a wedge's
 * sides lean at angles a thousandth-rounded unit vector would bend by a
 * twentieth of a degree, and twelve of those would not close a circle.
 */
function turnDirection(vector: FloorVector, angle: number): FloorVector {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return { x: vector.x * cosine + vector.z * sine, z: -vector.x * sine + vector.z * cosine }
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

/**
 * Snaps an angle to the nearest millionth of a degree, in (-PI, PI]. Quarter
 * turns land exactly on multiples of PI / 2, as they always have, and a wedge's
 * turn lands exactly on its angle.
 */
function snapTurn(angle: number): number {
  // Wrapped in degrees, before the one conversion: adding 2 PI afterwards would put the dust straight back.
  let degrees = Math.round((angle * 180 * TURN_STEPS_PER_DEGREE) / Math.PI) / TURN_STEPS_PER_DEGREE
  degrees %= 360
  if (degrees <= -180) degrees += 360
  if (degrees > 180) degrees -= 360
  return (degrees * Math.PI) / 180
}

/** True for a rotation that is a whole number of quarter turns. */
function isQuarterTurn(angle: number): boolean {
  return Math.abs(angle / RIGHT_ANGLE - Math.round(angle / RIGHT_ANGLE)) < 1e-9
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

/** True for a piece that can be laid either way round (a curve, half curve or wedge with no back). */
export function isReversible(definition: PieceDefinition): boolean {
  const { shape } = definition
  return (shape.kind === 'curve' || shape.kind === 'half-curve' || shape.kind === 'segment') && shape.back === 'none'
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

/** Half a wedge's angle, in radians: how far each cut side leans in from square. */
export function segmentHalfAngle(angleDegrees: number): number {
  return (angleDegrees * Math.PI) / 360
}

/**
 * How far each cut side of a wedge comes in across its depth: its wide side less
 * its narrow side, halved.
 */
export function segmentInset(depthMm: number, angleDegrees: number): number {
  return depthMm * Math.tan(segmentHalfAngle(angleDegrees))
}

/**
 * One cut side of a wedge, walked from its back corner to its front. Laid the
 * outside way the back corners are the wide side's ends; the inside way, the
 * narrow side's.
 */
function segmentFace(widthMm: number, depthMm: number, angleDegrees: number, lay: 'outside' | 'inside', side: 'left' | 'right'): JoinFace {
  const half = segmentHalfAngle(angleDegrees)
  const sine = Math.sin(half)
  const cosine = Math.cos(half)
  const sign = side === 'left' ? -1 : 1
  if (lay === 'outside') {
    return { backCorner: { x: (sign * widthMm) / 2, z: -depthMm / 2 }, outward: { x: sign * cosine, z: sine }, towardsFront: { x: -sign * sine, z: cosine } }
  }
  const inset = segmentInset(depthMm, angleDegrees)
  return {
    backCorner: { x: sign * (widthMm / 2 - inset), z: -depthMm / 2 },
    outward: { x: sign * cosine, z: -sine },
    towardsFront: { x: sign * sine, z: cosine },
  }
}

/** A wedge's floor shape, in its own frame: back corners first, left to right, then the front ones right to left. */
export function segmentCorners(widthMm: number, depthMm: number, angleDegrees: number, lay: 'outside' | 'inside'): FloorVector[] {
  const inset = segmentInset(depthMm, angleDegrees)
  const back = lay === 'outside' ? widthMm / 2 : widthMm / 2 - inset
  const front = lay === 'outside' ? widthMm / 2 - inset : widthMm / 2
  return [
    { x: -back, z: -depthMm / 2 },
    { x: back, z: -depthMm / 2 },
    { x: front, z: depthMm / 2 },
    { x: -front, z: depthMm / 2 },
  ]
}

/** One half of a rounded end's flat side; both halves meet in its middle. */
function roundEndFace(depthMm: number, towardsLeft: boolean): JoinFace {
  return { backCorner: { x: 0, z: -depthMm / 2 }, outward: { x: 0, z: -1 }, towardsFront: { x: towardsLeft ? -1 : 1, z: 0 } }
}

/** How an entry is laid, as far as its faces care. */
type EntryLay = Pick<ChainEntry, 'flipped' | 'turned'>

/** True for a backless straight unit laid turned a quarter. */
export function isTurned(definition: PieceDefinition, lay: EntryLay): boolean {
  return lay.turned === true && canBeTurned(definition)
}

/** True for a piece that can be turned a quarter: a straight unit with no back. */
export function canBeTurned(definition: PieceDefinition): boolean {
  return isStraightBackless(definition)
}

/**
 * The back or front of a turned unit, walked from back to front. Its back
 * corner is taken at +x so the face runs the way a side face would if the whole
 * unit were turned a quarter with the walk.
 */
function turnedFace(widthMm: number, depthMm: number, side: 'back' | 'front'): JoinFace {
  const z = side === 'back' ? -depthMm / 2 : depthMm / 2
  return { backCorner: { x: widthMm / 2, z }, outward: { x: 0, z: side === 'back' ? -1 : 1 }, towardsFront: { x: -1, z: 0 } }
}

/** The face a piece is joined through, in its own frame. */
function entryFaceOf(definition: PieceDefinition, lay: EntryLay): JoinFace {
  const { shape, widthMm, depthMm } = definition
  const { flipped } = lay
  switch (shape.kind) {
    case 'straight':
      return isTurned(definition, lay) ? turnedFace(widthMm, depthMm, 'back') : leftFace(widthMm, depthMm)
    case 'corner':
      return shape.backSide === 'left' ? cornerFrontFace(widthMm, depthMm, 'left') : leftFace(widthMm, depthMm)
    case 'curve':
      return curveEntryFace(widthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped))
    case 'half-curve':
      return halfCurveFace(widthMm, depthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped), 'left')
    case 'round-end':
      return roundEndFace(depthMm, true)
    case 'segment':
      return segmentFace(widthMm, depthMm, shape.angleDegrees, curveLayOf(shape.back, flipped), 'left')
  }
}

/** The face the next piece joins, in the piece's own frame. */
function exitFaceOf(definition: PieceDefinition, lay: EntryLay): JoinFace {
  const { shape, widthMm, depthMm } = definition
  const { flipped } = lay
  switch (shape.kind) {
    case 'straight':
      return isTurned(definition, lay) ? turnedFace(widthMm, depthMm, 'front') : rightFace(widthMm, depthMm)
    case 'corner':
      return shape.backSide === 'left' ? rightFace(widthMm, depthMm) : cornerFrontFace(widthMm, depthMm, 'right')
    case 'curve':
      return curveExitFace(widthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped))
    case 'half-curve':
      return halfCurveFace(widthMm, depthMm, shape.seatDepthMm, curveLayOf(shape.back, flipped), 'right')
    case 'round-end':
      return roundEndFace(depthMm, false)
    case 'segment':
      return segmentFace(widthMm, depthMm, shape.angleDegrees, curveLayOf(shape.back, flipped), 'right')
  }
}

/** True when something may join before this piece. */
export function acceptsJoinBefore(definition: PieceDefinition): boolean {
  const { shape } = definition
  return (shape.kind !== 'straight' && shape.kind !== 'segment') || !shape.closedLeft
}

/** True when something may join after this piece. */
export function acceptsJoinAfter(definition: PieceDefinition): boolean {
  const { shape } = definition
  return (shape.kind !== 'straight' && shape.kind !== 'segment') || !shape.closedRight
}

function isStraightBackless(definition: PieceDefinition): boolean {
  return definition.shape.kind === 'straight' && definition.shape.backless === true
}

/** Which points of two joining faces are lined up. */
type JoinAnchor = 'back' | 'front' | 'middle'

/**
 * A join beside a turned unit lines up the middles of the faces. Otherwise, when
 * a backless straight module joins a backed straight or a corner, seat fronts
 * align. Backless-to-backless stays back-aligned; curves and rounded ends still
 * meet on the back edge.
 */
function joinAnchorFor(previous: PlacedPiece, next: PieceDefinition, nextLay: EntryLay): JoinAnchor {
  if (isTurned(previous.definition, previous.entry) || isTurned(next, nextLay)) return 'middle'
  const prevBackless = isStraightBackless(previous.definition)
  const nextBackless = isStraightBackless(next)
  if (prevBackless === nextBackless) return 'back'
  const seatFrontJoin = (piece: PieceDefinition) => piece.shape.kind === 'straight' || piece.shape.kind === 'corner'
  return seatFrontJoin(previous.definition) && seatFrontJoin(next) ? 'front' : 'back'
}

/**
 * How long a face is. A straight's or corner's side face runs its depth and a
 * face across it (a corner's front, a turned unit's back or front) its width; a
 * curve's cut end is its seat; a rounded end's face is half its flat side; a
 * wedge's cut side leans across its depth.
 */
function faceLength(face: JoinFace, definition: PieceDefinition): number {
  const { shape } = definition
  if (shape.kind === 'curve' || shape.kind === 'half-curve') return shape.seatDepthMm
  if (shape.kind === 'round-end') return definition.widthMm / 2
  if (shape.kind === 'segment') return definition.depthMm / Math.cos(segmentHalfAngle(shape.angleDegrees))
  return Math.abs(face.towardsFront.x) > 0.5 ? definition.widthMm : definition.depthMm
}

/** A point `share` of the way along a face from its back corner towards its front end. */
function alongFace(face: JoinFace, definition: PieceDefinition, share: number): FloorVector {
  const distance = faceLength(face, definition) * share
  return {
    x: roundMillimetre(face.backCorner.x + face.towardsFront.x * distance),
    z: roundMillimetre(face.backCorner.z + face.towardsFront.z * distance),
  }
}

/**
 * The point on a face that meets the neighbour's, in the piece's own frame. A
 * seat-front join lines up the front ends of the two faces, so the shallower
 * backless unit sits flush with its neighbour's front - along a straight run,
 * and against either open side of a corner, whichever way that side faces. A
 * join beside a turned unit lines up the middles.
 */
function joinAnchorLocal(face: JoinFace, definition: PieceDefinition, anchor: JoinAnchor): FloorVector {
  if (anchor === 'front') return alongFace(face, definition, 1)
  if (anchor === 'middle') return alongFace(face, definition, 0.5)
  return face.backCorner
}

function joinAnchorWorld(
  localFace: JoinFace,
  definition: PieceDefinition,
  pose: PiecePose,
  anchor: JoinAnchor,
): FloorVector {
  const local = joinAnchorLocal(localFace, definition, anchor)
  const rotated = rotateOnFloor(local, pose.rotationY)
  return {
    x: roundMillimetre(rotated.x + pose.centre.x),
    z: roundMillimetre(rotated.z + pose.centre.z),
  }
}

function transformFace(face: JoinFace, pose: PiecePose): JoinFace {
  const rotatedCorner = rotateOnFloor(face.backCorner, pose.rotationY)
  return {
    backCorner: {
      x: roundMillimetre(rotatedCorner.x + pose.centre.x),
      z: roundMillimetre(rotatedCorner.z + pose.centre.z),
    },
    outward: turnDirection(face.outward, pose.rotationY),
    towardsFront: turnDirection(face.towardsFront, pose.rotationY),
  }
}

/**
 * Pose that glues `definition`'s entry face onto `previousExit` (world frame):
 * faces back to back, back ends touching (front ends, for a seat-front join),
 * fronts running the same way.
 */
function poseJoinedAfter(previous: PlacedPiece, definition: PieceDefinition, lay: EntryLay): PiecePose {
  const previousLocalExit = exitFaceOf(previous.definition, previous.entry)
  const previousExit = transformFace(previousLocalExit, previous.pose)
  const anchor = joinAnchorFor(previous, definition, lay)
  const entry = entryFaceOf(definition, lay)
  const previousAnchor = joinAnchorWorld(previousLocalExit, previous.definition, previous.pose, anchor)
  const entryAnchor = joinAnchorLocal(entry, definition, anchor)
  const facingBack = { x: -previousExit.outward.x, z: -previousExit.outward.z }
  const rotationY = snapTurn(headingOf(facingBack) - headingOf(entry.outward))
  const rotatedAnchor = rotateOnFloor(entryAnchor, rotationY)
  const centre: FloorVector = {
    x: roundMillimetre(previousAnchor.x - rotatedAnchor.x),
    z: roundMillimetre(previousAnchor.z - rotatedAnchor.z),
  }
  return { centre, rotationY }
}

/**
 * The floor rectangle a placed piece covers. Square to the room, that is the
 * piece's own width and depth, as it always was; turned at any other angle
 * (beside a wedge), it is taken round the piece's real outline rather than its
 * turned box, so the layout's overall size is the floor it really takes. A wedge
 * is always measured round its outline, which depends on which way it is laid.
 */
export function footprintAt(definition: PieceDefinition, pose: PiecePose, flipped?: boolean): FloorRectangle {
  const halfWidth = definition.widthMm / 2
  const halfDepth = definition.depthMm / 2
  const box = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ]
  const local = definition.shape.kind !== 'segment' && isQuarterTurn(pose.rotationY) ? box : outlineOf(definition, flipped).flat()
  const corners = local.map((corner) => rotateOnFloor(corner, pose.rotationY))
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
  for (const entry of chain) {
    const definition = definitions.get(entry.pieceId)
    if (!definition) throw new UnknownPieceError(entry.pieceId)
    const previous = placed[placed.length - 1]
    const pose: PiecePose = previous
      ? poseJoinedAfter(previous, definition, entry)
      : { centre: { x: 0, z: 0 }, rotationY: 0 }
    placed.push({ entry, definition, pose, footprint: footprintAt(definition, pose, entry.flipped) })
  }
  return placed
}

export function canHostFrontSpur(definition: PieceDefinition): boolean {
  return definition.shape.kind === 'straight' && definition.shape.backless !== true
}

export function canBeFrontSpur(definition: PieceDefinition): boolean {
  return definition.shape.kind === 'straight' && definition.shape.backless === true
}

/** Chain units plus any front spurs (for size limits and pricing). */
export function layoutPieceCount(chain: readonly ChainEntry[]): number {
  return chain.length + chain.filter((entry) => entry.frontSpur).length
}

function spurEntryIds(chain: readonly ChainEntry[]): Set<string> {
  return new Set(chain.flatMap((entry) => (entry.frontSpur ? [entry.frontSpur.entryId] : [])))
}

/** Where a backless unit sits in front of its host: level with the host's width, its back on the host's seat front. */
export function placeFrontSpur(host: PlacedPiece, spur: FrontSpur, definition: PieceDefinition): PlacedPiece {
  const offset = rotateOnFloor(
    { x: 0, z: host.definition.depthMm / 2 + definition.depthMm / 2 },
    host.pose.rotationY,
  )
  const pose: PiecePose = {
    centre: {
      x: roundMillimetre(host.pose.centre.x + offset.x),
      z: roundMillimetre(host.pose.centre.z + offset.z),
    },
    rotationY: host.pose.rotationY,
  }
  return {
    entry: { entryId: spur.entryId, pieceId: spur.pieceId },
    definition,
    pose,
    footprint: footprintAt(definition, pose),
  }
}

/** Main chain plus any front spurs, each spur straight after its host (the list's order). */
export function placeLayout(
  chain: readonly ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): PlacedPiece[] {
  return placeLayoutFromMain(placeChain(chain, definitions), definitions)
}

/** The main chain of a placed layout: every piece that is not a front spur on another. */
export function mainChainOf(placed: readonly PlacedPiece[]): ChainEntry[] {
  const spurIds = new Set(placed.flatMap((piece) => (piece.entry.frontSpur ? [piece.entry.frontSpur.entryId] : [])))
  return placed.filter((piece) => !spurIds.has(piece.entry.entryId)).map((piece) => piece.entry)
}

/** Re-anchors the chain, then re-attaches front spurs to their hosts. */
export function commitPlacement(
  chain: readonly ChainEntry[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  placedBefore: readonly PlacedPiece[],
  movedEntryId: string | null = null,
): PlacedPiece[] {
  const spurIds = spurEntryIds(chain)
  const mainBefore = placedBefore.filter((piece) => !spurIds.has(piece.entry.entryId))
  const anchoredMain = anchorLayout(placeChain(chain, definitions), mainBefore, movedEntryId)
  const mainById = new Map(anchoredMain.map((piece) => [piece.entry.entryId, piece]))
  const mergedMain = placeChain(chain, definitions).map((piece) => mainById.get(piece.entry.entryId) ?? piece)
  return placeLayoutFromMain(mergedMain, definitions)
}

/** Each placed main piece followed by the front spur it carries, if any. */
function placeLayoutFromMain(main: readonly PlacedPiece[], definitions: ReadonlyMap<string, PieceDefinition>): PlacedPiece[] {
  return main.flatMap((host) => {
    const spur = host.entry.frontSpur
    const definition = spur ? definitions.get(spur.pieceId) : undefined
    return spur && definition ? [host, placeFrontSpur(host, spur, definition)] : [host]
  })
}

/** Every unit that prices and ships, in list order (hosts then their spurs). */
export function layoutEntriesExpanded(chain: readonly ChainEntry[]): ChainEntry[] {
  const expanded: ChainEntry[] = []
  for (const entry of chain) {
    expanded.push(entry)
    if (entry.frontSpur) expanded.push({ entryId: entry.frontSpur.entryId, pieceId: entry.frontSpur.pieceId })
  }
  return expanded
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
  const entry = transformFace(entryFaceOf(first.definition, first.entry), first.pose)
  const exit = transformFace(exitFaceOf(last.definition, last.entry), last.pose)
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
  const turn = snapTurn(anchorBefore.pose.rotationY - anchorNow.pose.rotationY)
  const turnedAnchorCentre = rotateOnFloor(anchorNow.pose.centre, turn)
  const shift = {
    x: anchorBefore.pose.centre.x - turnedAnchorCentre.x,
    z: anchorBefore.pose.centre.z - turnedAnchorCentre.z,
  }
  return placedNow.map((piece) => {
    const turnedCentre = rotateOnFloor(piece.pose.centre, turn)
    const pose: PiecePose = {
      centre: { x: roundMillimetre(turnedCentre.x + shift.x), z: roundMillimetre(turnedCentre.z + shift.z) },
      rotationY: snapTurn(piece.pose.rotationY + turn),
    }
    return { ...piece, pose, footprint: footprintAt(piece.definition, pose, piece.entry.flipped) }
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

/** The middle of a floor outline (the average of its corners), where a label on it sits. */
export function outlineMiddle(outline: readonly FloorVector[]): FloorVector {
  if (outline.length === 0) return { x: 0, z: 0 }
  return {
    x: outline.reduce((sum, corner) => sum + corner.x, 0) / outline.length,
    z: outline.reduce((sum, corner) => sum + corner.z, 0) / outline.length,
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
 * cover it: one rectangle for a straight or corner unit, one four-sided shape for
 * a wedge, thin slices round a curve or half curve, a fan across a rounded end.
 * Arcs are drawn with short straight sides, which cut inside the true outline by
 * a millimetre or two at most.
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
    case 'segment':
      return [segmentCorners(width, depth, shape.angleDegrees, curveLayOf(shape.back, flipped))]
  }
}

/** Each convex polygon's corners, on the floor where the piece is placed. */
export function floorOutline(piece: PlacedPiece): FloorVector[][] {
  return outlineOf(piece.definition, piece.entry.flipped).map((polygon) => polygon.map((corner) => pointOnPiece(piece.pose, corner)))
}

/**
 * The one outline a piece's space is drawn with on the floor - the dashed "+"
 * space, the highlight under a chosen unit: a wedge's own four sides, and for
 * every other piece its box, turned as the piece is. Square to the room that box
 * is exactly the rectangle these were always drawn as.
 */
export function floorBoundary(definition: PieceDefinition, pose: PiecePose, flipped?: boolean): FloorVector[] {
  const { shape, widthMm: width, depthMm: depth } = definition
  const local =
    shape.kind === 'segment'
      ? segmentCorners(width, depth, shape.angleDegrees, curveLayOf(shape.back, flipped))
      : [{ x: -width / 2, z: -depth / 2 }, { x: width / 2, z: -depth / 2 }, { x: width / 2, z: depth / 2 }, { x: -width / 2, z: depth / 2 }]
  return local.map((corner) => pointOnPiece(pose, corner))
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
