// The set-up screen's words for how a unit joins its neighbours, and the shape
// each one stands for. Kept apart from the screen so the mapping is tested and
// the storefront never has to know these labels exist.
import type { PieceShapeConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'

export type ShapeChoice = 'middle' | 'left-end' | 'right-end' | 'standalone' | 'corner-back-left' | 'corner-back-right'

export const SHAPE_CHOICES: ReadonlyArray<{ value: ShapeChoice; label: string }> = [
  { value: 'middle', label: 'No arms - joins on both sides' },
  { value: 'left-end', label: 'Arm on the left - starts a row' },
  { value: 'right-end', label: 'Arm on the right - finishes a row' },
  { value: 'standalone', label: 'Arms both sides - stands alone' },
  { value: 'corner-back-left', label: 'Corner - second back on its left' },
  { value: 'corner-back-right', label: 'Corner - second back on its right' },
]

export function shapeFromChoice(choice: ShapeChoice): PieceShapeConfig {
  switch (choice) {
    case 'middle':
      return { kind: 'straight', closedLeft: false, closedRight: false }
    case 'left-end':
      return { kind: 'straight', closedLeft: true, closedRight: false }
    case 'right-end':
      return { kind: 'straight', closedLeft: false, closedRight: true }
    case 'standalone':
      return { kind: 'straight', closedLeft: true, closedRight: true }
    case 'corner-back-left':
      return { kind: 'corner', backSide: 'left' }
    case 'corner-back-right':
      return { kind: 'corner', backSide: 'right' }
  }
}

export function choiceFromShape(shape: PieceShapeConfig): ShapeChoice {
  if (shape.kind === 'corner') return shape.backSide === 'left' ? 'corner-back-left' : 'corner-back-right'
  if (shape.closedLeft && shape.closedRight) return 'standalone'
  if (shape.closedLeft) return 'left-end'
  if (shape.closedRight) return 'right-end'
  return 'middle'
}

/**
 * A first guess from a unit's name, only ever used to pre-fill a unit the owner
 * has just ticked - they see it and can change it before saving. "Corner" is
 * checked first: a "left corner" is a corner, not the left end of a row.
 */
export function guessShapeFromLabel(label: string): ShapeChoice {
  const name = label.toLowerCase()
  if (name.includes('corner')) return 'corner-back-left'
  if (/\bleft\b/.test(name)) return 'left-end'
  if (/\bright\b/.test(name)) return 'right-end'
  return 'middle'
}
