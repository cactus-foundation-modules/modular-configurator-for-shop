import { describe, expect, it } from 'vitest'
import { addAtEnd, candidatesAtEnd, findChainProblem, flipEntry } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  canHostFrontSpur,
  commitPlacement,
  floorBoundary,
  isReversible,
  layoutBounds,
  layoutIsClosed,
  piecesOverlap,
  placeChain,
  type ChainEntry,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { ConfiguratorConfigSchema } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { pieceSizeProblem } from '@/modules/modular-configurator-for-shop/lib/config-validation'
import { shapeOfPlaced } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { orientModel, rasteriseTops, type TriangleVisitor } from '@/modules/modular-configurator-for-shop/lib/model-orientation'
import { SHAPE_CHOICES, choiceFromShape, guessShapeFromLabel, shapeFromChoice } from '@/modules/modular-configurator-for-shop/lib/shape-choice'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'

// A modular range made of straight units and 30 degree wedges, in millimetres,
// the sizes its model files measure: straight seats 710 deep, wedges with their
// back on the wide side (seats facing in) 555 across the back and 657 deep,
// wedges with their back on the narrow side (seats facing out) 653 across the
// front and 670 deep, each with an arm version whose arm runs along one cut
// side and makes it wider, and a backless wedge that bends either way.
const straight = (pieceId: string, widthMm: number, closedLeft: boolean, closedRight: boolean): PieceDefinition => ({
  pieceId,
  shape: { kind: 'straight', closedLeft, closedRight },
  widthMm,
  depthMm: 710,
})
const wedge = (pieceId: string, back: 'outside' | 'inside' | 'none', widthMm: number, depthMm: number, closedLeft = false, closedRight = false): PieceDefinition => ({
  pieceId,
  shape: { kind: 'segment', back, angleDegrees: 30, closedLeft, closedRight },
  widthMm,
  depthMm,
})

const CENTRAL = straight('central', 575, false, false)
const LEFT_END = straight('left', 625, true, false)
const RIGHT_END = straight('right', 625, false, true)
const CORNER: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'right' }, widthMm: 710, depthMm: 710 }
const IN = wedge('in', 'outside', 555, 657)
const IN_LEFT = wedge('in-left', 'outside', 628, 657, true, false)
const IN_RIGHT = wedge('in-right', 'outside', 628, 657, false, true)
const OUT = wedge('out', 'inside', 653, 670)
const OUT_LEFT = wedge('out-left', 'inside', 726, 670, true, false)
const OUT_RIGHT = wedge('out-right', 'inside', 726, 670, false, true)
const EITHER = wedge('either', 'none', 600, 450)

const ALL = [CENTRAL, LEFT_END, RIGHT_END, CORNER, IN, IN_LEFT, IN_RIGHT, OUT, OUT_LEFT, OUT_RIGHT, EITHER]
const DEFINITIONS = new Map(ALL.map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 12 }
const DEGREE = Math.PI / 180

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function repeat(pieceId: string, count: number): string[] {
  return Array.from({ length: count }, () => pieceId)
}

function pieceAt(placed: readonly PlacedPiece[], index: number): PlacedPiece {
  const piece = placed[index]
  if (!piece) throw new Error(`no piece at ${index}`)
  return piece
}

function noTwoOverlap(placed: readonly PlacedPiece[]): boolean {
  return placed.every((piece, index) => placed.slice(index + 1).every((later) => !piecesOverlap(piece, later)))
}

describe('a wedge with its back on the wide side', () => {
  it('bends the row towards the seats by its angle, back to back with its neighbours', () => {
    const placed = placeChain(chainOf('central', 'in', 'central'), DEFINITIONS)
    // A negative three.js turn swings a row's far end towards the shopper.
    expect(pieceAt(placed, 1).pose.rotationY).toBeCloseTo(-15 * DEGREE, 9)
    expect(pieceAt(placed, 2).pose.rotationY).toBeCloseTo(-30 * DEGREE, 9)
    expect(noTwoOverlap(placed)).toBe(true)
    // The wedge's back runs on from the first unit's back corner at (287.5, -355).
    const wedgeBack = floorBoundary(IN, pieceAt(placed, 1).pose)[0]
    expect(wedgeBack?.x).toBeCloseTo(287.5, 2)
    expect(wedgeBack?.z).toBeCloseTo(-355, 2)
    expect(findChainProblem(chainOf('central', 'in', 'central'), DEFINITIONS, LIMITS)).toBeNull()
    expect(shapeOfPlaced(placed)).toBe('curved')
  })

  it('turns exactly a whole number of degrees, however many wedges in a row', () => {
    const placed = placeChain(chainOf(...repeat('in', 7)), DEFINITIONS)
    // Right round is PI either way; turns are kept in (-PI, PI].
    expect(pieceAt(placed, 6).pose.rotationY).toBe(Math.PI)
    expect(pieceAt(placed, 3).pose.rotationY).toBe(-Math.PI / 2)
    expect(pieceAt(placed, 2).pose.rotationY).toBe((-60 * Math.PI) / 180)
  })

  it('makes a horseshoe between its two arm wedges, the ends facing each other', () => {
    const chain = chainOf('in-left', ...repeat('in', 4), 'in-right')
    const placed = placeChain(chain, DEFINITIONS)
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    expect(layoutIsClosed(placed)).toBe(false)
    // Six wedges bend 180 degrees; the middles of the first and last are five wedges apart.
    expect(pieceAt(placed, 5).pose.rotationY - pieceAt(placed, 0).pose.rotationY).toBeCloseTo(-150 * DEGREE, 9)
    // Its two arms finish the horseshoe's open side in one straight line.
    const firstArm = floorBoundary(IN_LEFT, pieceAt(placed, 0).pose)
    const lastArm = floorBoundary(IN_RIGHT, pieceAt(placed, 5).pose)
    const [lineStart, lineEnd] = [firstArm[0], firstArm[3]]
    if (!lineStart || !lineEnd) throw new Error('no arm side')
    const offLine = (point: { x: number; z: number } | undefined) =>
      point ? Math.abs((lineEnd.x - lineStart.x) * (point.z - lineStart.z) - (lineEnd.z - lineStart.z) * (point.x - lineStart.x)) / Math.hypot(lineEnd.x - lineStart.x, lineEnd.z - lineStart.z) : Infinity
    expect(offLine(lastArm[1])).toBeLessThan(0.5)
    expect(offLine(lastArm[2])).toBeLessThan(0.5)
  })

  it.each([
    ['a horseshoe', chainOf('in-left', ...repeat('in', 4), 'in-right')],
    ['a serpentine', chainOf('in-left', 'in', 'in', 'out', 'out', 'out-right')],
  ])('draws the space at an arm end of %s past the arm, not on top of it', (_name, chain) => {
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    const placed = placeChain(chain, DEFINITIONS)
    for (const end of ['start', 'end'] as const) {
      const space = candidatesAtEnd(placed, end, ALL, LIMITS).find((candidate) => candidate.refusal === null)?.space
      if (!space) throw new Error(`nothing offered at the ${end}`)
      // A plain square against the arm wedge's outer side, clear of every unit there now.
      expect(space.outline).toHaveLength(4)
      const arm = pieceAt(placed, end === 'start' ? 0 : 5)
      const armCorners = floorBoundary(arm.definition, arm.pose)
      const touching = space.outline.filter((corner) => armCorners.some((other) => Math.hypot(other.x - corner.x, other.z - corner.z) < 1))
      expect(touching).toHaveLength(2)
      for (const piece of placed) {
        const clear = space.outline.every((corner) => !pointInside(corner, floorBoundary(piece.definition, piece.pose, piece.entry.flipped)))
        expect(clear).toBe(true)
      }
    }
  })

  it('refuses anything joining on through an arm', () => {
    expect(findChainProblem(chainOf('in', 'in-left'), DEFINITIONS, LIMITS)).toBe('neighbours-cannot-join')
    expect(findChainProblem(chainOf('in-right', 'in'), DEFINITIONS, LIMITS)).toBe('neighbours-cannot-join')
    // Added at an arm end, a unit goes inside the arm wedge instead.
    const result = addAtEnd(chainOf('in-left', 'in-right'), 'end', { entryId: 'new', pieceId: 'in' }, DEFINITIONS, LIMITS)
    expect(result.ok && result.chain.map((entry) => entry.pieceId)).toEqual(['in-left', 'in', 'in-right'])
  })

  it('never has a backless unit stood in front of it', () => {
    expect(canHostFrontSpur(IN)).toBe(false)
  })
})

describe('a wedge with its back on the narrow side', () => {
  it('rings round into an island of twelve that joins up with nowhere left to add', () => {
    const chain = chainOf(...repeat('out', 12))
    const placed = placeChain(chain, DEFINITIONS)
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    expect(layoutIsClosed(placed)).toBe(true)
    expect(shapeOfPlaced(placed)).toBe('island')
    expect(candidatesAtEnd(placed, 'end', ALL, { maxPieces: 30 }).every((candidate) => candidate.refusal === 'layout-is-closed')).toBe(true)
    // A twelve-sided ring is as wide as it is deep, give or take the corners it is turned to.
    const bounds = layoutBounds(placed)
    if (!bounds) throw new Error('no bounds')
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    expect(Math.abs(width - depth)).toBeLessThan(width * 0.04)
    // Its front corners sit on a circle: half the narrow back over tan 15, plus the depth, out along the cut side.
    const narrowHalf = 653 / 2 - 670 * Math.tan(15 * DEGREE)
    const frontRadius = Math.hypot(653 / 2, narrowHalf / Math.tan(15 * DEGREE) + 670)
    expect(width).toBeLessThanOrEqual(2 * frontRadius + 1)
    expect(width).toBeGreaterThanOrEqual(2 * frontRadius * Math.cos(15 * DEGREE) - 1)
  })

  it('measures a turned wedge by its real outline, not the box round it', () => {
    const placed = placeChain(chainOf('out', 'out'), DEFINITIONS)
    const second = pieceAt(placed, 1)
    const outline = floorBoundary(OUT, second.pose)
    expect(second.footprint.minX).toBeCloseTo(Math.min(...outline.map((corner) => corner.x)), 2)
    expect(second.footprint.maxZ).toBeCloseTo(Math.max(...outline.map((corner) => corner.z)), 2)
  })
})

describe('mixing wedges with straight units and corners', () => {
  it('bends one way then the other into a serpentine', () => {
    const chain = chainOf('in-left', 'in', 'in', 'central', 'out', 'out', 'out-right')
    const placed = placeChain(chain, DEFINITIONS)
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
    expect(shapeOfPlaced(placed)).toBe('serpentine')
    // Three wedges in, three out: the last row runs the way the first did.
    expect(pieceAt(placed, 6).pose.rotationY).toBeCloseTo(pieceAt(placed, 0).pose.rotationY, 9)
  })

  it('carries on round a corner and straight into a wedge', () => {
    const chain = chainOf('left', 'central', 'corner', 'central', 'in', 'in', 'right')
    expect(findChainProblem(chain, DEFINITIONS, LIMITS)).toBeNull()
  })

  it('refuses a run that bends back into itself', () => {
    expect(findChainProblem(chainOf(...repeat('in', 13)), DEFINITIONS, { maxPieces: 30 })).toBe('would-overlap')
  })

  it('holds the units already placed still when one is added before them at an angle', () => {
    const before = placeChain(chainOf('in', 'in', 'central'), DEFINITIONS)
    const added = addAtEnd(chainOf('in', 'in', 'central'), 'start', { entryId: 'new', pieceId: 'in' }, DEFINITIONS, LIMITS)
    if (!added.ok) throw new Error(added.refusal)
    const after = commitPlacement(added.chain, DEFINITIONS, before)
    for (const piece of before) {
      const same = after.find((candidate) => candidate.entry.entryId === piece.entry.entryId)
      expect(same?.pose.centre.x).toBeCloseTo(piece.pose.centre.x, 2)
      expect(same?.pose.centre.z).toBeCloseTo(piece.pose.centre.z, 2)
      expect(same?.pose.rotationY).toBeCloseTo(piece.pose.rotationY, 9)
    }
  })
})

describe('a wedge with no back', () => {
  it('bends either way, and goes in whichever way fits', () => {
    expect(isReversible(EITHER)).toBe(true)
    expect(isReversible(IN)).toBe(false)
    const usual = placeChain(chainOf('either', 'either'), DEFINITIONS)
    const flipped = flipEntry(chainOf('either', 'either'), 'e1', DEFINITIONS, LIMITS)
    if (!flipped.ok) throw new Error(flipped.refusal)
    const bent = placeChain(flipped.chain, DEFINITIONS)
    expect(pieceAt(usual, 1).pose.rotationY).toBeCloseTo(-30 * DEGREE, 9)
    // Laid the other way the second wedge bends the row back the way it came.
    expect(pieceAt(bent, 1).pose.rotationY).toBeCloseTo(0, 9)
    expect(noTwoOverlap(bent)).toBe(true)
    expect(flipEntry(chainOf('in'), 'e0', DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'cannot-flip' })
  })
})

describe('ready-made layouts for a range of wedges', () => {
  it('counts wedges out from their angle: a curved sofa, a horseshoe, a serpentine and a round island', () => {
    const presets = suggestPresets(ALL, LIMITS)
    const byName = new Map(presets.map((preset) => [preset.name, preset.units.map((unit) => unit.pieceId)]))
    // The arm wedges bend too, so a quarter is them and one more.
    expect(byName.get('Curved sofa')).toEqual(['in-left', 'in', 'in-right'])
    expect(byName.get('Horseshoe')).toEqual(['in-left', ...repeat('in', 4), 'in-right'])
    expect(byName.get('Serpentine')).toEqual(['in-left', 'in', 'in', 'out', 'out', 'out-right'])
    expect(byName.get('Round island')).toEqual(repeat('out', 12))
    for (const preset of presets) {
      expect(findChainProblem(preset.units.map((unit, index) => ({ entryId: `p${index}`, pieceId: unit.pieceId })), DEFINITIONS, LIMITS)).toBeNull()
    }
  })

  it('uses the straight arm units where the range has no arm wedges, and leaves out a ring too big for the limit', () => {
    const presets = suggestPresets([CENTRAL, LEFT_END, RIGHT_END, IN, OUT], { maxPieces: 10 })
    const byName = new Map(presets.map((preset) => [preset.name, preset.units.map((unit) => unit.pieceId)]))
    expect(byName.get('Curved sofa')).toEqual(['left', 'in', 'in', 'in', 'right'])
    expect(byName.has('Round island')).toBe(false)
  })
})

describe('setting a wedge up', () => {
  it('round-trips every wedge choice and keeps the angle when the kind changes', () => {
    for (const { value } of SHAPE_CHOICES.filter((choice) => choice.value.startsWith('segment'))) {
      expect(choiceFromShape(shapeFromChoice(value))).toBe(value)
    }
    const angled = shapeFromChoice('segment-back-outside')
    const kept = shapeFromChoice('segment-back-inside-right-end', angled.kind === 'segment' ? { ...angled, angleDegrees: 22.5 } : angled)
    expect(kept).toEqual({ kind: 'segment', back: 'inside', angleDegrees: 22.5, closedLeft: false, closedRight: true })
  })

  it('guesses wedges and segments from their names', () => {
    expect(guessShapeFromLabel('Concave Segment')).toBe('segment-back-outside')
    expect(guessShapeFromLabel('Convex Wedge Left Arm')).toBe('segment-back-inside-left-end')
    expect(guessShapeFromLabel('Backless Wedge')).toBe('segment-backless')
    // A curve is still a curve, and a corner still a corner.
    expect(guessShapeFromLabel('Curved Segment')).toBe('curve-back-outside')
    expect(guessShapeFromLabel('Left Corner')).toBe('corner-back-left')
  })

  it('takes angles to the hundredth of a degree between 5 and 120', () => {
    const config = (angleDegrees: number) => ({
      pieceOptionName: 'Unit',
      maxPieces: 12,
      pieces: [{ valueSlug: 'wedge', shape: { kind: 'segment', back: 'outside', angleDegrees, closedLeft: false, closedRight: false }, widthMm: 555, depthMm: 657 }],
      presets: [],
    })
    expect(ConfiguratorConfigSchema.safeParse(config(22.5)).success).toBe(true)
    expect(ConfiguratorConfigSchema.safeParse(config(7.25)).success).toBe(true)
    expect(ConfiguratorConfigSchema.safeParse(config(4)).success).toBe(false)
    expect(ConfiguratorConfigSchema.safeParse(config(121)).success).toBe(false)
    expect(ConfiguratorConfigSchema.safeParse(config(22.4999)).success).toBe(false)
  })

  it('refuses a wedge so deep for its width that its sides would cross', () => {
    const piece = (widthMm: number, depthMm: number, angleDegrees: number) => ({
      valueSlug: 'wedge',
      shape: { kind: 'segment' as const, back: 'outside' as const, angleDegrees, closedLeft: false, closedRight: false },
      widthMm,
      depthMm,
      modelTurnDegrees: 'auto' as const,
    })
    expect(pieceSizeProblem(piece(555, 657, 30))).toBeNull()
    // Coming to a point is a triangle, which is fine.
    expect(pieceSizeProblem(piece(Math.round(2 * 657 * Math.tan(15 * DEGREE)), 657, 30))).toBeNull()
    expect(pieceSizeProblem(piece(300, 657, 30))).toMatch(/sides would cross/)
  })
})

describe('working out which way a wedge model faces', () => {
  /** A flat four-sided patch at `height`, corners in order. */
  function quad(corners: ReadonlyArray<[number, number]>, height: number) {
    return (visit: TriangleVisitor) => {
      const [a, b, c, d] = corners
      if (!a || !b || !c || !d) return
      visit(a[0], height, a[1], b[0], height, b[1], c[0], height, c[1])
      visit(a[0], height, a[1], c[0], height, c[1], d[0], height, d[1])
    }
  }

  it('stands a wedge drawn wide side forwards round the right way', () => {
    // 555 wide, 657 deep, the wide side at +z with a backrest 150 deep along it: drawn back to front.
    const inset = 0.657 * Math.tan(15 * DEGREE)
    const at = (fromWide: number) => 0.555 / 2 - inset * (fromWide / 0.657)
    const patches = [
      quad([[-at(0.15), 0.1785], [at(0.15), 0.1785], [at(0.657), -0.3285], [-at(0.657), -0.3285]], 0.45),
      quad([[-at(0), 0.3285], [at(0), 0.3285], [at(0.15), 0.1785], [-at(0.15), 0.1785]], 0.78),
    ]
    const bounds = { minX: -0.2775, maxX: 0.2775, minY: 0, maxY: 0.78, minZ: -0.3285, maxZ: 0.3285 }
    const grid = rasteriseTops(bounds, (visit) => {
      for (const patch of patches) patch(visit)
    })
    expect(orientModel(grid, IN, false).quarterTurns).toBe(2)
  })
})

/** Strictly inside a convex outline, a millimetre clear of its edges. */
function pointInside(point: { x: number; z: number }, outline: readonly { x: number; z: number }[]): boolean {
  let sign = 0
  for (let index = 0; index < outline.length; index += 1) {
    const start = outline[index]
    const end = outline[(index + 1) % outline.length]
    if (!start || !end) continue
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    if (length === 0) continue
    const side = ((end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x)) / length
    if (Math.abs(side) < 1) return false
    const now = Math.sign(side)
    if (sign !== 0 && now !== sign) return false
    sign = now
  }
  return true
}
