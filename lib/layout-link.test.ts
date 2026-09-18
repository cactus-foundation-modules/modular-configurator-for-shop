import { describe, expect, it } from 'vitest'
import type { ConfiguratorConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import {
  carriedChoices,
  layoutLinkHref,
  pickStartingLayout,
  usableStartingLayouts,
  type TargetOption,
} from '@/modules/modular-configurator-for-shop/lib/layout-link'
import { LayoutLinkSchema, parseStoredStartingLayouts, type LayoutLink, type StartingLayout } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import { validateLayoutLink, type LinkTargetForValidation } from '@/modules/modular-configurator-for-shop/lib/layout-link-validation'

const EIGHT: StartingLayout = { when: { optionName: 'Seats', valueSlug: '8-seater' }, valueSlugs: ['left-end-unit', 'central-unit', 'right-end-unit'] }
const TEN: StartingLayout = { when: { optionName: 'Seats', valueSlug: '10-seater' }, valueSlugs: ['left-end-unit', 'central-unit', 'central-unit', 'right-end-unit'] }
const ANY: StartingLayout = { when: null, valueSlugs: ['left-end-unit', 'right-end-unit'] }

const TARGET_OPTIONS: TargetOption[] = [
  { name: 'Back', paramKey: 'back', valueSlugs: ['high-back', 'low-back', 'no-back'] },
  { name: 'Upholstery Colour', paramKey: 'upholstery-colour', valueSlugs: ['era-rest', 'era-prime'] },
]

const CONFIG: ConfiguratorConfig = {
  pieceOptionName: 'Unit',
  frontUnits: true,
  freeUnits: false,
  maxPieces: 12,
  presets: [],
  pieces: [
    { valueSlug: 'left-end-unit', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 710, depthMm: 710, modelTurnDegrees: 'auto' },
    { valueSlug: 'central-unit', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 550, depthMm: 710, modelTurnDegrees: 'auto' },
    { valueSlug: 'right-end-unit', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 710, depthMm: 710, modelTurnDegrees: 'auto' },
  ],
  viewSummary: 'always',
}

describe('pickStartingLayout', () => {
  it('prefers the layout whose condition the choices meet', () => {
    expect(pickStartingLayout([ANY, EIGHT, TEN], [{ optionName: 'Seats', valueSlug: '10-seater' }])).toBe(TEN)
  })

  it('matches option names loosely, as the builder set-up does', () => {
    expect(pickStartingLayout([EIGHT], [{ optionName: ' seats ', valueSlug: '8-seater' }])).toBe(EIGHT)
  })

  it('falls back to the unconditional layout, then to none', () => {
    expect(pickStartingLayout([EIGHT, ANY], [])).toBe(ANY)
    expect(pickStartingLayout([EIGHT, TEN], [{ optionName: 'Seats', valueSlug: '12-seater' }])).toBeNull()
  })
})

describe('carriedChoices', () => {
  it('carries a choice to the option of the same name', () => {
    expect(carriedChoices([{ optionName: 'Upholstery Colour', valueSlug: 'era-rest' }], TARGET_OPTIONS)).toEqual([['upholstery-colour', 'era-rest']])
  })

  it('carries a differently named choice when exactly one option holds its value', () => {
    expect(carriedChoices([{ optionName: 'Back Height', valueSlug: 'high-back' }], TARGET_OPTIONS)).toEqual([['back', 'high-back']])
  })

  it('leaves behind a value the builder does not make, and a value two options share', () => {
    const shared: TargetOption[] = [
      { name: 'Frame', paramKey: 'frame', valueSlugs: ['black'] },
      { name: 'Legs', paramKey: 'legs', valueSlugs: ['black'] },
    ]
    expect(carriedChoices([{ optionName: 'Table Colour', valueSlug: 'black' }], shared)).toEqual([])
    expect(carriedChoices([{ optionName: 'Upholstery Colour', valueSlug: 'era-nothing' }], TARGET_OPTIONS)).toEqual([])
  })

  it('never lets a same-named option with the value missing fall through to a slug match', () => {
    const options: TargetOption[] = [
      { name: 'Colour', paramKey: 'colour', valueSlugs: ['red'] },
      { name: 'Trim', paramKey: 'trim', valueSlugs: ['blue'] },
    ]
    expect(carriedChoices([{ optionName: 'Colour', valueSlug: 'blue' }], options)).toEqual([])
  })

  it('gives each builder option one choice, the first to claim it', () => {
    expect(
      carriedChoices(
        [
          { optionName: 'Back', valueSlug: 'low-back' },
          { optionName: 'Back Height', valueSlug: 'high-back' },
        ],
        TARGET_OPTIONS,
      ),
    ).toEqual([['back', 'low-back']])
  })
})

describe('layoutLinkHref', () => {
  it('writes the choices and the layout code the builder page reads', () => {
    const href = layoutLinkHref('/mawsley-modular', TEN, [['upholstery-colour', 'era-rest'], ['back', 'high-back']])
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/mawsley-modular')
    expect(url.searchParams.get('upholstery-colour')).toBe('era-rest')
    expect(url.searchParams.get('back')).toBe('high-back')
    expect(url.searchParams.get('modular-layout')).toBe('left-end-unit.central-unit.central-unit.right-end-unit')
  })

  it('is the bare page with nothing to add', () => {
    expect(layoutLinkHref('/shop/products/sofa', null, [])).toBe('/shop/products/sofa')
  })
})

describe('usableStartingLayouts', () => {
  it('drops a layout naming a unit the builder no longer has, or one that cannot join', () => {
    const gone: StartingLayout = { when: null, valueSlugs: ['left-end-unit', 'corner-unit'] }
    const armToArm: StartingLayout = { when: null, valueSlugs: ['right-end-unit', 'left-end-unit'] }
    expect(usableStartingLayouts([gone, armToArm, TEN], CONFIG)).toEqual([TEN])
  })
})

describe('parseStoredStartingLayouts', () => {
  it('keeps the good entries of a damaged column', () => {
    expect(parseStoredStartingLayouts([ANY, { when: null, valueSlugs: [] }, 'nonsense'])).toEqual([ANY])
    expect(parseStoredStartingLayouts({})).toEqual([])
  })
})

describe('validateLayoutLink', () => {
  const ownOptions = [
    { name: 'Seats', values: [{ slug: '8-seater', label: '8 Seater' }, { slug: '10-seater', label: '10 Seater' }] },
  ]
  const target: LinkTargetForValidation = {
    productId: 'builder',
    config: CONFIG,
    unitLabelBySlug: new Map([['left-end-unit', 'Left End Unit'], ['central-unit', 'Central Unit'], ['right-end-unit', 'Right End Unit']]),
  }
  const link = (startingLayouts: StartingLayout[], targetProductId = 'builder'): LayoutLink => ({
    targetProductId,
    leadText: 'Need a custom layout?',
    linkText: 'Click to create your own layout',
    newTab: true,
    startingLayouts,
  })

  it('accepts a link with a default and per-choice layouts', () => {
    expect(validateLayoutLink(link([ANY, EIGHT, TEN]), 'set', ownOptions, target)).toBeNull()
  })

  it('refuses a product linking to itself, and a target without a builder', () => {
    expect(validateLayoutLink(link([], 'set'), 'set', ownOptions, target)).toMatch(/its own layout builder/)
    expect(validateLayoutLink(link([]), 'set', ownOptions, null)).toMatch(/switched on/)
  })

  it('refuses a condition this product cannot meet, and two layouts for one condition', () => {
    expect(validateLayoutLink(link([{ ...EIGHT, when: { optionName: 'Arms', valueSlug: 'left' } }]), 'set', ownOptions, target)).toMatch(/no option called "Arms"/)
    expect(validateLayoutLink(link([{ ...EIGHT, when: { optionName: 'Seats', valueSlug: '12-seater' } }]), 'set', ownOptions, target)).toMatch(/not one of the Seats choices/)
    expect(validateLayoutLink(link([ANY, ANY]), 'set', ownOptions, target)).toMatch(/two starting layouts for "Whatever is chosen"/)
  })

  it('refuses a layout the builder cannot draw, naming the condition', () => {
    expect(validateLayoutLink(link([{ ...EIGHT, valueSlugs: ['right-end-unit', 'left-end-unit'] }]), 'set', ownOptions, target)).toMatch(/^"Seats: 8 Seater" cannot be built\./)
    expect(validateLayoutLink(link([{ ...ANY, valueSlugs: ['corner-unit'] }]), 'set', ownOptions, target)).toMatch(/corner-unit, which is not set up/)
  })

  it('needs the link to have words', () => {
    expect(LayoutLinkSchema.safeParse({ ...link([]), linkText: '   ' }).success).toBe(false)
  })
})
