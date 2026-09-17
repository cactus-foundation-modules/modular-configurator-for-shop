// Words for a layout: what shape it is, what it is made of, how big it is. Used
// on the product page, in the builder and on the basket line, so the shopper and
// whoever packs the order read the same description.
import { curveLayOf, layoutBounds, layoutIsClosed, type PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

export type LayoutShape = 'straight' | 'l-shape' | 'u-shape' | 'wraparound' | 'serpentine' | 'back-to-back' | 'island' | 'curved'

const SHAPE_LABELS: Record<LayoutShape, string> = {
  straight: 'Straight',
  'l-shape': 'L-shape',
  'u-shape': 'U-shape',
  wraparound: 'Wraparound',
  serpentine: 'Serpentine',
  'back-to-back': 'Back-to-back',
  island: 'Island',
  curved: 'Curved',
}

/**
 * Turns that all go the same way name the shape by how many there are (see
 * shapeOfPlaced for the rest).
 */
export function layoutShapeOf(cornerCount: number): LayoutShape {
  if (cornerCount <= 0) return 'straight'
  if (cornerCount === 1) return 'l-shape'
  if (cornerCount === 2) return 'u-shape'
  return 'wraparound'
}

export function layoutShapeLabel(shape: LayoutShape): string {
  return SHAPE_LABELS[shape]
}

/**
 * How many quarter turns each piece makes, and which way: positive towards the
 * seats' front (a corner, a curve with its back outside), negative away from it
 * (a curve with its back inside), 0 for a piece that carries straight on. A half
 * curve is two quarter turns at once; a wedge turns by its own angle, so by a
 * share of a quarter.
 */
function quarterTurnOf(piece: PlacedPiece): number {
  const { shape } = piece.definition
  if (shape.kind === 'corner') return 1
  if (shape.kind === 'curve') return curveLayOf(shape.back, piece.entry.flipped) === 'outside' ? 1 : -1
  if (shape.kind === 'half-curve') return curveLayOf(shape.back, piece.entry.flipped) === 'outside' ? 2 : -2
  if (shape.kind === 'segment') return ((curveLayOf(shape.back, piece.entry.flipped) === 'outside' ? 1 : -1) * shape.angleDegrees) / 90
  return 0
}

/** A rounded end, or a half curve laid the inside way, sits the rows either side of it back to back. */
function joinsRowsBackToBack(piece: PlacedPiece): boolean {
  const { shape } = piece.definition
  if (shape.kind === 'round-end') return true
  return shape.kind === 'half-curve' && curveLayOf(shape.back, piece.entry.flipped) === 'inside'
}

/**
 * A layout that joins up all the way round is an island; one with a rounded
 * end (or a half curve laid the inside way) has rows back to back; one bending
 * both ways is a serpentine; one bending on wedges is curved, however far round
 * it goes. Otherwise it is named by how many quarter turns it makes, curves
 * counting as corners and a half curve as two.
 */
export function shapeOfPlaced(placed: readonly PlacedPiece[]): LayoutShape {
  if (layoutIsClosed(placed)) return 'island'
  if (placed.some(joinsRowsBackToBack)) return 'back-to-back'
  const turns = placed.map(quarterTurnOf).filter((turn) => turn !== 0)
  if (turns.some((turn) => turn > 0) && turns.some((turn) => turn < 0)) return 'serpentine'
  if (placed.some((piece) => piece.definition.shape.kind === 'segment')) return 'curved'
  return layoutShapeOf(turns.reduce((total, turn) => total + Math.abs(turn), 0))
}

/** "1.84 m" - metres to two places, the way a tape measure would be read out. */
export function formatMetres(millimetres: number): string {
  const metres = millimetres / 1000
  return `${metres.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
}

export interface LayoutFootprint {
  widthMm: number
  depthMm: number
}

export function footprintOfLayout(placed: readonly PlacedPiece[]): LayoutFootprint | null {
  const bounds = layoutBounds(placed)
  return bounds ? { widthMm: bounds.maxX - bounds.minX, depthMm: bounds.maxZ - bounds.minZ } : null
}

/** "2.24 m wide × 1.83 m deep". */
export function describeFootprint(footprint: LayoutFootprint): string {
  return `${formatMetres(footprint.widthMm)} wide × ${formatMetres(footprint.depthMm)} deep`
}

/** "Left Unit, Central Unit ×2, Corner Unit" - counts in order of first appearance. */
export function describeUnitCounts(labels: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].map(([label, count]) => (count > 1 ? `${label} ×${count}` : label)).join(', ')
}

/** "Left Unit → Central Unit → Corner Unit" - the order they join in. */
export function describeArrangement(labels: readonly string[]): string {
  return labels.join(' → ')
}

export function unitCountLabel(count: number): string {
  return count === 1 ? '1 unit' : `${count} units`
}

export function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} items`
}
