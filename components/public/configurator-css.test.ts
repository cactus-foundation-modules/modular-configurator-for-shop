import { describe, expect, it } from 'vitest'
import { CONFIGURATOR_CSS } from '@/modules/modular-configurator-for-shop/components/public/configurator-css'

describe('modular configurator storefront styles', () => {
  it('pins the fallback layout preview over the product tab strip', () => {
    expect(CONFIGURATOR_CSS).toContain('.mcf-sticky-view.svr-mstick')
    expect(CONFIGURATOR_CSS).toContain('top:var(--spd-header-h,96px)')
    expect(CONFIGURATOR_CSS).not.toContain('--spd-tabnav-h')
  })

  it('drops the layout summary box from the pinned fallback view', () => {
    expect(CONFIGURATOR_CSS).toContain('.mcf-sticky-view.svr-mstick .mcf-stage-caption{display:none}')
  })
})
