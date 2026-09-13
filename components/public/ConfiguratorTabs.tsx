'use client'

// The product page's two ways to buy a modular product: shop the units one at a
// time, or build a layout. Two tabs over two panels.
//
// Both panels stay in the page. The individual panel holds the page's ordinary
// option, price and basket blocks, whose islands have to hydrate and keep in step
// with the shared selection whether or not it is showing - and a search engine
// reading the page still finds the single-unit price in it. Only the tab bar and
// the builder panel opt out of the site's button styling: the individual panel is
// the shop's own blocks and must keep the shop's own look.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ProductTab } from '@/modules/modular-configurator-for-shop/lib/opening-tab'
import { CONFIGURATOR_CSS } from '@/modules/modular-configurator-for-shop/components/public/configurator-css'
import { publishActiveTab } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'

interface ConfiguratorTabsProps {
  /** The product's slug: which tab is open is shared with the gallery by it. */
  slug: string
  buildLabel: string
  individualLabel: string
  openingTab: ProductTab
  build: ReactNode
  individual: ReactNode
}

// Left to right: the units one at a time first, then the layout builder.
const ORDER: readonly ProductTab[] = ['individual', 'build']

export function ConfiguratorTabs({ slug, buildLabel, individualLabel, openingTab, build, individual }: ConfiguratorTabsProps) {
  const [active, setActive] = useState<ProductTab>(openingTab)
  // The gallery shows the layout only while its tab is the open one.
  useEffect(() => {
    publishActiveTab(slug, active)
  }, [slug, active])
  const baseId = useId()
  const tabRefs = useRef<Record<ProductTab, HTMLButtonElement | null>>({ build: null, individual: null })
  const labels: Record<ProductTab, string> = { build: buildLabel, individual: individualLabel }

  const moveWithKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = ORDER.indexOf(active)
    const next =
      event.key === 'ArrowRight' ? ORDER[(index + 1) % ORDER.length]
        : event.key === 'ArrowLeft' ? ORDER[(index + ORDER.length - 1) % ORDER.length]
          : event.key === 'Home' ? ORDER[0]
            : event.key === 'End' ? ORDER[ORDER.length - 1]
              : undefined
    if (!next) return
    event.preventDefault()
    setActive(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="mcf-tabs-root">
      <style dangerouslySetInnerHTML={{ __html: CONFIGURATOR_CSS }} />
      <div className="mcf-tabs" role="tablist" aria-label="How to buy" data-cactus-unstyled="">
        {ORDER.map((tab) => (
          <button
            key={tab}
            ref={(element) => {
              tabRefs.current[tab] = element
            }}
            type="button"
            role="tab"
            id={`${baseId}-${tab}-tab`}
            className="mcf-tab"
            aria-selected={active === tab}
            aria-controls={`${baseId}-${tab}-panel`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            onKeyDown={moveWithKeys}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
      <div
        id={`${baseId}-individual-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-individual-tab`}
        className="mcf-tab-panel"
        hidden={active !== 'individual'}
      >
        {individual}
      </div>
      <div
        id={`${baseId}-build-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-build-tab`}
        className="mcf-tab-panel"
        data-cactus-unstyled=""
        hidden={active !== 'build'}
      >
        {build}
      </div>
    </div>
  )
}
