// Starting layouts worked out from the units themselves, for a listing whose
// owner has not written any. Pattern: classify each unit by how it joins (an end
// with an arm on the left, one on the right, an open middle, a corner, a curve
// or wedge facing in or out, a wedge with an arm, a rounded end), then try
// a fixed ladder of familiar shapes and keep the ones this range can actually
// build within its size limit. Shapes made of wedges are counted out from the
// wedges' own angle - how many it takes to bend a quarter, a half or all the way
// round. No names of any particular range are assumed.
import { findChainProblem, type ChainLimits } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { StorefrontPreset } from '@/modules/modular-configurator-for-shop/lib/storefront-types'

type Role =
  | 'leftEnd'
  | 'middle'
  | 'rightEnd'
  | 'corner'
  | 'curveIn'
  | 'curveOut'
  | 'halfCurveIn'
  | 'halfCurveOut'
  | 'roundEnd'
  | 'wedgeIn'
  | 'wedgeOut'
  | 'wedgeInLeftEnd'
  | 'wedgeInRightEnd'
  | 'wedgeOutLeftEnd'
  | 'wedgeOutRightEnd'

type RolePick = ReadonlyMap<Role, PieceDefinition>

interface ShapeRecipe {
  name: string
  /** The roles in the order they join, or null when this range cannot make it that way. */
  roles: (pick: RolePick) => Role[] | null
}

/** A recipe whose roles never change. */
function fixed(name: string, roles: Role[]): ShapeRecipe {
  return { name, roles: () => roles }
}

/** The wedge filling `role`'s angle, or null when the range has none. */
function wedgeAngle(pick: RolePick, role: Role): number | null {
  const shape = pick.get(role)?.shape
  return shape?.kind === 'segment' ? shape.angleDegrees : null
}

/**
 * A run of wedges bending `degrees` between two ends: the range's own arm wedges
 * where it has them (their bend counts towards the total), else its straight arm
 * units. Null when the wedges cannot come within half a wedge of the bend.
 */
function wedgeRun(pick: RolePick, degrees: number, middle: 'wedgeIn' | 'wedgeOut', leftWedge: Role, rightWedge: Role): Role[] | null {
  const angle = wedgeAngle(pick, middle)
  if (angle === null) return null
  const left: Role = pick.has(leftWedge) ? leftWedge : 'leftEnd'
  const right: Role = pick.has(rightWedge) ? rightWedge : 'rightEnd'
  const endBend = (wedgeAngle(pick, left) ?? 0) + (wedgeAngle(pick, right) ?? 0)
  const count = Math.round((degrees - endBend) / angle)
  if (count < 1) return null
  return [left, ...Array.from({ length: count }, () => middle), right]
}

/** A bend one way then the other: in, then out, a quarter each. */
function serpentine(pick: RolePick): Role[] | null {
  const inAngle = wedgeAngle(pick, 'wedgeIn')
  const outAngle = wedgeAngle(pick, 'wedgeOut')
  if (inAngle === null || outAngle === null) return null
  const left: Role = pick.has('wedgeInLeftEnd') ? 'wedgeInLeftEnd' : 'leftEnd'
  const right: Role = pick.has('wedgeOutRightEnd') ? 'wedgeOutRightEnd' : 'rightEnd'
  const inCount = Math.round((90 - (wedgeAngle(pick, left) ?? 0)) / inAngle)
  const outCount = Math.round((90 - (wedgeAngle(pick, right) ?? 0)) / outAngle)
  if (inCount < 1 || outCount < 1) return null
  return [left, ...Array.from({ length: inCount }, (): Role => 'wedgeIn'), ...Array.from({ length: outCount }, (): Role => 'wedgeOut'), right]
}

/** Enough wedges to come all the way round, when a whole number of them does. */
function wedgeRing(pick: RolePick, role: 'wedgeIn' | 'wedgeOut'): Role[] | null {
  const angle = wedgeAngle(pick, role)
  if (angle === null) return null
  const count = 360 / angle
  return Math.abs(count - Math.round(count)) < 1e-6 ? Array.from({ length: Math.round(count) }, () => role) : null
}

// Smallest first, so a shopper scanning the row sees the ladder climb. A name
// that appears twice is the same shape made two ways: the first the range can
// build is offered, and the second is not.
const RECIPES: readonly ShapeRecipe[] = [
  fixed('Pair', ['leftEnd', 'rightEnd']),
  fixed('Row of three', ['leftEnd', 'middle', 'rightEnd']),
  { name: 'Curved sofa', roles: (pick) => wedgeRun(pick, 90, 'wedgeIn', 'wedgeInLeftEnd', 'wedgeInRightEnd') },
  fixed('L-shape', ['leftEnd', 'middle', 'corner', 'middle', 'rightEnd']),
  fixed('U-shape', ['leftEnd', 'corner', 'middle', 'corner', 'rightEnd']),
  fixed('Horseshoe', ['leftEnd', 'middle', 'halfCurveIn', 'middle', 'rightEnd']),
  { name: 'Horseshoe', roles: (pick) => wedgeRun(pick, 180, 'wedgeIn', 'wedgeInLeftEnd', 'wedgeInRightEnd') },
  { name: 'Serpentine', roles: serpentine },
  fixed('Booth', ['curveIn', 'curveIn', 'curveIn']),
  fixed('Round booth', ['halfCurveIn', 'halfCurveIn']),
  fixed('Round island', ['curveOut', 'curveOut', 'curveOut', 'curveOut']),
  fixed('Round island', ['halfCurveOut', 'halfCurveOut']),
  { name: 'Round island', roles: (pick) => wedgeRing(pick, 'wedgeOut') },
  fixed('Capsule island', ['roundEnd', 'middle', 'middle', 'roundEnd', 'middle', 'middle']),
]

/**
 * A curve with its back on the outside seats people facing IN (a booth); one
 * with its back inside seats them facing OUT (an island). Half curves and wedges
 * the same. A curve or wedge with no back is left out: which way round it goes
 * is the shopper's to decide. So is a wedge with arms both sides, which stands alone.
 */
function roleOf(definition: PieceDefinition): Role | null {
  const { shape } = definition
  switch (shape.kind) {
    case 'segment': {
      if (shape.back === 'none' || (shape.closedLeft && shape.closedRight)) return null
      const facing = shape.back === 'outside' ? 'wedgeIn' : 'wedgeOut'
      if (shape.closedLeft) return `${facing}LeftEnd`
      if (shape.closedRight) return `${facing}RightEnd`
      return facing
    }
    case 'corner':
      return 'corner'
    case 'curve':
      return shape.back === 'outside' ? 'curveIn' : shape.back === 'inside' ? 'curveOut' : null
    case 'half-curve':
      return shape.back === 'outside' ? 'halfCurveIn' : shape.back === 'inside' ? 'halfCurveOut' : null
    case 'round-end':
      return 'roundEnd'
    case 'straight':
      if (shape.closedLeft && shape.closedRight) return null
      if (shape.closedLeft) return 'leftEnd'
      if (shape.closedRight) return 'rightEnd'
      return 'middle'
  }
}

/** A backed unit stands for its role ahead of a backless one: most shapes are sofas. */
function preferredFor(role: Role, current: PieceDefinition | undefined, candidate: PieceDefinition): boolean {
  if (!current) return true
  const backless = (definition: PieceDefinition) => definition.shape.kind === 'straight' && definition.shape.backless === true
  return role === 'middle' && backless(current) && !backless(candidate)
}

export function suggestPresets(definitions: readonly PieceDefinition[], limits: ChainLimits): StorefrontPreset[] {
  const firstByRole = new Map<Role, PieceDefinition>()
  for (const definition of definitions) {
    const role = roleOf(definition)
    if (role && preferredFor(role, firstByRole.get(role), definition)) firstByRole.set(role, definition)
  }
  const definitionsById = new Map(definitions.map((definition) => [definition.pieceId, definition]))
  const presets: StorefrontPreset[] = []
  for (const recipe of RECIPES) {
    if (presets.some((preset) => preset.name === recipe.name)) continue
    const roles = recipe.roles(firstByRole)
    const pieceIds = roles ? pieceIdsForRoles(roles, firstByRole) : null
    if (!pieceIds) continue
    const chain = pieceIds.map((pieceId, index) => ({ entryId: `preset-${index}`, pieceId }))
    if (findChainProblem(chain, definitionsById, limits) === null) presets.push({ name: recipe.name, units: pieceIds.map((pieceId) => ({ pieceId })) })
  }
  return presets
}

/** The roles spelled out in this range's units, or null when a role has none. */
function pieceIdsForRoles(roles: readonly Role[], firstByRole: RolePick): string[] | null {
  const pieceIds: string[] = []
  for (const role of roles) {
    const piece = firstByRole.get(role)
    if (!piece) return null
    pieceIds.push(piece.pieceId)
  }
  return pieceIds
}
