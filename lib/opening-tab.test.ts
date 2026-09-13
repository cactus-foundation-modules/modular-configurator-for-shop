import { describe, expect, it } from 'vitest'
import { openingTabFor } from '@/modules/modular-configurator-for-shop/lib/opening-tab'

describe('the tab a product page opens on', () => {
  it('opens the builder on a plain visit', () => {
    expect(openingTabFor(null, 'Unit')).toBe('build')
    expect(openingTabFor({}, 'Unit')).toBe('build')
    expect(openingTabFor({ 'upholstery-colour': 'synergy-mix' }, 'Unit')).toBe('build')
  })

  it('opens on the single unit an advert or shared link names', () => {
    expect(openingTabFor({ unit: 'corner-unit', 'upholstery-colour': 'synergy-mix', 'frame-colour': 'black' }, 'Unit')).toBe('individual')
    expect(openingTabFor({ 'seat-module': ['corner'] }, 'Seat Module')).toBe('individual')
  })

  it('lets a layout link win over a unit named beside it', () => {
    expect(openingTabFor({ unit: 'corner-unit', 'modular-layout': 'left-unit.corner-unit' }, 'Unit')).toBe('build')
    expect(openingTabFor({ unit: '' }, 'Unit')).toBe('build')
  })
})
