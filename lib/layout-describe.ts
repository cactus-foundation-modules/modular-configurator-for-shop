// Words for a layout: what shape it is, what it is made of, how big it is. Used
// on the product page, in the builder and on the basket line, so the shopper and
// whoever packs the order read the same description.
import { layoutBounds, type PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

export type LayoutShape = 'straight' | 'l-shape' | 'u-shape' | 'wraparound'

const SHAPE_LABELS: Record<LayoutShape, string> = {
  straight: 'Straight',
  'l-shape': 'L-shape',
  'u-shape': 'U-shape',
  wraparound: 'Wraparound',
}

/**
 * Every corner turns the same way (towards the seats' front - see
 * chain-geometry), so the number of corners alone names the shape.
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

export function shapeOfPlaced(placed: readonly PlacedPiece[]): LayoutShape {
  return layoutShapeOf(placed.filter((piece) => piece.definition.shape.kind === 'corner').length)
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
