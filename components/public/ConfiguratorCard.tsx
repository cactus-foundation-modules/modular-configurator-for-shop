'use client'

// The live layout builder on a product page: the card in the purchase area, the
// layout the shopper is building, and the workspace it opens.
//
// It joins the page's own variation selection (the same store the option
// controls beside it use, keyed by the product's slug), so a fabric chosen in the
// builder is chosen on the page and the other way round. The layout lives here,
// not in the workspace, so closing the builder keeps it; and it is written into
// the address bar, so the link in hand reopens it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useVariationSelection } from '@/modules/shop-variations/lib/use-variation-selection'
import type { PackedVariationBootstrap } from '@/modules/shop-variations/lib/variation-bootstrap-pack'
import { placeChain } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { decodeLayout, LAYOUT_PARAM } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import { priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { unitCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { unitProblemSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'
import type { ConfiguratorStorefrontPayload } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import { addLayoutToBasket } from '@/modules/modular-configurator-for-shop/components/public/add-layout-to-basket'
import { ConfiguratorCardView, type CardPresetView, type CardSummaryView } from '@/modules/modular-configurator-for-shop/components/public/ConfiguratorCardView'
import { LayoutWorkspace } from '@/modules/modular-configurator-for-shop/components/public/LayoutWorkspace'
import { useLayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import {
  layoutChoicesFrom,
  otherOptionsOf,
  pieceLookup,
  useLayoutView,
} from '@/modules/modular-configurator-for-shop/components/public/use-layout-view'

interface ConfiguratorCardProps {
  storefront: ConfiguratorStorefrontPayload
  bootstrap: PackedVariationBootstrap
  heading: string
  intro: string
}

export function ConfiguratorCard({ storefront, bootstrap, heading, intro }: ConfiguratorCardProps) {
  const selection = useVariationSelection(storefront.slug, bootstrap)
  const payload = selection.payload
  const definitions = useMemo(
    () => new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.definition])),
    [storefront.pieces],
  )
  const limits = useMemo(() => ({ maxPieces: storefront.maxPieces }), [storefront.maxPieces])
  const builder = useLayoutBuilder(definitions, limits)
  const { dispatch } = builder
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)

  const pieceById = useMemo(() => pieceLookup(storefront.pieces), [storefront.pieces])
  const labelFor = useCallback((pieceId: string) => pieceById.get(pieceId)?.label ?? 'Unit', [pieceById])

  // The page's picks for everything but the unit, as one stable key, so the
  // layout's choices are only rebuilt when one of those actually changes (the
  // selection object itself is a fresh one on every render).
  const pageChoiceKey = payload
    ? otherOptionsOf(payload, storefront.pieceOptionId).map((option) => selection.optionValues[option.id] ?? '').join('|')
    : ''
  const layoutChoices = useMemo(() => {
    if (!payload) return {}
    const picked = pageChoiceKey.split('|')
    const pageChoices: Record<string, string> = {}
    otherOptionsOf(payload, storefront.pieceOptionId).forEach((option, index) => {
      const valueId = picked[index]
      if (valueId) pageChoices[option.id] = valueId
    })
    return layoutChoicesFrom(payload, storefront.pieceOptionId, pageChoices)
  }, [payload, storefront.pieceOptionId, pageChoiceKey])
  const view = useLayoutView(storefront, payload, builder.draft, builder.placed, layoutChoices)

  // Reopen a layout from the address bar once, when the page arrives with one.
  // Once only: every later edit is the shopper's, not the link's.
  const restoredFromLink = useRef(false)
  useEffect(() => {
    if (!payload || restoredFromLink.current) return
    restoredFromLink.current = true
    const code = new URL(window.location.href).searchParams.get(LAYOUT_PARAM)
    if (!code) return
    const decoded = decodeLayout(code, {
      pieceSlugById: new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.valueSlug])),
      otherOptions: otherOptionsOf(payload, storefront.pieceOptionId),
    })
    if (decoded) dispatch({ type: 'start-from', pieceIds: decoded.pieceIds, unitChoices: decoded.unitChoices, byShopper: false })
  }, [payload, storefront.pieces, storefront.pieceOptionId, dispatch])

  // Keep the address bar in step with the shopper's edits (never before one).
  const code = view?.code ?? ''
  useEffect(() => {
    if (builder.editCount === 0) return
    try {
      const url = new URL(window.location.href)
      if (code) url.searchParams.set(LAYOUT_PARAM, code)
      else url.searchParams.delete(LAYOUT_PARAM)
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
    } catch {
      // An address bar we cannot rewrite costs the shareable link, nothing else.
    }
  }, [builder.editCount, code])

  const money = (amount: number) => formatMoney(amount, selection.currencySymbol)

  const presets = useMemo<CardPresetView[]>(() => {
    if (!payload) return []
    return storefront.presets.map((preset, index) => {
      const chain = preset.pieceIds.map((pieceId, position) => ({ entryId: `p${index}-${position}`, pieceId }))
      const price = priceLayout(payload, storefront.pieceOptionId, chain, layoutChoices, {})
      return {
        key: String(index),
        name: preset.name,
        placed: placeChain(chain, definitions),
        unitCountText: unitCountLabel(chain.length),
        priceText: price.buyable || price.total > 0 ? formatMoney(price.total, selection.currencySymbol) : '',
      }
    })
  }, [payload, storefront.presets, storefront.pieceOptionId, layoutChoices, definitions, selection.currencySymbol])

  const pricesInText = useMemo(() => {
    if (!payload) return ''
    const names = otherOptionsOf(payload, storefront.pieceOptionId).flatMap((option) => {
      const value = option.values.find((candidate) => candidate.id === layoutChoices[option.id])
      return value ? [value.label] : []
    })
    return names.length > 0 ? `Prices shown in ${names.join(', ')}` : ''
  }, [payload, storefront.pieceOptionId, layoutChoices])

  const summary: CardSummaryView | null =
    view && builder.draft.chain.length > 0
      ? {
          placed: builder.placed,
          shapeText: `${view.shapeLabel} · ${view.unitCountText}`,
          detailText: [view.footprintText, view.countsText].filter(Boolean).join(' · '),
          priceText: money(view.price.total),
          priceNote: selection.priceSuffix,
          retailText: view.price.retailTotal !== null ? `RRP ${money(view.price.retailTotal)}` : null,
          problemText: (() => {
            const first = view.price.units.find((unit) => unit.problem !== null)
            return first?.problem ? `Unit ${builder.draft.chain.indexOf(first.entry) + 1}: ${unitProblemSentence(first.problem)}` : null
          })(),
        }
      : null

  const addToBasket = (layoutQuantity: number) => {
    if (!view || !view.price.buyable || !payload) return
    const lines = addLayoutToBasket({
      slug: storefront.slug,
      parentProductId: storefront.parentProductId,
      units: view.price.units,
      shapeLabel: view.shapeLabel,
      arrangement: view.arrangementText,
      code: view.code,
      layoutQuantity,
    })
    setWorkspaceOpen(false)
    const layouts = layoutQuantity === 1 ? 'Your layout is' : `${layoutQuantity} of your layout are`
    setStatusText(`${layouts} in the basket - ${unitCountLabel(builder.draft.chain.length * layoutQuantity)} across ${lines === 1 ? '1 line' : `${lines} lines`}.`)
  }

  return (
    <>
      <ConfiguratorCardView
        heading={heading}
        intro={intro}
        labelFor={labelFor}
        presets={presets}
        pricesInText={pricesInText}
        summary={summary}
        statusText={statusText}
        onStartPreset={(key) => {
          const preset = storefront.presets[Number(key)]
          if (!preset) return
          dispatch({ type: 'start-from', pieceIds: preset.pieceIds, byShopper: true })
          setStatusText(null)
          setWorkspaceOpen(true)
        }}
        onDesignOwn={() => {
          setStatusText(null)
          setWorkspaceOpen(true)
        }}
        onEdit={() => {
          setStatusText(null)
          setWorkspaceOpen(true)
        }}
        onAddToBasket={() => addToBasket(1)}
        onStartAgain={() => {
          setStatusText(null)
          dispatch({ type: 'clear' })
        }}
      />
      {payload && view ? (
        <LayoutWorkspace
          open={workspaceOpen}
          onClose={() => setWorkspaceOpen(false)}
          storefront={storefront}
          payload={payload}
          currencySymbol={selection.currencySymbol}
          priceSuffix={selection.priceSuffix}
          builder={builder}
          view={view}
          layoutChoices={layoutChoices}
          onChooseLayoutValue={(optionId, valueId) => selection.setOption(optionId, valueId)}
          onAddToBasket={addToBasket}
        />
      ) : null}
    </>
  )
}
