'use client'

// How the builder in the purchase column and the view in the product gallery
// talk to each other.
//
// Pattern: a tiny per-page store keyed by product slug, read with
// useSyncExternalStore - the same no-common-ancestor problem shop-variations
// solves for its option islands. The builder publishes what the view should show
// (the placed units, the joinable spaces, the selection, and callbacks back into
// the builder); the tabs publish which tab is open; the gallery's contributed
// thumbnail says it is there to host the view. Nothing here decides anything -
// it only carries state between islands that cannot pass props to each other.
import { useSyncExternalStore } from 'react'
import type { ChainEnd, PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { ProductTab } from '@/modules/modular-configurator-for-shop/lib/opening-tab'
import type { StorefrontPiece, StorefrontViewerLook } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { PlanGhost } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'

/** Everything the layout view draws, and how it reports back to the builder. */
export interface LayoutStageSnapshot {
  /** Bumps on every edit to the layout, so a host can bring the view back into sight. */
  revision: number
  /** True while a layout is started and the builder's tab is the open one. */
  wanted: boolean
  parentProductId: string
  look: StorefrontViewerLook
  placed: readonly PlacedPiece[]
  pieceById: ReadonlyMap<string, StorefrontPiece>
  childIdByEntry: ReadonlyMap<string, string | null>
  ghosts: readonly PlanGhost[]
  selectedEntryId: string | null
  widthText: string
  depthText: string
  /** "L-shape · 5 units · 2.21 m wide × 2.21 m deep", or a prompt while empty. */
  summaryText: string
  arrangementText: string
  isEmpty: boolean
  labelFor: (pieceId: string) => string
  onSelectUnit: (entryId: string | null) => void
  onPickGhost: (end: ChainEnd) => void
  onRemoveUnit: (entryId: string) => void
}

export interface LayoutStageState {
  snapshot: LayoutStageSnapshot | null
  activeTab: ProductTab | null
  /** How many gallery hosts are mounted for this product (normally one). */
  hosts: number
}

interface Entry {
  state: LayoutStageState
  listeners: Set<() => void>
}

const EMPTY_STATE: LayoutStageState = { snapshot: null, activeTab: null, hosts: 0 }
const entries = new Map<string, Entry>()

function entryFor(slug: string): Entry {
  let entry = entries.get(slug)
  if (!entry) {
    entry = { state: EMPTY_STATE, listeners: new Set() }
    entries.set(slug, entry)
  }
  return entry
}

function update(slug: string, change: (state: LayoutStageState) => LayoutStageState): void {
  const entry = entryFor(slug)
  const next = change(entry.state)
  if (next === entry.state) return
  entry.state = next
  for (const listener of entry.listeners) listener()
}

export function publishLayoutStage(slug: string, snapshot: LayoutStageSnapshot | null): void {
  update(slug, (state) => ({ ...state, snapshot }))
}

export function publishActiveTab(slug: string, activeTab: ProductTab): void {
  update(slug, (state) => (state.activeTab === activeTab ? state : { ...state, activeTab }))
}

/** A gallery host arrives; returns its departure, for an effect's clean-up. */
export function registerStageHost(slug: string): () => void {
  update(slug, (state) => ({ ...state, hosts: state.hosts + 1 }))
  return () => update(slug, (state) => ({ ...state, hosts: Math.max(0, state.hosts - 1) }))
}

export function useLayoutStageState(slug: string): LayoutStageState {
  return useSyncExternalStore(
    (listener) => {
      const entry = entryFor(slug)
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
    () => entryFor(slug).state,
    () => EMPTY_STATE,
  )
}
