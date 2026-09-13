import { describe, expect, it } from 'vitest'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { orientModel, rasteriseTops, type HeightGrid, type TriangleVisitor } from '@/modules/modular-configurator-for-shop/lib/model-orientation'

// Stand-in model files, in metres, drawn the way real supplier files arrive:
// not facing the way the unit's own frame does. Only top surfaces matter to a
// view from above, so each is a handful of flat, raised patches.
type Patch = (visit: TriangleVisitor) => void

/** A flat rectangle at height `height`. */
function slab(minX: number, maxX: number, minZ: number, maxZ: number, height: number): Patch {
  return (visit) => {
    visit(minX, height, minZ, maxX, height, minZ, maxX, height, maxZ)
    visit(minX, height, minZ, maxX, height, maxZ, minX, height, maxZ)
  }
}

/** A flat band of a ring about (centreX, centreZ), between two angles in radians. */
function ringBand(centreX: number, centreZ: number, inner: number, outer: number, from: number, to: number, height: number): Patch {
  return (visit) => {
    const steps = 24
    for (let step = 0; step < steps; step += 1) {
      const start = from + ((to - from) * step) / steps
      const end = from + ((to - from) * (step + 1)) / steps
      const point = (radius: number, angle: number): [number, number, number] => [centreX + radius * Math.cos(angle), height, centreZ + radius * Math.sin(angle)]
      visit(...point(inner, start), ...point(outer, start), ...point(outer, end))
      visit(...point(inner, start), ...point(outer, end), ...point(inner, end))
    }
  }
}

function gridOf(patches: Patch[]): HeightGrid {
  const corners: Array<[number, number, number]> = []
  for (const patch of patches) patch((ax, ay, az, bx, by, bz, cx, cy, cz) => corners.push([ax, ay, az], [bx, by, bz], [cx, cy, cz]))
  const bounds = {
    minX: Math.min(...corners.map((corner) => corner[0])),
    maxX: Math.max(...corners.map((corner) => corner[0])),
    minY: 0,
    maxY: Math.max(...corners.map((corner) => corner[1])),
    minZ: Math.min(...corners.map((corner) => corner[2])),
    maxZ: Math.max(...corners.map((corner) => corner[2])),
  }
  return rasteriseTops(bounds, (visit) => {
    for (const patch of patches) patch(visit)
  })
}

const QUARTER = Math.PI / 2

describe('working out which way a model faces', () => {
  it('turns a unit drawn with its back along +x round to put the back behind the seat', () => {
    // 710 deep along x, 550 wide along z; seat at 450, back 180 thick at 1160.
    const grid = gridOf([slab(0, 0.53, 0, 0.55, 0.45), slab(0.53, 0.71, 0, 0.55, 1.16)])
    const central: PieceDefinition = { pieceId: 'central', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 550, depthMm: 710 }
    // rotation.y = +PI/2 takes +x to -z, the back of the unit's frame.
    expect(orientModel(grid, central, false).quarterTurns).toBe(1)
  })

  it('tells a left arm from a right one when the arm is as tall as the back', () => {
    // Panels along +x and +z of a square seat, as a rounded range's end units come.
    const grid = gridOf([slab(0, 0.53, 0, 0.53, 0.45), slab(0.53, 0.71, 0, 0.71, 0.76), slab(0, 0.53, 0.53, 0.71, 0.76)])
    const end = (closedLeft: boolean): PieceDefinition => ({
      pieceId: 'end',
      shape: { kind: 'straight', closedLeft, closedRight: !closedLeft },
      widthMm: 710,
      depthMm: 710,
    })
    expect(orientModel(grid, end(true), false).quarterTurns).toBe(2)
    expect(orientModel(grid, end(false), false).quarterTurns).toBe(1)
  })

  it('finds the centre of a curved unit and which side its back is on', () => {
    // A quarter ring centred on the file's (0, 0) corner, back on the outside.
    const grid = gridOf([
      ringBand(0, 0, 0.49, 0.99, 0, QUARTER, 0.45),
      ringBand(0, 0, 0.99, 1.2, 0, QUARTER, 1.16),
    ])
    const curve = (back: 'outside' | 'inside'): PieceDefinition => ({
      pieceId: 'curve',
      shape: { kind: 'curve', back, seatDepthMm: 710 },
      widthMm: 1200,
      depthMm: 1200,
    })
    expect(orientModel(grid, curve('outside'), false).quarterTurns).toBe(1)
    // Called a back-inside curve, the same file has to go round the other way to
    // put its tall edge on the inside - and is a poorer match wherever it goes.
    const asInside = orientModel(grid, curve('inside'), false)
    expect(asInside.quarterTurns).not.toBe(1)
  })

  it('lays a backless curve one way or the other as the layout needs', () => {
    const grid = gridOf([ringBand(1.2, 1.2, 0.49, 1.2, Math.PI, Math.PI + QUARTER, 0.46)])
    const either: PieceDefinition = { pieceId: 'either', shape: { kind: 'curve', back: 'none', seatDepthMm: 710 }, widthMm: 1200, depthMm: 1200 }
    expect(orientModel(grid, either, false).quarterTurns).toBe(3)
    expect(orientModel(grid, either, true).quarterTurns).toBe(2)
  })

  it('turns a half curve so its ring lies behind its straight side, or in front when laid the inside way', () => {
    // Half a ring centred on the file's origin, its far side towards +z.
    const band = ringBand(0, 0, 0.49, 1.2, 0, Math.PI, 0.46)
    const half = (back: 'outside' | 'inside' | 'none'): PieceDefinition => ({
      pieceId: 'half',
      shape: { kind: 'half-curve', back, seatDepthMm: 710 },
      widthMm: 2400,
      depthMm: 1200,
    })
    // rotation.y = PI takes the file's +z to -z, where the outside way has its far side.
    expect(orientModel(gridOf([band]), half('none'), false).quarterTurns).toBe(2)
    expect(orientModel(gridOf([band]), half('none'), true).quarterTurns).toBe(0)
    // A back standing round the outer rim reads as a back on the outside.
    const backed = gridOf([ringBand(0, 0, 0.49, 0.99, 0, Math.PI, 0.45), ringBand(0, 0, 0.99, 1.2, 0, Math.PI, 1.16)])
    const asOutside = orientModel(backed, half('outside'), false)
    expect(asOutside.quarterTurns).toBe(2)
    expect(asOutside.margin).toBeGreaterThan(0.1)
  })

  it('puts a rounded end’s flat side against the rows it joins', () => {
    // A half disc with its flat side along the file's +x edge.
    const grid = gridOf([ringBand(0.71, 0.71, 0, 0.71, QUARTER, 3 * QUARTER, 0.46)])
    const roundEnd: PieceDefinition = { pieceId: 'd-end', shape: { kind: 'round-end' }, widthMm: 1420, depthMm: 710 }
    expect(orientModel(grid, roundEnd, false).quarterTurns).toBe(1)
  })

  it('leaves a model that looks the same every way round unturned', () => {
    const grid = gridOf([slab(0, 0.71, 0, 0.71, 0.46)])
    const block: PieceDefinition = { pieceId: 'block', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 710, depthMm: 710 }
    const result = orientModel(grid, block, false)
    expect(result.quarterTurns).toBe(0)
    expect(result.margin).toBeLessThan(0.05)
  })
})
