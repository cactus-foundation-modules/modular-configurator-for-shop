// The set-up screen's words for how a unit joins its neighbours, and the shape
// each one stands for. Kept apart from the screen so the mapping is tested and
// the storefront never has to know these labels exist.
import type { PieceShapeConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'

export type ShapeChoice =
  | 'middle'
  | 'middle-backless'
  | 'left-end'
  | 'right-end'
  | 'standalone'
  | 'corner-back-left'
  | 'corner-back-right'
  | 'curve-back-outside'
  | 'curve-back-inside'
  | 'curve-backless'
  | 'half-curve-back-outside'
  | 'half-curve-back-inside'
  | 'half-curve-backless'
  | 'round-end'

export const SHAPE_CHOICES: ReadonlyArray<{ value: ShapeChoice; label: string }> = [
  { value: 'middle', label: 'No arms - joins on both sides' },
  { value: 'middle-backless', label: 'No arms, no back - joins on both sides' },
  { value: 'left-end', label: 'Arm on the left - starts a row' },
  { value: 'right-end', label: 'Arm on the right - finishes a row' },
  { value: 'standalone', label: 'Arms both sides - stands alone' },
  { value: 'corner-back-left', label: 'Corner - second back on its left' },
  { value: 'corner-back-right', label: 'Corner - second back on its right' },
  { value: 'curve-back-outside', label: 'Curve - back on the outside, seats face in' },
  { value: 'curve-back-inside', label: 'Curve - back on the inside, seats face out' },
  { value: 'curve-backless', label: 'Curve - no back, bends either way' },
  { value: 'half-curve-back-outside', label: 'Half curve - back on the outside, seats face in' },
  { value: 'half-curve-back-inside', label: 'Half curve - back on the inside, seats face out' },
  { value: 'half-curve-backless', label: 'Half curve - no back, bends either way' },
  { value: 'round-end', label: 'Rounded end - wraps round to the row behind' },
]

/** Seat depth a newly chosen curve starts with, when it had none before. */
export const DEFAULT_CURVE_SEAT_DEPTH_MM = 700

/**
 * The shape a choice stands for. A curve keeps the seat depth it already had,
 * so flicking between the kinds of curve and half curve does not lose what was typed.
 */
export function shapeFromChoice(choice: ShapeChoice, previous?: PieceShapeConfig): PieceShapeConfig {
  const seatDepthMm =
    previous?.kind === 'curve' || previous?.kind === 'half-curve' ? previous.seatDepthMm : DEFAULT_CURVE_SEAT_DEPTH_MM
  switch (choice) {
    case 'middle':
      return { kind: 'straight', closedLeft: false, closedRight: false }
    case 'middle-backless':
      return { kind: 'straight', closedLeft: false, closedRight: false, backless: true }
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
    case 'curve-back-outside':
      return { kind: 'curve', back: 'outside', seatDepthMm }
    case 'curve-back-inside':
      return { kind: 'curve', back: 'inside', seatDepthMm }
    case 'curve-backless':
      return { kind: 'curve', back: 'none', seatDepthMm }
    case 'half-curve-back-outside':
      return { kind: 'half-curve', back: 'outside', seatDepthMm }
    case 'half-curve-back-inside':
      return { kind: 'half-curve', back: 'inside', seatDepthMm }
    case 'half-curve-backless':
      return { kind: 'half-curve', back: 'none', seatDepthMm }
    case 'round-end':
      return { kind: 'round-end' }
  }
}

export function choiceFromShape(shape: PieceShapeConfig): ShapeChoice {
  switch (shape.kind) {
    case 'corner':
      return shape.backSide === 'left' ? 'corner-back-left' : 'corner-back-right'
    case 'curve':
      return shape.back === 'outside' ? 'curve-back-outside' : shape.back === 'inside' ? 'curve-back-inside' : 'curve-backless'
    case 'half-curve':
      return shape.back === 'outside' ? 'half-curve-back-outside' : shape.back === 'inside' ? 'half-curve-back-inside' : 'half-curve-backless'
    case 'round-end':
      return 'round-end'
    case 'straight':
      if (shape.closedLeft && shape.closedRight) return 'standalone'
      if (shape.closedLeft) return 'left-end'
      if (shape.closedRight) return 'right-end'
      return shape.backless ? 'middle-backless' : 'middle'
  }
}

/**
 * A first guess from a unit's name, only ever used to pre-fill a unit the owner
 * has just ticked - they see it and can change it before saving. Curves and
 * rounded ends are checked first, then corners: a "left corner" is a corner,
 * not the left end of a row. "Inner" and "outer" curves are guessed as the back
 * being on that side, which is how the ranges seen so far name them. A curve
 * called 180 degrees, or half, is a half curve.
 */
export function guessShapeFromLabel(label: string): ShapeChoice {
  const name = label.toLowerCase()
  const backless = /\bbackless\b|\bno back\b/.test(name)
  if (/\bcurve[ds]?\b|\bcurved\b|\bradius\b/.test(name)) {
    const half = /\b180\b|\bhalf\b|\bsemi/.test(name)
    if (backless) return half ? 'half-curve-backless' : 'curve-backless'
    if (/\binner\b|\binside\b/.test(name)) return half ? 'half-curve-back-inside' : 'curve-back-inside'
    return half ? 'half-curve-back-outside' : 'curve-back-outside'
  }
  if (/\bd[- ]end\b|\brounded end\b|\bhalf[- ]round\b|\bsemi[- ]?circular\b/.test(name)) return 'round-end'
  if (name.includes('corner')) return 'corner-back-left'
  if (/\bleft\b/.test(name)) return 'left-end'
  if (/\bright\b/.test(name)) return 'right-end'
  return backless ? 'middle-backless' : 'middle'
}
