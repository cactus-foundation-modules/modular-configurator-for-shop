import { describe, expect, it } from 'vitest'
import { parseLengthToMm } from '@/modules/modular-configurator-for-shop/lib/length-parse'
import { choiceFromShape, guessShapeFromLabel, SHAPE_CHOICES, shapeFromChoice } from '@/modules/modular-configurator-for-shop/lib/shape-choice'
import { validateConfigAgainstOptions } from '@/modules/modular-configurator-for-shop/lib/config-validation'
import { parseStoredConfig, type ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { representativeChildFor, resolvePieceCatalogue } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'
import { SEATING_PAYLOAD } from '@/modules/modular-configurator-for-shop/lib/test-fixtures'

const UNIT_OPTION = {
  name: 'Unit',
  values: [
    { slug: 'left-unit', label: 'Left Unit' },
    { slug: 'central-unit', label: 'Central Unit' },
    { slug: 'right-unit', label: 'Right Unit' },
    { slug: 'corner-unit', label: 'Corner Unit' },
  ],
}

const CONFIG: ConfiguratorConfig = {
  pieceOptionName: 'Unit',
  frontUnits: true,
  maxPieces: 12,
  pieces: [
    { valueSlug: 'left-unit', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760, modelTurnDegrees: 0 },
    { valueSlug: 'central-unit', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760, modelTurnDegrees: 0 },
    { valueSlug: 'right-unit', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 790, depthMm: 760, modelTurnDegrees: 0 },
    { valueSlug: 'corner-unit', shape: { kind: 'corner', backSide: 'left' }, widthMm: 760, depthMm: 760, modelTurnDegrees: 0 },
  ],
  presets: [{ name: 'Corner sofa', valueSlugs: ['left-unit', 'corner-unit', 'right-unit'] }],
  viewSummary: 'always',
}

describe('reading sizes from a specification', () => {
  it('reads written lengths with their units and refuses to guess a bare number', () => {
    expect(['79cm', '790 mm', '0.79m', '76,5 cm'].map(parseLengthToMm)).toEqual([790, 790, 790, 765])
    expect(['79', 'about 80cm', '', '0cm'].map(parseLengthToMm)).toEqual([null, null, null, null])
  })
})

describe('the set-up screen’s unit shapes', () => {
  it('round-trips every choice through its stored shape', () => {
    for (const { value } of SHAPE_CHOICES) expect(choiceFromShape(shapeFromChoice(value))).toBe(value)
  })

  it('guesses from the name, treating any corner as a corner', () => {
    expect(['Left Unit', 'Right Unit', 'Central Unit', 'Left Corner'].map(guessShapeFromLabel)).toEqual([
      'left-end',
      'right-end',
      'middle',
      'corner-back-left',
    ])
  })

  it('guesses curves, rounded ends and backless units from how rounded ranges name them', () => {
    expect(
      ['90 Degree Outer Curved Unit', '90 Degree Inner Curved Unit', '90 Degree Backless Curved Unit', 'D End Unit', 'Central Backless Unit'].map(
        guessShapeFromLabel,
      ),
    ).toEqual(['curve-back-outside', 'curve-back-inside', 'curve-backless', 'round-end', 'middle-backless'])
  })

  it('guesses a half curve from a 180 degree or half curve name', () => {
    expect(['180 Degree Curved Unit', '180° Backless Curve', 'Half Curve Inner'].map(guessShapeFromLabel)).toEqual([
      'half-curve-back-outside',
      'half-curve-backless',
      'half-curve-back-inside',
    ])
  })

  it('keeps a curve’s seat depth when it changes to a half curve', () => {
    expect(shapeFromChoice('half-curve-backless', { kind: 'curve', back: 'outside', seatDepthMm: 450 })).toEqual({
      kind: 'half-curve',
      back: 'none',
      seatDepthMm: 450,
    })
  })

  it('keeps a curve’s seat depth when it changes to another kind of curve', () => {
    expect(shapeFromChoice('curve-backless', { kind: 'curve', back: 'outside', seatDepthMm: 710 })).toEqual({
      kind: 'curve',
      back: 'none',
      seatDepthMm: 710,
    })
  })
})

describe('checking a set-up before it is saved', () => {
  it('accepts a set-up that matches the product', () => {
    expect(validateConfigAgainstOptions({ enabled: true, config: CONFIG }, [UNIT_OPTION])).toBeNull()
  })

  it('says plainly what does not match', () => {
    expect(validateConfigAgainstOptions({ enabled: true, config: { ...CONFIG, pieceOptionName: 'Size' } }, [UNIT_OPTION])).toBe(
      'This product has no option called "Size"',
    )
    expect(validateConfigAgainstOptions({ enabled: true, config: { ...CONFIG, pieces: [], presets: [] } }, [UNIT_OPTION])).toBe(
      'Set up at least one unit before switching the layout builder on',
    )
    expect(
      validateConfigAgainstOptions(
        { enabled: true, config: { ...CONFIG, presets: [{ name: 'Backwards', valueSlugs: ['right-unit', 'left-unit'] }] } },
        [UNIT_OPTION],
      ),
    ).toBe('"Backwards" cannot be built: two neighbouring units meet arm to seat')
  })

  it('lets a ready-made layout stand a unit in front only where the range is set to', () => {
    // The range grown a backless cube, so standing one in front is possible;
    // whether it is offered is the owner's choice, not the range's shape.
    const withCube: ConfiguratorConfig = {
      ...CONFIG,
      pieces: [
        ...CONFIG.pieces,
        { valueSlug: 'cube', shape: { kind: 'straight', closedLeft: false, closedRight: false, backless: true }, widthMm: 660, depthMm: 520, modelTurnDegrees: 0 },
      ],
      presets: [{
        name: 'Sofa with a cube',
        valueSlugs: ['left-unit', 'central-unit', 'right-unit'],
        units: [{ valueSlug: 'left-unit' }, { valueSlug: 'central-unit', frontSlug: 'cube' }, { valueSlug: 'right-unit' }],
      }],
    }
    const option = { ...UNIT_OPTION, values: [...UNIT_OPTION.values, { slug: 'cube', label: 'Cube' }] }
    expect(validateConfigAgainstOptions({ enabled: true, config: withCube }, [option])).toBeNull()
    expect(validateConfigAgainstOptions({ enabled: true, config: { ...withCube, frontUnits: false } }, [option])).toBe(
      '"Sofa with a cube" stands Cube in front of Central Unit, but this range is not set to stand units in front of one another. Switch "Units in front of other units" on, or take it out of the layout',
    )
  })

  it('reads a set-up saved before the choice existed as not standing units in front', () => {
    const { frontUnits: _dropped, ...beforeTheChoice } = CONFIG
    expect(parseStoredConfig(beforeTheChoice).frontUnits).toBe(false)
  })

  it('reads a damaged stored row as not set up rather than breaking the page', () => {
    expect(parseStoredConfig({ pieceOptionName: 'Unit', pieces: 'nonsense' }).pieces).toEqual([])
    expect(parseStoredConfig(CONFIG)).toEqual(CONFIG)
  })

  it('keeps a turn the owner chose, and works out the turn for a unit that has none', () => {
    const [left, ...rest] = CONFIG.pieces
    const { modelTurnDegrees: _dropped, ...withoutTurn } = left ?? CONFIG.pieces[0]!
    const stored = parseStoredConfig({ ...CONFIG, pieces: [withoutTurn, ...rest] })
    expect(stored.pieces.map((piece) => piece.modelTurnDegrees)).toEqual(['auto', 0, 0, 0])
  })

  it('keeps the view summary showing for a set-up saved before the choice existed', () => {
    const { viewSummary: _dropped, ...saved } = CONFIG
    expect(parseStoredConfig(saved).viewSummary).toBe('always')
    expect(parseStoredConfig({ ...CONFIG, viewSummary: 'with-sizes' }).viewSummary).toBe('with-sizes')
  })

  it('refuses a curve whose sizes cannot be a quarter of a circle', () => {
    const curved = (widthMm: number, depthMm: number, seatDepthMm: number): ConfiguratorConfig => ({
      ...CONFIG,
      presets: [],
      pieces: [{ valueSlug: 'corner-unit', shape: { kind: 'curve', back: 'outside', seatDepthMm }, widthMm, depthMm, modelTurnDegrees: 'auto' }],
    })
    expect(validateConfigAgainstOptions({ enabled: true, config: curved(1200, 1200, 710) }, [UNIT_OPTION])).toBeNull()
    expect(validateConfigAgainstOptions({ enabled: true, config: curved(1200, 900, 710) }, [UNIT_OPTION])).toBe(
      'Corner Unit is curved, so its width and depth are both the size of the curve and must match',
    )
    expect(validateConfigAgainstOptions({ enabled: true, config: curved(700, 700, 710) }, [UNIT_OPTION])).toBe(
      'Corner Unit has a seat deeper than the curve it sits in',
    )
  })
})

describe('checking a half curve’s sizes', () => {
  const halved = (widthMm: number, depthMm: number, seatDepthMm: number): ConfiguratorConfig => ({
    ...CONFIG,
    presets: [],
    pieces: [{ valueSlug: 'corner-unit', shape: { kind: 'half-curve', back: 'none', seatDepthMm }, widthMm, depthMm, modelTurnDegrees: 'auto' }],
  })

  it('accepts half as deep as wide, to the millimetre for an odd width', () => {
    expect(validateConfigAgainstOptions({ enabled: true, config: halved(1890, 945, 450) }, [UNIT_OPTION])).toBeNull()
    expect(validateConfigAgainstOptions({ enabled: true, config: halved(1885, 943, 450) }, [UNIT_OPTION])).toBeNull()
  })

  it('refuses a half curve whose sizes cannot be half of a circle', () => {
    expect(validateConfigAgainstOptions({ enabled: true, config: halved(1890, 1890, 450) }, [UNIT_OPTION])).toBe(
      'Corner Unit is a half curve, so its depth must be half its width',
    )
    expect(validateConfigAgainstOptions({ enabled: true, config: halved(1890, 945, 945) }, [UNIT_OPTION])).toBe(
      'Corner Unit has a seat deeper than the curve it sits in',
    )
  })

  it('reads a stored set-up from before half curves unchanged', () => {
    expect(parseStoredConfig(CONFIG)).toEqual(CONFIG)
    expect(parseStoredConfig(halved(1890, 945, 450)).pieces[0]?.shape).toEqual({ kind: 'half-curve', back: 'none', seatDepthMm: 450 })
  })
})

describe('joining a set-up to the live options', () => {
  it('finds the unit option by name, loosely, and a buyable variation for each unit', () => {
    const catalogue = resolvePieceCatalogue(SEATING_PAYLOAD, { ...CONFIG, pieceOptionName: ' unit ' })
    expect(catalogue?.pieces.map((piece) => [piece.valueId, piece.label])).toEqual([
      ['v-left', 'Left Unit'],
      ['v-central', 'Central Unit'],
      ['v-right', 'Right Unit'],
      ['v-corner', 'Corner Unit'],
    ])
    expect(representativeChildFor(SEATING_PAYLOAD, 'v-corner')).toBe('child-corner-unit-rivet-olive-black')
  })

  it('drops units whose value has gone', () => {
    const catalogue = resolvePieceCatalogue(SEATING_PAYLOAD, {
      ...CONFIG,
      pieces: [
        ...CONFIG.pieces,
        { valueSlug: 'withdrawn-unit', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760, modelTurnDegrees: 0 },
      ],
    })
    expect(catalogue?.pieces).toHaveLength(4)
  })
})
