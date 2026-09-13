import { describe, expect, it } from 'vitest'
import { openingTabFor } from '@/modules/modular-configurator-for-shop/lib/opening-tab'

describe('the tab a product page opens on', () => {
  it('opens on the individual items, whatever else the address says', () => {
    expect(openingTabFor(null)).toBe('individual')
    expect(openingTabFor({})).toBe('individual')
    expect(openingTabFor({ unit: 'corner-unit', 'upholstery-colour': 'synergy-mix', 'frame-colour': 'black' })).toBe('individual')
    expect(openingTabFor({ 'modular-layout': '' })).toBe('individual')
  })

  it('opens the builder for a layout link', () => {
    expect(openingTabFor({ 'modular-layout': 'left-unit.corner-unit' })).toBe('build')
    expect(openingTabFor({ unit: 'corner-unit', 'modular-layout': ['left-unit.corner-unit'] })).toBe('build')
  })
})
