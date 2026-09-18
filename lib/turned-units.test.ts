import { describe, expect, it } from 'vitest'
import {
  chainFromUnits,
  findChainProblem,
  turnEntry,
  turnIsOffered,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  piecesOverlap,
  placeChain,
  placeLayout,
  type ChainEntry,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import {
  presetUnitsOf,
  presetWithoutUnit,
  presetWithUnits,
  type ConfiguratorConfig,
} from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { validateConfigAgainstOptions } from '@/modules/modular-configurator-for-shop/lib/config-validation'
import { presetLayoutUnits } from '@/modules/modular-configurator-for-shop/lib/preset-units'

// A leather reception range: a 660 square backed chair and corner, and a
// shallower backless cube.
const CHAIR: PieceDefinition = { pieceId: 'chair', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 660 }
const CUBE: PieceDefinition = { pieceId: 'cube', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 660, depthMm: 520 }
const SQUARE_STOOL: PieceDefinition = { pieceId: 'stool', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 450, depthMm: 450 }
const CORNER: PieceDefinition = { pieceId: 'corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 660, depthMm: 660 }
const DEFINITIONS = new Map([CHAIR, CUBE, SQUARE_STOOL, CORNER].map((definition) => [definition.pieceId, definition]))
const LIMITS = { maxPieces: 24 }

function chainOf(...pieceIds: string[]): ChainEntry[] {
  return pieceIds.map((pieceId, index) => ({ entryId: `e${index}`, pieceId }))
}

function pieceWithId(placed: readonly PlacedPiece[], entryId: string): PlacedPiece {
  const piece = placed.find((candidate) => candidate.entry.entryId === entryId)
  if (!piece) throw new Error(`no piece ${entryId}`)
  return piece
}

function anyOverlap(placed: readonly PlacedPiece[]): boolean {
  return placed.some((piece, index) => placed.slice(index + 1).some((other) => piecesOverlap(piece, other)))
}

describe('a cube turned in front of a corner', () => {
  it('stands square to the row before the corner, flush with the corner either side', () => {
    const chain = chainFromUnits([{ pieceId: 'cube' }, { pieceId: 'corner' }, { pieceId: 'cube', turned: true }], 'e')
    const placed = placeChain(chain, DEFINITIONS)
    const first = pieceWithId(placed, 'e0')
    const corner = pieceWithId(placed, 'e1')
    const turned = pieceWithId(placed, 'e2')
    expect(corner.footprint).toEqual({ minX: 330, maxX: 990, minZ: -400, maxZ: 260 })
    expect(turned.pose.rotationY).toBe(first.pose.rotationY)
    expect(turned.footprint).toEqual({ minX: 330, maxX: 990, minZ: 260, maxZ: 780 })
    expect(anyOverlap(placed)).toBe(false)
  })

  it('lines up with the cubes stood in front of the chairs along the row', () => {
    const chain = chainFromUnits([{ pieceId: 'chair' }, { pieceId: 'chair', frontPieceId: 'cube' }, { pieceId: 'corner' }, { pieceId: 'cube', turned: true }], 'e')
    const placed = placeLayout(chain, DEFINITIONS)
    const frontCube = pieceWithId(placed, 'e1-front')
    const turned = pieceWithId(placed, 'e3')
    expect(frontCube.footprint).toEqual({ minX: 330, maxX: 990, minZ: 330, maxZ: 850 })
    expect(turned.footprint).toEqual({ minX: 990, maxX: 1650, minZ: 330, maxZ: 850 })
    expect(anyOverlap(placed)).toBe(false)
  })

  it('leaves a layout with nothing turned exactly where it was', () => {
    const chain = chainOf('cube', 'corner', 'cube')
    expect(placeChain(chain, DEFINITIONS).map((piece) => piece.footprint)).toEqual([
      { minX: -330, maxX: 330, minZ: -260, maxZ: 260 },
      { minX: 330, maxX: 990, minZ: -400, maxZ: 260 },
      { minX: 330, maxX: 850, minZ: 260, maxZ: 920 },
    ])
  })
})

describe('offering the turn', () => {
  it('is offered for a cube beside a corner, and turns it and back', () => {
    const chain = chainOf('cube', 'corner', 'cube')
    expect(turnIsOffered(chain, 'e2', DEFINITIONS, LIMITS)).toBe(true)
    const turned = turnEntry(chain, 'e2', DEFINITIONS, LIMITS)
    expect(turned.ok && turned.chain[2]?.turned).toBe(true)
    if (!turned.ok) return
    const back = turnEntry(turned.chain, 'e2', DEFINITIONS, LIMITS)
    expect(back.ok && back.chain[2]).toEqual({ entryId: 'e2', pieceId: 'cube' })
  })

  it('is not offered away from a corner, for a square stool, or for a unit with a back', () => {
    expect(turnIsOffered(chainOf('chair', 'cube', 'chair'), 'e1', DEFINITIONS, LIMITS)).toBe(false)
    expect(turnIsOffered(chainOf('stool', 'corner'), 'e0', DEFINITIONS, LIMITS)).toBe(false)
    expect(turnIsOffered(chainOf('chair', 'corner'), 'e0', DEFINITIONS, LIMITS)).toBe(false)
    expect(turnEntry(chainOf('chair', 'corner'), 'e0', DEFINITIONS, LIMITS)).toEqual({ ok: false, refusal: 'cannot-turn' })
  })

  it('is always offered back for a unit already turned', () => {
    const chain: ChainEntry[] = [{ entryId: 'e0', pieceId: 'chair' }, { entryId: 'e1', pieceId: 'cube', turned: true }]
    expect(turnIsOffered(chain, 'e1', DEFINITIONS, LIMITS)).toBe(true)
  })

  it('refuses a layout that turns a unit with a back', () => {
    expect(findChainProblem([{ entryId: 'e0', pieceId: 'chair', turned: true }], DEFINITIONS, LIMITS)).toBe('cannot-turn')
  })
})

describe('ready-made layouts with units in front and turned', () => {
  const OPTION = {
    name: 'Unit',
    values: [
      { slug: 'chair', label: 'Chair with Back' },
      { slug: 'cube', label: 'Backless' },
      { slug: 'corner', label: 'Corner' },
    ],
  }
  const config = (presets: ConfiguratorConfig['presets']): ConfiguratorConfig => ({
    pieceOptionName: 'Unit',
    frontUnits: true,
    freeUnits: false,
    maxPieces: 24,
    pieces: [CHAIR, CUBE, CORNER].map((definition) => ({
      valueSlug: definition.pieceId,
      shape: definition.shape,
      widthMm: definition.widthMm,
      depthMm: definition.depthMm,
      modelTurnDegrees: 'auto' as const,
    })),
    presets,
    viewSummary: 'always',
  })

  it('keeps the plain unit list whole, and writes the detail only when there is some', () => {
    const plain = presetWithUnits({ name: 'Row', valueSlugs: [] }, [{ valueSlug: 'chair' }, { valueSlug: 'chair' }])
    expect(plain).toEqual({ name: 'Row', valueSlugs: ['chair', 'chair'] })
    const detailed = presetWithUnits(plain, [{ valueSlug: 'chair', frontSlug: 'cube' }, { valueSlug: 'corner' }, { valueSlug: 'cube', turned: true }])
    expect(detailed).toEqual({
      name: 'Row',
      valueSlugs: ['chair', 'corner', 'cube'],
      units: [{ valueSlug: 'chair', frontSlug: 'cube' }, { valueSlug: 'corner' }, { valueSlug: 'cube', turned: true }],
    })
  })

  it('reads the plain list when the detail no longer matches it', () => {
    expect(presetUnitsOf({ valueSlugs: ['chair', 'chair'], units: [{ valueSlug: 'chair', frontSlug: 'cube' }] })).toEqual([{ valueSlug: 'chair' }, { valueSlug: 'chair' }])
  })

  it('takes a unit type out of a layout, and out from in front of the rest', () => {
    const preset = presetWithUnits({ name: 'Row', valueSlugs: [] }, [{ valueSlug: 'chair', frontSlug: 'cube' }, { valueSlug: 'cube' }, { valueSlug: 'chair' }])
    expect(presetWithoutUnit(preset, 'cube')).toEqual({ name: 'Row', valueSlugs: ['chair', 'chair'] })
  })

  it('names the units by id for the storefront, and refuses a unit it cannot find', () => {
    const preset = presetWithUnits({ name: 'Row', valueSlugs: [] }, [{ valueSlug: 'chair', frontSlug: 'cube' }, { valueSlug: 'corner' }, { valueSlug: 'cube', turned: true }])
    const ids = new Map([['chair', 'id-chair'], ['cube', 'id-cube'], ['corner', 'id-corner']])
    expect(presetLayoutUnits(preset, (slug) => ids.get(slug))).toEqual([
      { pieceId: 'id-chair', frontPieceId: 'id-cube' },
      { pieceId: 'id-corner' },
      { pieceId: 'id-cube', turned: true },
    ])
    expect(presetLayoutUnits(preset, (slug) => (slug === 'cube' ? undefined : ids.get(slug)))).toBeNull()
  })

  it('saves a layout with a cube in front of a chair and a turned cube by the corner', () => {
    const preset = presetWithUnits({ name: 'Reception', valueSlugs: [] }, [{ valueSlug: 'chair', frontSlug: 'cube' }, { valueSlug: 'corner' }, { valueSlug: 'cube', turned: true }])
    expect(validateConfigAgainstOptions({ enabled: true, config: config([preset]) }, [OPTION])).toBeNull()
  })

  it('refuses a cube in front of a corner, and a turned chair, in words the owner can act on', () => {
    const inFrontOfCorner = presetWithUnits({ name: 'Odd', valueSlugs: [] }, [{ valueSlug: 'chair' }, { valueSlug: 'corner', frontSlug: 'cube' }])
    expect(validateConfigAgainstOptions({ enabled: true, config: config([inFrontOfCorner]) }, [OPTION])).toBe(
      '"Odd" stands Backless in front of Corner: only a straight unit with no back can stand in front, and only of a straight unit with one',
    )
    const turnedChair = presetWithUnits({ name: 'Turned', valueSlugs: [] }, [{ valueSlug: 'corner' }, { valueSlug: 'chair', turned: true }])
    expect(validateConfigAgainstOptions({ enabled: true, config: config([turnedChair]) }, [OPTION])).toBe('"Turned" cannot be built: it turns a unit that has a back')
  })
})
