// Starting layouts worked out from the units themselves, for a listing whose
// owner has not written any. Pattern: classify each unit by how it joins (an end
// with an arm on the left, one on the right, an open middle, a corner, a curve
// facing in or out, a rounded end), then try
// a fixed ladder of familiar shapes and keep the ones this range can actually
// build within its size limit. No names of any particular range are assumed.
import { findChainProblem, type ChainLimits } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { StorefrontPreset } from '@/modules/modular-configurator-for-shop/lib/storefront-types'

type Role = 'leftEnd' | 'middle' | 'rightEnd' | 'corner' | 'curveIn' | 'curveOut' | 'halfCurveIn' | 'halfCurveOut' | 'roundEnd'

interface ShapeRecipe {
  name: string
  roles: Role[]
}

// Smallest first, so a shopper scanning the row sees the ladder climb. A name
// that appears twice is the same shape made two ways: the first the range can
// build is offered, and the second is not.
const RECIPES: readonly ShapeRecipe[] = [
  { name: 'Pair', roles: ['leftEnd', 'rightEnd'] },
  { name: 'Row of three', roles: ['leftEnd', 'middle', 'rightEnd'] },
  { name: 'L-shape', roles: ['leftEnd', 'middle', 'corner', 'middle', 'rightEnd'] },
  { name: 'U-shape', roles: ['leftEnd', 'corner', 'middle', 'corner', 'rightEnd'] },
  { name: 'Horseshoe', roles: ['leftEnd', 'middle', 'halfCurveIn', 'middle', 'rightEnd'] },
  { name: 'Booth', roles: ['curveIn', 'curveIn', 'curveIn'] },
  { name: 'Round booth', roles: ['halfCurveIn', 'halfCurveIn'] },
  { name: 'Round island', roles: ['curveOut', 'curveOut', 'curveOut', 'curveOut'] },
  { name: 'Round island', roles: ['halfCurveOut', 'halfCurveOut'] },
  { name: 'Capsule island', roles: ['roundEnd', 'middle', 'middle', 'roundEnd', 'middle', 'middle'] },
]

/**
 * A curve with its back on the outside seats people facing IN (a booth); one
 * with its back inside seats them facing OUT (an island). Half curves the same.
 * A curve with no back is left out: which way round it goes is the shopper's to decide.
 */
function roleOf(definition: PieceDefinition): Role | null {
  const { shape } = definition
  switch (shape.kind) {
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
    const pieceIds = pieceIdsForRecipe(recipe, firstByRole)
    if (!pieceIds) continue
    const chain = pieceIds.map((pieceId, index) => ({ entryId: `preset-${index}`, pieceId }))
    if (findChainProblem(chain, definitionsById, limits) === null) presets.push({ name: recipe.name, units: pieceIds.map((pieceId) => ({ pieceId })) })
  }
  return presets
}

/** The recipe spelled out in this range's units, or null when a role has none. */
function pieceIdsForRecipe(recipe: ShapeRecipe, firstByRole: ReadonlyMap<Role, PieceDefinition>): string[] | null {
  const pieceIds: string[] = []
  for (const role of recipe.roles) {
    const piece = firstByRole.get(role)
    if (!piece) return null
    pieceIds.push(piece.pieceId)
  }
  return pieceIds
}
