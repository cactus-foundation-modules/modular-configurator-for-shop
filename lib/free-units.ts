/**
 * Units that stand on their own: an armchair, a coffee table, a stool, put
 * anywhere on the floor round the layout rather than joined into it.
 *
 * Pattern: pure functions over plain data, like chain-geometry beside it. A
 * free unit is not in the chain at all - it has no neighbours, joins nothing
 * and is never walked - so it carries its own place on the floor, in the same
 * world the placed chain is anchored in. The one rule it keeps is the chain's
 * own: nothing may sit on top of anything else, judged by the same real
 * outlines (piecesOverlap).
 *
 * The chain always wins. An edit to the layout that grows it into a free unit
 * is not refused - the free unit is moved out of the way (settleFreeUnits), as
 * a shopper would move a coffee table to make room for another seat.
 */
import {
  footprintAt,
  layoutBounds,
  piecesOverlap,
  type ChainEntry,
  type FloorVector,
  type PieceDefinition,
  type PiecePose,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { ChainLimits } from '@/modules/modular-configurator-for-shop/lib/chain-editing'

/** One unit standing on its own, where the shopper put it. */
export interface FreeUnit {
  entryId: string
  pieceId: string
  /** Where its middle stands on the floor, in millimetres. */
  centre: FloorVector
  /** Which way it faces; matches three.js `rotation.y`, as a placed piece's does. */
  rotationY: number
}

/** A free unit as the layout code carries it: in the frame of the chain's first unit. */
export interface FreeUnitSpot {
  x: number
  z: number
  /** Degrees, to the hundredth. */
  turnDegrees: number
}

/** The limits a chain edit works to: the layout's, less the room the free units already take. */
export function chainLimitsBeside(free: readonly FreeUnit[], limits: ChainLimits): ChainLimits {
  return { ...limits, maxPieces: limits.maxPieces - free.length }
}

/** How far one "Turn it" turns a free unit. */
export const FREE_TURN = Math.PI / 4
/** Where a free unit is dropped is kept to this many millimetres. */
const SNAP_MM = 10
/** The gap left between a new free unit and whatever it is put beside. */
const PLACING_GAP_MM = 450
/** How far a free unit in the way of the layout is moved at a time while it is pushed clear. */
const PUSH_STEP_MM = 50
const PUSH_STEPS = 400

/**
 * Whether a unit makes sense on its own: a straight unit with no back (a table,
 * a stool, a cube), or one closed at both sides (an armchair). A unit open at a
 * side is half of something and only ever joins a layout.
 */
export function canStandFree(definition: PieceDefinition): boolean {
  const { shape } = definition
  return shape.kind === 'straight' && (shape.backless === true || (shape.closedLeft && shape.closedRight))
}

function snap(value: number): number {
  return Math.round(value / SNAP_MM) * SNAP_MM
}

export function snapFloorPoint(point: FloorVector): FloorVector {
  return { x: snap(point.x), z: snap(point.z) }
}

/** A whole number of turns taken off, so the same facing is always the same number. */
function tidyTurn(angle: number): number {
  const full = Math.PI * 2
  const wrapped = ((angle % full) + full) % full
  // A hair short of a whole turn, from rounding along the way, is a whole turn.
  if (full - wrapped < 1e-5) return 0
  return Math.round(wrapped * 1e6) / 1e6
}

export function freeUnitPose(unit: Pick<FreeUnit, 'centre' | 'rotationY'>): PiecePose {
  return { centre: unit.centre, rotationY: unit.rotationY }
}

/** The chain entry a free unit prices, ships and is listed as. */
export function freeUnitEntry(unit: FreeUnit): ChainEntry {
  return { entryId: unit.entryId, pieceId: unit.pieceId }
}

export function placeFreeUnit(unit: FreeUnit, definition: PieceDefinition): PlacedPiece {
  const pose = freeUnitPose(unit)
  return { entry: freeUnitEntry(unit), definition, pose, footprint: footprintAt(definition, pose) }
}

/** Every free unit placed, leaving out any whose unit type has been withdrawn. */
export function placeFreeUnits(free: readonly FreeUnit[], definitions: ReadonlyMap<string, PieceDefinition>): PlacedPiece[] {
  return free.flatMap((unit) => {
    const definition = definitions.get(unit.pieceId)
    return definition ? [placeFreeUnit(unit, definition)] : []
  })
}

function clearOf(piece: PlacedPiece, others: readonly PlacedPiece[]): boolean {
  return !others.some((other) => other.entry.entryId !== piece.entry.entryId && piecesOverlap(piece, other))
}

/**
 * Whether a placed unit could stand at `centre` (facing as it does, unless
 * `rotationY` is given) without sitting on anything else in `placed`.
 */
export function fitsAt(placed: readonly PlacedPiece[], entryId: string, centre: FloorVector, rotationY?: number): boolean {
  const piece = placed.find((candidate) => candidate.entry.entryId === entryId)
  if (!piece) return false
  const pose: PiecePose = { centre, rotationY: rotationY ?? piece.pose.rotationY }
  return clearOf({ ...piece, pose, footprint: footprintAt(piece.definition, pose) }, placed)
}

/**
 * Somewhere clear for a new free unit: in front of everything already on the
 * floor, a comfortable gap away and square to the room, working outwards
 * along that line and then further forward until it fits. Where a coffee table
 * would usually go, and never on top of anything.
 */
export function spotForFreeUnit(
  definition: PieceDefinition,
  entryId: string,
  placed: readonly PlacedPiece[],
): FloorVector {
  const bounds = layoutBounds(placed)
  if (!bounds) return { x: 0, z: 0 }
  const middleX = (bounds.minX + bounds.maxX) / 2
  const stepX = definition.widthMm + PLACING_GAP_MM
  const stepZ = definition.depthMm + PLACING_GAP_MM
  const entry = { entryId, pieceId: definition.pieceId }
  for (let row = 0; row < 6; row += 1) {
    const z = bounds.maxZ + PLACING_GAP_MM + definition.depthMm / 2 + row * stepZ
    for (let step = 0; step < 13; step += 1) {
      // 0, +1, -1, +2, -2 ... steps either side of the middle.
      const offset = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 === 1 ? 1 : -1)
      const centre = snapFloorPoint({ x: middleX + offset * stepX, z })
      const pose: PiecePose = { centre, rotationY: 0 }
      if (clearOf({ entry, definition, pose, footprint: footprintAt(definition, pose) }, placed)) return centre
    }
  }
  return snapFloorPoint({ x: middleX, z: bounds.maxZ + PLACING_GAP_MM + definition.depthMm / 2 + 6 * stepZ })
}

/**
 * The free units with any that the layout now sits on moved clear of it, each
 * straight out from the middle of the layout until it stands on nothing. Those
 * already clear stay exactly where they are.
 */
export function settleFreeUnits(
  layout: readonly PlacedPiece[],
  free: readonly FreeUnit[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): FreeUnit[] {
  const bounds = layoutBounds(layout)
  const middle = bounds ? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } : { x: 0, z: 0 }
  const settled: PlacedPiece[] = []
  let moved = false
  const result = free.map((unit) => {
    const definition = definitions.get(unit.pieceId)
    if (!definition) return unit
    const others = [...layout, ...settled]
    let piece = placeFreeUnit(unit, definition)
    if (clearOf(piece, others)) {
      settled.push(piece)
      return unit
    }
    const away = { x: unit.centre.x - middle.x, z: unit.centre.z - middle.z }
    const length = Math.hypot(away.x, away.z)
    const direction = length > 1 ? { x: away.x / length, z: away.z / length } : { x: 0, z: 1 }
    let centre = unit.centre
    for (let step = 1; step <= PUSH_STEPS; step += 1) {
      centre = snapFloorPoint({ x: unit.centre.x + direction.x * PUSH_STEP_MM * step, z: unit.centre.z + direction.z * PUSH_STEP_MM * step })
      piece = placeFreeUnit({ ...unit, centre }, definition)
      if (clearOf(piece, others)) break
    }
    settled.push(piece)
    moved = true
    return { ...unit, centre }
  })
  return moved ? result : [...free]
}

/** The same unit turned one step further round. */
export function turnedFreeUnit(unit: FreeUnit): FreeUnit {
  return { ...unit, rotationY: tidyTurn(unit.rotationY + FREE_TURN) }
}

/**
 * A free unit written in the frame of the chain's first unit, which is where a
 * layout read back from its code starts out (at the middle, facing forward) -
 * so a link reopens with every free unit where it was beside the layout,
 * however the layout had been turned while it was built. With no chain, the
 * frame is the floor's own.
 */
export function freeUnitSpot(unit: FreeUnit, anchor: PiecePose | null): FreeUnitSpot {
  const origin = anchor ?? { centre: { x: 0, z: 0 }, rotationY: 0 }
  const dx = unit.centre.x - origin.centre.x
  const dz = unit.centre.z - origin.centre.z
  // The inverse of three's rotation.y (see chain-geometry's rotateOnFloor).
  const cos = Math.cos(-origin.rotationY)
  const sin = Math.sin(-origin.rotationY)
  const turnDegrees = (tidyTurn(unit.rotationY - origin.rotationY) * 180) / Math.PI
  // `+ 0` turns a rounded -0 into 0, so the same spot always writes the same code.
  return {
    x: Math.round(dx * cos + dz * sin) + 0,
    z: Math.round(-dx * sin + dz * cos) + 0,
    turnDegrees: Math.round(turnDegrees * 100) / 100 + 0,
  }
}

/** Where a free unit read back from a code stands, in a chain laid from the origin. */
export function freeUnitFromSpot(entryId: string, pieceId: string, spot: FreeUnitSpot): FreeUnit {
  return { entryId, pieceId, centre: { x: spot.x, z: spot.z }, rotationY: tidyTurn((spot.turnDegrees * Math.PI) / 180) }
}
