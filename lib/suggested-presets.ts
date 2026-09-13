// Starting layouts worked out from the units themselves, for a listing whose
// owner has not written any. Pattern: classify each unit by how it joins (an end
// with an arm on the left, one on the right, an open middle, a corner), then try
// a fixed ladder of familiar shapes and keep the ones this range can actually
// build within its size limit. No names of any particular range are assumed.
import { findChainProblem, type ChainLimits } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { StorefrontPreset } from '@/modules/modular-configurator-for-shop/lib/storefront-types'

type Role = 'leftEnd' | 'middle' | 'rightEnd' | 'corner'

interface ShapeRecipe {
  name: string
  roles: Role[]
}

// Smallest first, so a shopper scanning the row sees the ladder climb.
const RECIPES: readonly ShapeRecipe[] = [
  { name: 'Pair', roles: ['leftEnd', 'rightEnd'] },
  { name: 'Row of three', roles: ['leftEnd', 'middle', 'rightEnd'] },
  { name: 'L-shape', roles: ['leftEnd', 'middle', 'corner', 'middle', 'rightEnd'] },
  { name: 'U-shape', roles: ['leftEnd', 'corner', 'middle', 'corner', 'rightEnd'] },
]

function roleOf(definition: PieceDefinition): Role | null {
  const { shape } = definition
  if (shape.kind === 'corner') return 'corner'
  if (shape.closedLeft && shape.closedRight) return null
  if (shape.closedLeft) return 'leftEnd'
  if (shape.closedRight) return 'rightEnd'
  return 'middle'
}

export function suggestPresets(definitions: readonly PieceDefinition[], limits: ChainLimits): StorefrontPreset[] {
  const firstByRole = new Map<Role, PieceDefinition>()
  for (const definition of definitions) {
    const role = roleOf(definition)
    if (role && !firstByRole.has(role)) firstByRole.set(role, definition)
  }
  const definitionsById = new Map(definitions.map((definition) => [definition.pieceId, definition]))
  const presets: StorefrontPreset[] = []
  for (const recipe of RECIPES) {
    const pieceIds = pieceIdsForRecipe(recipe, firstByRole)
    if (!pieceIds) continue
    const chain = pieceIds.map((pieceId, index) => ({ entryId: `preset-${index}`, pieceId }))
    if (findChainProblem(chain, definitionsById, limits) === null) presets.push({ name: recipe.name, pieceIds })
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
