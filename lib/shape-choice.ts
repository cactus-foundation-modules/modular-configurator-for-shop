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
  | 'segment-back-outside'
  | 'segment-back-outside-left-end'
  | 'segment-back-outside-right-end'
  | 'segment-back-inside'
  | 'segment-back-inside-left-end'
  | 'segment-back-inside-right-end'
  | 'segment-backless'

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
  { value: 'segment-back-outside', label: 'Wedge - back on the wide side, seats face in' },
  { value: 'segment-back-outside-left-end', label: 'Wedge - back on the wide side, arm on the left - starts a row' },
  { value: 'segment-back-outside-right-end', label: 'Wedge - back on the wide side, arm on the right - finishes a row' },
  { value: 'segment-back-inside', label: 'Wedge - back on the narrow side, seats face out' },
  { value: 'segment-back-inside-left-end', label: 'Wedge - back on the narrow side, arm on the left - starts a row' },
  { value: 'segment-back-inside-right-end', label: 'Wedge - back on the narrow side, arm on the right - finishes a row' },
  { value: 'segment-backless', label: 'Wedge - no back, bends either way' },
]

/** Seat depth a newly chosen curve starts with, when it had none before. */
export const DEFAULT_CURVE_SEAT_DEPTH_MM = 700

/** Angle a newly chosen wedge starts with: twelve to a circle, the commonest there is. */
export const DEFAULT_SEGMENT_ANGLE_DEGREES = 30

/**
 * The shape a choice stands for. A curve keeps the seat depth it already had,
 * and a wedge its angle, so flicking between the kinds of each does not lose
 * what was typed.
 */
export function shapeFromChoice(choice: ShapeChoice, previous?: PieceShapeConfig): PieceShapeConfig {
  const seatDepthMm =
    previous?.kind === 'curve' || previous?.kind === 'half-curve' ? previous.seatDepthMm : DEFAULT_CURVE_SEAT_DEPTH_MM
  const angleDegrees = previous?.kind === 'segment' ? previous.angleDegrees : DEFAULT_SEGMENT_ANGLE_DEGREES
  // A seat's cushion overhang stays put while its arms are changed.
  const overhang = previous?.kind === 'straight' && previous.backless !== true && previous.overhangMm ? { overhangMm: previous.overhangMm } : {}
  const segment = (back: 'outside' | 'inside' | 'none', closedLeft: boolean, closedRight: boolean): PieceShapeConfig => ({
    kind: 'segment',
    back,
    angleDegrees,
    closedLeft,
    closedRight,
  })
  switch (choice) {
    case 'middle':
      return { kind: 'straight', closedLeft: false, closedRight: false, ...overhang }
    case 'middle-backless':
      return { kind: 'straight', closedLeft: false, closedRight: false, backless: true }
    case 'left-end':
      return { kind: 'straight', closedLeft: true, closedRight: false, ...overhang }
    case 'right-end':
      return { kind: 'straight', closedLeft: false, closedRight: true, ...overhang }
    case 'standalone':
      return { kind: 'straight', closedLeft: true, closedRight: true, ...overhang }
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
    case 'segment-back-outside':
      return segment('outside', false, false)
    case 'segment-back-outside-left-end':
      return segment('outside', true, false)
    case 'segment-back-outside-right-end':
      return segment('outside', false, true)
    case 'segment-back-inside':
      return segment('inside', false, false)
    case 'segment-back-inside-left-end':
      return segment('inside', true, false)
    case 'segment-back-inside-right-end':
      return segment('inside', false, true)
    case 'segment-backless':
      return segment('none', false, false)
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
    case 'segment': {
      if (shape.back === 'none') return 'segment-backless'
      const end = shape.closedLeft ? '-left-end' : shape.closedRight ? '-right-end' : ''
      return `segment-back-${shape.back}${end}`
    }
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
 * rounded ends are checked first, then wedges, then corners: a "left corner" is
 * a corner, not the left end of a row. "Inner" and "outer" curves are guessed as
 * the back being on that side, which is how the ranges seen so far name them. A
 * curve called 180 degrees, or half, is a half curve. A wedge or segment called
 * convex has its seats facing out, so its back on the inside; anything else
 * called a wedge is guessed as seats facing in.
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
  if (/\bwedges?\b|\bsegments?\b|\bconvex\b|\bconcave\b/.test(name)) {
    if (backless) return 'segment-backless'
    const back = /\bconvex\b|\boutward\b|\binside\b/.test(name) ? 'inside' : 'outside'
    const end = /\bleft\b/.test(name) ? '-left-end' : /\bright\b/.test(name) ? '-right-end' : ''
    return `segment-back-${back}${end}`
  }
  if (name.includes('corner')) return 'corner-back-left'
  if (/\bleft\b/.test(name)) return 'left-end'
  if (/\bright\b/.test(name)) return 'right-end'
  return backless ? 'middle-backless' : 'middle'
}
