// Which way round a unit's 3D model has to be turned to be the unit its set-up
// describes.
//
// Supplier model files are drawn facing whichever way the exporting program
// happened to face: one range's files can disagree with each other, and two back
// heights of the same unit can disagree too. A single turn typed in per unit
// cannot be right for both, so the builder works the turn out from the model.
//
// Pattern: template matching over a top-down height map. The model is drawn
// from above onto a coarse grid (its top surface over each cell). The set-up's
// shape says what that map should look like in the unit's own frame - where the
// floor is covered (a rectangle, a quarter ring, a half disc) and where the tall
// parts are (backrests, arms). Each of the four quarter turns is scored on how
// well the turned model matches: footprint proportions, covered area, and tall
// parts in the right places. Pure - no three.js - so it is tested directly and
// the browser only has to hand it triangles.
import { curveCentre, curveLayOf, halfCurveCentre, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

/**
 * The stored model turn meaning "work it out from each file". Declared here, not
 * beside the set-up schema, so the storefront's 3D code can compare against it
 * without bringing the schema library into the shopper's browser.
 */
export const AUTOMATIC_MODEL_TURN = 'auto'

/** A model's top surface seen from above, in the model's own units and frame. */
export interface HeightGrid {
  columns: number
  rows: number
  minX: number
  minZ: number
  /** The model's own extent across x and z; the cells may run a little past it. */
  spanX: number
  spanZ: number
  /** Side of one square cell. */
  cellSize: number
  /** Lowest point of the model: the floor it stands on. */
  floorY: number
  /** Highest surface over each cell (row * columns + column), NaN where the floor shows. */
  tops: Float32Array
}

export interface ModelBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/** Receives one triangle's three corners, in the frame the bounds were measured in. */
export type TriangleVisitor = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
) => void

/** Cells along the model's longer side. Enough to see a backrest, cheap to fill. */
const GRID_CELLS = 64
/** Samples along each side of the unit when comparing it to its shape. */
const TEMPLATE_SAMPLES = 40

/**
 * Draws a model's triangles from above onto a grid over its bounds. Each cell
 * keeps the highest surface over its centre.
 */
export function rasteriseTops(bounds: ModelBounds, eachTriangle: (visit: TriangleVisitor) => void): HeightGrid {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1e-6)
  const cellSize = Math.max(spanX, spanZ) / GRID_CELLS
  const columns = Math.max(1, Math.ceil(spanX / cellSize))
  const rows = Math.max(1, Math.ceil(spanZ / cellSize))
  const tops = new Float32Array(columns * rows).fill(Number.NaN)

  eachTriangle((ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const doubleArea = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
    // Standing on edge when seen from above: a wall, not a surface.
    if (Math.abs(doubleArea) < 1e-12) return
    const firstColumn = Math.max(0, Math.floor((Math.min(ax, bx, cx) - bounds.minX) / cellSize - 0.5))
    const lastColumn = Math.min(columns - 1, Math.ceil((Math.max(ax, bx, cx) - bounds.minX) / cellSize - 0.5))
    const firstRow = Math.max(0, Math.floor((Math.min(az, bz, cz) - bounds.minZ) / cellSize - 0.5))
    const lastRow = Math.min(rows - 1, Math.ceil((Math.max(az, bz, cz) - bounds.minZ) / cellSize - 0.5))
    for (let row = firstRow; row <= lastRow; row += 1) {
      const pz = bounds.minZ + (row + 0.5) * cellSize
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const px = bounds.minX + (column + 0.5) * cellSize
        const weightA = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / doubleArea
        const weightB = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / doubleArea
        const weightC = 1 - weightA - weightB
        if (weightA < -1e-6 || weightB < -1e-6 || weightC < -1e-6) continue
        const height = weightA * ay + weightB * by + weightC * cy
        const index = row * columns + column
        const current = tops[index] ?? Number.NaN
        if (Number.isNaN(current) || height > current) tops[index] = height
      }
    }
  })

  return { columns, rows, minX: bounds.minX, minZ: bounds.minZ, spanX, spanZ, cellSize, floorY: bounds.minY, tops }
}

/** What the unit's shape says one point of its footprint should be. */
interface TemplatePoint {
  covered: boolean
  /** A backrest or arm should stand here. */
  tall: boolean
}

/** Share of a unit's depth a backrest is expected to take up. */
const BACK_SHARE = 0.22
/** Share of a unit's width an arm or end panel is expected to take up. */
const ARM_SHARE = 0.18
/** Share of a curve's seat depth its backrest is expected to take up. */
const CURVE_BACK_SHARE = 0.25

/** The shape's picture of itself at one point (millimetres, unit frame). */
function templateAt(definition: PieceDefinition, flipped: boolean, x: number, z: number): TemplatePoint {
  const { shape, widthMm: width, depthMm: depth } = definition
  switch (shape.kind) {
    case 'straight': {
      const back = !shape.backless && z < -depth / 2 + depth * BACK_SHARE
      const leftArm = shape.closedLeft && x < -width / 2 + width * ARM_SHARE
      const rightArm = shape.closedRight && x > width / 2 - width * ARM_SHARE
      return { covered: true, tall: back || leftArm || rightArm }
    }
    case 'corner': {
      const back = z < -depth / 2 + depth * BACK_SHARE
      const side = shape.backSide === 'left' ? x < -width / 2 + width * BACK_SHARE : x > width / 2 - width * BACK_SHARE
      return { covered: true, tall: back || side }
    }
    case 'curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centre = curveCentre(width, lay)
      const radius = Math.hypot(x - centre.x, z - centre.z)
      const inner = width - shape.seatDepthMm
      const covered = radius >= inner && radius <= width
      const backBand = shape.seatDepthMm * CURVE_BACK_SHARE
      const tall =
        covered &&
        shape.back !== 'none' &&
        (lay === 'outside' ? radius >= width - backBand : radius <= inner + backBand)
      return { covered, tall }
    }
    case 'half-curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centre = halfCurveCentre(depth, lay)
      const radius = Math.hypot(x - centre.x, z - centre.z)
      const outer = width / 2
      const inner = outer - shape.seatDepthMm
      // Laid the outside way the ring's far side is towards -z; the inside way, towards +z.
      const farSide = lay === 'outside' ? z <= centre.z : z >= centre.z
      const covered = farSide && radius >= inner && radius <= outer
      const backBand = shape.seatDepthMm * CURVE_BACK_SHARE
      const tall =
        covered &&
        shape.back !== 'none' &&
        (lay === 'outside' ? radius >= outer - backBand : radius <= inner + backBand)
      return { covered, tall }
    }
    case 'round-end': {
      const across = x / (width / 2)
      const out = (z + depth / 2) / depth
      return { covered: out >= 0 && across * across + out * out <= 1, tall: false }
    }
  }
}

interface Relief {
  /** Seat level: most of a seating unit's top is its seat. */
  low: number
  high: number
}

/** The model's seat level and top, or null when it is flat enough to have no backrest. */
function reliefOf(grid: HeightGrid): Relief | null {
  const heights = Array.from(grid.tops).filter((height) => !Number.isNaN(height)).sort((first, second) => first - second)
  if (heights.length === 0) return null
  const low = heights[Math.floor(heights.length * 0.3)] ?? 0
  const high = heights[heights.length - 1] ?? 0
  const standing = high - grid.floorY
  return standing > 0 && (high - low) / standing >= 0.15 ? { low, high } : null
}

/** 0 at seat level, 1 for anything clearly standing above it. */
function tallness(height: number, relief: Relief): number {
  const share = (height - relief.low) / (relief.high - relief.low)
  return Math.min(1, Math.max(0, (share - 0.35) / 0.4))
}

function sampleGrid(grid: HeightGrid, x: number, z: number): number {
  const column = Math.floor((x - grid.minX) / grid.cellSize)
  const row = Math.floor((z - grid.minZ) / grid.cellSize)
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return Number.NaN
  return grid.tops[row * grid.columns + column] ?? Number.NaN
}

export interface OrientationCandidate {
  /** Quarter turns of three.js `rotation.y` (each +PI/2). */
  quarterTurns: 0 | 1 | 2 | 3
  score: number
}

export interface OrientationResult {
  quarterTurns: 0 | 1 | 2 | 3
  /** Best score less the runner-up's: near 0 means the turns look alike. */
  margin: number
  candidates: OrientationCandidate[]
}

/** Scores that close are the same picture; the smaller turn wins the tie. */
const TIE_SCORE = 0.03
const QUARTER_TURNS = [0, 1, 2, 3] as const

/**
 * The quarter turn (three.js `rotation.y = quarterTurns * PI / 2`) under which
 * the model looks most like the unit `definition` describes, laid `flipped`
 * where it can be.
 */
export function orientModel(grid: HeightGrid, definition: PieceDefinition, flipped: boolean): OrientationResult {
  const { spanX, spanZ } = grid
  const centreX = grid.minX + spanX / 2
  const centreZ = grid.minZ + spanZ / 2
  const relief = reliefOf(grid)
  const { widthMm: width, depthMm: depth } = definition

  const candidates = QUARTER_TURNS.map((quarterTurns): OrientationCandidate => {
    const sideways = quarterTurns % 2 === 1
    const turnedWidth = sideways ? spanZ : spanX
    const turnedDepth = sideways ? spanX : spanZ
    const scale = width / turnedWidth
    // A model the wrong way round across a long unit is the wrong proportions.
    const proportion = -2 * Math.abs(Math.log(Math.max(turnedDepth * scale, 1e-6) / depth))

    const angle = (quarterTurns * Math.PI) / 2
    const cosine = Math.round(Math.cos(angle))
    const sine = Math.round(Math.sin(angle))
    let both = 0
    let either = 0
    let tallInBack = 0
    let backCells = 0
    let tallInSeat = 0
    let seatCells = 0
    for (let row = 0; row < TEMPLATE_SAMPLES; row += 1) {
      const z = -depth / 2 + ((row + 0.5) / TEMPLATE_SAMPLES) * depth
      for (let column = 0; column < TEMPLATE_SAMPLES; column += 1) {
        const x = -width / 2 + ((column + 0.5) / TEMPLATE_SAMPLES) * width
        const expected = templateAt(definition, flipped, x, z)
        // Undo the turn: rotation.y maps (x, z) to (x cos + z sin, -x sin + z cos).
        const turnedX = x / scale
        const turnedZ = z / scale
        const modelX = centreX + turnedX * cosine - turnedZ * sine
        const modelZ = centreZ + turnedX * sine + turnedZ * cosine
        const height = sampleGrid(grid, modelX, modelZ)
        const covered = !Number.isNaN(height)
        if (covered && expected.covered) both += 1
        if (covered || expected.covered) either += 1
        if (!relief || !covered || !expected.covered) continue
        const standing = tallness(height, relief)
        if (expected.tall) {
          tallInBack += standing
          backCells += 1
        } else {
          tallInSeat += standing
          seatCells += 1
        }
      }
    }
    const overlap = either > 0 ? both / either : 0
    const heights = relief && backCells > 0 && seatCells > 0 ? tallInBack / backCells - tallInSeat / seatCells : 0
    return { quarterTurns, score: proportion + overlap + heights }
  })

  const best = Math.max(...candidates.map((candidate) => candidate.score))
  const winner = candidates.find((candidate) => candidate.score >= best - TIE_SCORE) ?? candidates[0]
  const runnerUp = Math.max(
    ...candidates.filter((candidate) => candidate !== winner).map((candidate) => candidate.score),
  )
  return {
    quarterTurns: winner?.quarterTurns ?? 0,
    margin: best - runnerUp,
    candidates,
  }
}
