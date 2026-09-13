'use client'

// The product page's two ways to buy a modular product: build a layout, or shop
// the units one at a time. Two tabs over two panels.
//
// Both panels stay in the page. The individual panel holds the page's ordinary
// option, price and basket blocks, whose islands have to hydrate and keep in step
// with the shared selection whether or not it is showing - and a search engine
// reading the page still finds the single-unit price in it. Only the tab bar and
// the builder panel opt out of the site's button styling: the individual panel is
// the shop's own blocks and must keep the shop's own look.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ProductTab } from '@/modules/modular-configurator-for-shop/lib/opening-tab'
import { CONFIGURATOR_CSS } from '@/modules/modular-configurator-for-shop/components/public/configurator-css'

interface ConfiguratorTabsProps {
  buildLabel: string
  individualLabel: string
  openingTab: ProductTab
  build: ReactNode
  individual: ReactNode
}

const ORDER: readonly ProductTab[] = ['build', 'individual']

export function ConfiguratorTabs({ buildLabel, individualLabel, openingTab, build, individual }: ConfiguratorTabsProps) {
  const [active, setActive] = useState<ProductTab>(openingTab)
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
        id={`${baseId}-build-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-build-tab`}
        className="mcf-tab-panel"
        data-cactus-unstyled=""
        hidden={active !== 'build'}
      >
        {build}
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
    </div>
  )
}
