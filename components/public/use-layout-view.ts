'use client'

// Everything the card and the builder show about the layout in hand, worked out
// once per change: what it costs, what it is called, how big it is, which
// variation each unit is, and what could join at each open end. Pure derivation
// over the builder's draft and the page's variation payload - no state of its own.
import { useMemo } from 'react'
import { candidatesAtEnd, endPlan, type EndCandidate } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { layoutEntriesExpanded, layoutPieceCount, type ChainEnd, type PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
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

export interface EndView {
  end: ChainEnd
  candidates: EndCandidate[]
  /** The first unit that could go here, drawn as the dashed space; null when nothing fits. */
  ghost: EndCandidate | null
  /** "after Corner Unit" / "before Left Unit" - which neighbour the space is beside. */
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
  ends: Record<ChainEnd, EndView>
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
    const endView = (end: ChainEnd): EndView => {
      const candidates = candidatesAtEnd(placed, end, definitions, limits)
      const neighbour = end === 'end' ? draft.chain[draft.chain.length - 1] : draft.chain[0]
      // At an arm end the new unit goes just inside the arm unit, so the words
      // say where it really goes: before the last unit, after the first.
      const insideArm = Boolean(endPlan(draft.chain, end, definitionsById)?.displacedEntryId)
      const side = end === 'end' ? (insideArm ? 'before' : 'after') : insideArm ? 'after' : 'before'
      const besideText = neighbour ? `${side} ${labelOf(neighbour.pieceId)}` : ''
      return {
        end,
        candidates,
        ghost: candidates.find((candidate) => candidate.refusal === null) ?? null,
        besideText,
      }
    }

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
      ends: { start: endView('start'), end: endView('end') },
    }
  }, [storefront, payload, draft, placed, layoutChoices])
}

/**
 * The dashed spaces a unit can go in, each labelled for a screen reader. An empty
 * layout offers one, in the middle; otherwise each open end offers its own.
 */
export function joinableSpaces(view: LayoutView, isEmpty: boolean): PlanGhost[] {
  return (['start', 'end'] as const).flatMap((end) => {
    const endView = view.ends[end]
    if (!endView.ghost || (end === 'start' && isEmpty)) return []
    const label = isEmpty ? 'Add your first unit' : `Add a unit ${endView.besideText}`
    return [{ end, footprint: endView.ghost.footprint, label }]
  })
}
