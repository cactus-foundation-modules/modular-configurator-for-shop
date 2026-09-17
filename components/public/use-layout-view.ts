'use client'

// Everything the card and the builder show about the layout in hand, worked out
// once per change: what it costs, what it is called, how big it is, which
// variation each unit is, and what could join at each open end. Pure derivation
// over the builder's draft and the page's variation payload - no state of its own.
import { useMemo } from 'react'
import {
  candidatesAtEnd,
  candidatesInFront,
  endPlan,
  frontSpaceKey,
  type EndCandidate,
  type SpaceKey,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  footprintsOverlap,
  layoutEntriesExpanded,
  layoutPieceCount,
  type ChainEnd,
  type FloorRectangle,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { encodeLayout } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import {
  describeArrangement,
  describeFootprint,
  describeUnitCounts,
  footprintOfLayout,
  formatMetres,
  layoutShapeLabel,
  shapeOfPlaced,
  unitCountLabel,
  type LayoutFootprint,
} from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { priceLayout, type LayoutPrice } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import type { PlanGhost } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import type { ConfiguratorStorefrontPayload, StorefrontPiece } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { LayoutDraft } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { SvrOptionWithValues, VariantSelectorPayload } from '@/modules/shop-variations/lib/types'

/** One space a unit could go in: an open end, or in front of a backed unit. */
export interface SpaceView {
  key: SpaceKey
  candidates: EndCandidate[]
  /** The first unit that could go here, drawn as the dashed space; null when nothing fits. */
  ghost: EndCandidate | null
  /** "after Corner Unit" / "before Left Unit" / "in front of Chair with Back" - where the space is. */
  besideText: string
}

export interface LayoutView {
  price: LayoutPrice
  labels: string[]
  shapeLabel: string
  footprint: LayoutFootprint | null
  footprintText: string
  widthText: string
  depthText: string
  countsText: string
  arrangementText: string
  unitCountText: string
  code: string
  childIdByEntry: Map<string, string | null>
  /** The two ends first, then the spaces in front of units in list order. */
  spaces: SpaceView[]
}

export function spaceViewFor(view: LayoutView, key: SpaceKey): SpaceView | null {
  return view.spaces.find((space) => space.key === key) ?? null
}

export function pieceLookup(pieces: readonly StorefrontPiece[]): Map<string, StorefrontPiece> {
  return new Map(pieces.map((piece) => [piece.pieceId, piece]))
}

export function otherOptionsOf(payload: VariantSelectorPayload, pieceOptionId: string): SvrOptionWithValues[] {
  return payload.options.filter((option) => option.id !== pieceOptionId)
}

/**
 * The layout's own choices for every option except the unit: what the page has
 * chosen, else the first value any variation is made in. The builder always has
 * something to draw and price, and shows the stand-in as chosen so nothing is
 * bought on a choice the shopper could not see.
 */
export function layoutChoicesFrom(
  payload: VariantSelectorPayload,
  pieceOptionId: string,
  pageChoices: OptionSelection,
): OptionSelection {
  const choices: OptionSelection = {}
  for (const option of otherOptionsOf(payload, pieceOptionId)) {
    const chosen = pageChoices[option.id]
    const madeIn = option.values.find((value) =>
      payload.variants.some((variant) => variant.enabled && variant.optionValueIds.includes(value.id)),
    )
    const pick = chosen ?? madeIn?.id
    if (pick) choices[option.id] = pick
  }
  return choices
}

export function useLayoutView(
  storefront: ConfiguratorStorefrontPayload,
  payload: VariantSelectorPayload | null,
  draft: LayoutDraft,
  placed: readonly PlacedPiece[],
  layoutChoices: OptionSelection,
): LayoutView | null {
  return useMemo(() => {
    if (!payload) return null
    const pieceById = pieceLookup(storefront.pieces)
    const labelOf = (pieceId: string) => pieceById.get(pieceId)?.label ?? 'Unit'
    const expanded = layoutEntriesExpanded(draft.chain)
    const labels = expanded.map((entry) => labelOf(entry.pieceId))
    const price = priceLayout(payload, storefront.pieceOptionId, draft.chain, layoutChoices, draft.unitChoices)
    const footprint = footprintOfLayout(placed)
    const limits = { maxPieces: storefront.maxPieces }
    const definitions = storefront.pieces.map((piece) => piece.definition)

    const definitionsById = new Map(definitions.map((definition) => [definition.pieceId, definition]))
    const endView = (end: ChainEnd): SpaceView => {
      const candidates = candidatesAtEnd(placed, end, definitions, limits)
      const neighbour = end === 'end' ? draft.chain[draft.chain.length - 1] : draft.chain[0]
      // At an arm end the new unit goes just inside the arm unit, so the words
      // say where it really goes: before the last unit, after the first.
      const insideArm = Boolean(endPlan(draft.chain, end, definitionsById)?.displacedEntryId)
      const side = end === 'end' ? (insideArm ? 'before' : 'after') : insideArm ? 'after' : 'before'
      const besideText = neighbour ? `${side} ${labelOf(neighbour.pieceId)}` : ''
      return {
        key: end,
        candidates,
        ghost: candidates.find((candidate) => candidate.refusal === null) ?? null,
        besideText,
      }
    }
    // A space in front of every backed unit that could take a backless one. Only
    // a range with both kinds of straight unit has any. Where two units share a
    // label, the list number says which is meant.
    const hosts = draft.chain.filter((entry) => !entry.frontSpur)
    const frontViews = hosts.flatMap((host): SpaceView[] => {
      const candidates = candidatesInFront(placed, host.entryId, definitions, limits)
      if (candidates.length === 0) return []
      const label = labelOf(host.pieceId)
      const sameLabel = hosts.filter((other) => labelOf(other.pieceId) === label).length > 1
      const number = expanded.findIndex((entry) => entry.entryId === host.entryId) + 1
      return [{
        key: frontSpaceKey(host.entryId),
        candidates,
        ghost: candidates.find((candidate) => candidate.refusal === null) ?? null,
        besideText: sameLabel ? `in front of ${label} (unit ${number})` : `in front of ${label}`,
      }]
    })

    return {
      price,
      labels,
      shapeLabel: layoutShapeLabel(shapeOfPlaced(placed)),
      footprint,
      footprintText: footprint ? describeFootprint(footprint) : '',
      widthText: footprint ? formatMetres(footprint.widthMm) : '',
      depthText: footprint ? formatMetres(footprint.depthMm) : '',
      countsText: describeUnitCounts(labels),
      arrangementText: describeArrangement(labels),
      unitCountText: unitCountLabel(layoutPieceCount(draft.chain)),
      code: encodeLayout(
        draft.chain.map((entry) => ({
          pieceId: entry.pieceId,
          choices: draft.unitChoices[entry.entryId] ?? {},
          flipped: entry.flipped === true,
          turned: entry.turned === true,
          front: entry.frontSpur
            ? {
                pieceId: entry.frontSpur.pieceId,
                choices: draft.unitChoices[entry.frontSpur.entryId] ?? {},
              }
            : undefined,
        })),
        {
          pieceSlugById: new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.valueSlug])),
          otherOptions: otherOptionsOf(payload, storefront.pieceOptionId),
        },
      ),
      childIdByEntry: new Map(price.units.map((unit) => [unit.entry.entryId, unit.variant?.childProductId ?? null])),
      spaces: [endView('start'), endView('end'), ...frontViews],
    }
  }, [storefront, payload, draft, placed, layoutChoices])
}

/**
 * The dashed spaces a unit can go in, each labelled for a screen reader. An empty
 * layout offers one, in the middle; otherwise each open end offers its own, and
 * each backed unit that can take a backless one in front of it offers that. Two
 * front spaces can cover the same floor (in the crook of an L); only the first is
 * drawn, and the other comes back if that one is not used.
 */
export function joinableSpaces(view: LayoutView, isEmpty: boolean): PlanGhost[] {
  const drawn: FloorRectangle[] = []
  return view.spaces.flatMap((space) => {
    if (!space.ghost || (space.key === 'start' && isEmpty)) return []
    const { footprint } = space.ghost
    if (space.key !== 'start' && space.key !== 'end' && drawn.some((other) => footprintsOverlap(other, footprint))) return []
    drawn.push(footprint)
    const label = isEmpty ? 'Add your first unit' : `Add a unit ${space.besideText}`
    return [{ key: space.key, footprint, label }]
  })
}
