'use client'

// Everything the card and the builder show about the layout in hand, worked out
// once per change: what it costs, what it is called, how big it is, which
// variation each unit is, and what could join at each open end. Pure derivation
// over the builder's draft and the page's variation payload - no state of its own.
import { useMemo } from 'react'
import {
  candidatesAtEnd,
  candidatesRoundCorner,
  cornerSpaceKey,
  candidatesInFront,
  endPlan,
  FREE_SPACE_KEY,
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
import { canStandFree, chainLimitsBeside, freeUnitEntry, freeUnitSpot, placeFreeUnits } from '@/modules/modular-configurator-for-shop/lib/free-units'
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

/** One space a unit could go in: an open end, in front of a backed unit, or anywhere for one on its own. */
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
    // The chain's units, then the ones standing on their own: the list's order,
    // the plan's numbers and the basket's.
    const freeEntries = draft.free.map(freeUnitEntry)
    const expanded = [...layoutEntriesExpanded(draft.chain), ...freeEntries]
    const labels = expanded.map((entry) => labelOf(entry.pieceId))
    const price = priceLayout(payload, storefront.pieceOptionId, [...draft.chain, ...freeEntries], layoutChoices, draft.unitChoices)
    const definitions = storefront.pieces.map((piece) => piece.definition)
    const definitionsById = new Map(definitions.map((definition) => [definition.pieceId, definition]))
    // The floor the whole lot takes, free units included.
    const footprint = footprintOfLayout([...placed, ...placeFreeUnits(draft.free, definitionsById)])
    const layoutLimits = { maxPieces: storefront.maxPieces, frontUnits: storefront.frontUnits, freeUnits: storefront.freeUnits }
    const limits = chainLimitsBeside(draft.free, layoutLimits)
    const unitCount = layoutPieceCount(draft.chain) + draft.free.length

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
    // Round the corner from a table at either end, where the table can sit in
    // the crook of an L and the next row go off its front.
    const cornerView = (end: ChainEnd): SpaceView[] => {
      const candidates = candidatesRoundCorner(placed, end, definitions, limits)
      const neighbour = end === 'end' ? draft.chain[draft.chain.length - 1] : draft.chain[0]
      if (candidates.length === 0 || !neighbour) return []
      return [{
        key: cornerSpaceKey(end),
        candidates,
        ghost: candidates.find((candidate) => candidate.refusal === null) ?? null,
        besideText: `round the corner from ${labelOf(neighbour.pieceId)}`,
      }]
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

    // Anywhere on the floor, for a unit that makes sense on its own. No dashed
    // space: it goes somewhere clear and the shopper moves it where they like.
    const freeCandidates = storefront.freeUnits ? definitions.filter(canStandFree) : []
    const freeViews: SpaceView[] = freeCandidates.length === 0 ? [] : [{
      key: FREE_SPACE_KEY,
      candidates: freeCandidates.map((definition): EndCandidate => {
        const outline = [
          { x: -definition.widthMm / 2, z: -definition.depthMm / 2 },
          { x: definition.widthMm / 2, z: -definition.depthMm / 2 },
          { x: definition.widthMm / 2, z: definition.depthMm / 2 },
          { x: -definition.widthMm / 2, z: definition.depthMm / 2 },
        ]
        const footprint = { minX: -definition.widthMm / 2, maxX: definition.widthMm / 2, minZ: -definition.depthMm / 2, maxZ: definition.depthMm / 2 }
        return {
          definition,
          pose: { centre: { x: 0, z: 0 }, rotationY: 0 },
          footprint,
          flipped: false,
          space: { outline, footprint },
          refusal: unitCount >= storefront.maxPieces ? 'too-many-pieces' : null,
        }
      }),
      ghost: null,
      besideText: 'on its own',
    }]
    // Free units are written where they stand beside the chain's first unit.
    const anchor = placed[0]?.pose ?? null

    return {
      price,
      labels,
      // Units only standing on their own make no shape of their own.
      shapeLabel: draft.chain.length === 0 && draft.free.length > 0 ? 'Free-standing' : layoutShapeLabel(shapeOfPlaced(placed)),
      footprint,
      footprintText: footprint ? describeFootprint(footprint) : '',
      widthText: footprint ? formatMetres(footprint.widthMm) : '',
      depthText: footprint ? formatMetres(footprint.depthMm) : '',
      countsText: describeUnitCounts(labels),
      arrangementText: describeArrangement(labels),
      unitCountText: unitCountLabel(unitCount),
      code: encodeLayout(
        [...draft.chain.map((entry) => ({
          pieceId: entry.pieceId,
          choices: draft.unitChoices[entry.entryId] ?? {},
          flipped: entry.flipped === true,
          turned: entry.turned === true,
          ...(entry.cornered ? { cornered: entry.cornered } : {}),
          front: entry.frontSpur
            ? {
                pieceId: entry.frontSpur.pieceId,
                choices: draft.unitChoices[entry.frontSpur.entryId] ?? {},
              }
            : undefined,
        })),
        ...draft.free.map((unit) => ({
          pieceId: unit.pieceId,
          choices: draft.unitChoices[unit.entryId] ?? {},
          flipped: false,
          free: freeUnitSpot(unit, anchor),
        }))],
        {
          pieceSlugById: new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.valueSlug])),
          otherOptions: otherOptionsOf(payload, storefront.pieceOptionId),
        },
      ),
      childIdByEntry: new Map(price.units.map((unit) => [unit.entry.entryId, unit.variant?.childProductId ?? null])),
      spaces: [endView('start'), endView('end'), ...cornerView('start'), ...cornerView('end'), ...frontViews, ...freeViews],
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
    const { footprint, outline } = space.ghost.space
    if (space.key !== 'start' && space.key !== 'end' && drawn.some((other) => footprintsOverlap(other, footprint))) return []
    drawn.push(footprint)
    const label = isEmpty ? 'Add your first unit' : `Add a unit ${space.besideText}`
    return [{ key: space.key, footprint, outline, label }]
  })
}
