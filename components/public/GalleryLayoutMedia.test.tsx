// @vitest-environment jsdom
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GalleryLayoutThumbs, LAYOUT_ITEM_KEY } from '@/modules/modular-configurator-for-shop/components/public/GalleryLayoutMedia'
import { publishLayoutStage, type LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { P3D_CONFIG_DEFAULTS } from '@/modules/product-3d-views-for-shop/lib/config-shared'

// The gallery owns its stage; the layout thumbnail only asks for it. These pin
// when it asks and when it gives the stage back - get either wrong and the
// shopper's photograph is snatched away, or the layout is left up in the wrong tab.

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const SLUG = 'gallery-test-product'

function snapshot(revision: number, wanted: boolean): LayoutStageSnapshot {
  return {
    revision,
    wanted,
    parentProductId: 'parent',
    look: P3D_CONFIG_DEFAULTS,
    placed: [],
    movableEntryIds: new Set(),
    pieceById: new Map(),
    childIdByEntry: new Map(),
    ghosts: [],
    selectedEntryId: null,
    widthText: '',
    depthText: '',
    summaryText: '',
    summaryWithSizesOnly: false,
    arrangementText: '',
    isEmpty: true,
    labelFor: () => 'Unit',
    onSelectUnit: () => {},
    onPickGhost: () => {},
    onRemoveUnit: () => {},
    canMoveUnitTo: () => true,
    onMoveUnit: () => true,
  }
}

/** What the stand-in gallery is showing, and how a test clicks a photograph on it. */
const host: { stage: string | null; showPhoto: () => void } = { stage: null, showPhoto: () => {} }

/** Stands in for the product gallery: holds the stage and lets a "photo click" clear it. */
function Gallery() {
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => {
    host.stage = picked
    host.showPhoto = () => setPicked(null)
  })
  return (
    <GalleryLayoutThumbs
      payload={{ slug: SLUG }}
      activeProductId={null}
      activeKey={picked}
      onPick={setPicked}
      thumbClass="thumb"
      thumbOnClass="thumb on"
    />
  )
}

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  act(() => publishLayoutStage(SLUG, null))
  root = null
})

function mount(): HTMLDivElement {
  const container = document.createElement('div')
  root = createRoot(container)
  act(() => root?.render(<Gallery />))
  return container
}

describe('the layout in the product gallery', () => {
  it('offers nothing until a layout is started', () => {
    const container = mount()
    expect(container.innerHTML).toBe('')
    expect(host.stage).toBeNull()
  })

  it('takes the stage when a layout starts, and adds its thumbnail to the strip', () => {
    const container = mount()
    act(() => publishLayoutStage(SLUG, snapshot(1, true)))
    expect(host.stage).toBe(LAYOUT_ITEM_KEY)
    expect(container.querySelector('[aria-label="Show your layout in 3D"]')).not.toBeNull()
  })

  it('leaves a photograph the shopper clicked alone until they change the layout', () => {
    mount()
    act(() => publishLayoutStage(SLUG, snapshot(1, true)))
    act(() => host.showPhoto())
    act(() => publishLayoutStage(SLUG, { ...snapshot(1, true), selectedEntryId: 'u1' }))
    expect(host.stage).toBeNull()
    act(() => publishLayoutStage(SLUG, snapshot(2, true)))
    expect(host.stage).toBe(LAYOUT_ITEM_KEY)
  })

  it('hands the stage back when the shopper switches to the individual items', () => {
    const container = mount()
    act(() => publishLayoutStage(SLUG, snapshot(1, true)))
    act(() => publishLayoutStage(SLUG, snapshot(1, false)))
    expect(host.stage).toBeNull()
    expect(container.innerHTML).toBe('')
    act(() => publishLayoutStage(SLUG, snapshot(1, true)))
    expect(host.stage).toBe(LAYOUT_ITEM_KEY)
  })
})
