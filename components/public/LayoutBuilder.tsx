'use client'

// The live layout builder, as the product page's "Build a layout" tab.
//
// It joins the page's own variation selection (the store the option controls in
// the other tab use, keyed by the product's slug), so a fabric chosen here is
// chosen there and the other way round. Before a layout exists it offers the
// ready-made shapes; choosing one (or "Design your own") starts the builder, and
// only then does the 3D view load. The layout is written into the address bar, so
// the link in hand reopens it.
//
// The view itself normally sits in the product gallery, in place of the main
// photograph (see GalleryLayoutMedia): this publishes what it should draw, and
// taps on it come back here. Only on a page with no gallery to host it does the
// view appear in this tab instead.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChainEnd } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { formatMoney } from '@/modules/shop/lib/money'
import { useVariationSelection } from '@/modules/shop-variations/lib/use-variation-selection'
import type { PackedVariationBootstrap } from '@/modules/shop-variations/lib/variation-bootstrap-pack'
import { placeChain } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { decodeLayout, LAYOUT_PARAM } from '@/modules/modular-configurator-for-shop/lib/layout-code'
import { priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { unitCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import type { ConfiguratorStorefrontPayload } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import { addLayoutToBasket } from '@/modules/modular-configurator-for-shop/components/public/add-layout-to-basket'
import { LayoutWorkspace } from '@/modules/modular-configurator-for-shop/components/public/LayoutWorkspace'
import { PresetStart, type PresetTileView } from '@/modules/modular-configurator-for-shop/components/public/PresetStart'
import { useLayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import { publishLayoutStage, useLayoutStageState, type LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import {
  joinableSpaces,
  layoutChoicesFrom,
  otherOptionsOf,
  pieceLookup,
  useLayoutView,
} from '@/modules/modular-configurator-for-shop/components/public/use-layout-view'

interface LayoutBuilderProps {
  storefront: ConfiguratorStorefrontPayload
  bootstrap: PackedVariationBootstrap
  intro: string
}

export function LayoutBuilder({ storefront, bootstrap, intro }: LayoutBuilderProps) {
  const selection = useVariationSelection(storefront.slug, bootstrap)
  const payload = selection.payload
  const definitions = useMemo(
    () => new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.definition])),
    [storefront.pieces],
  )
  const limits = useMemo(() => ({ maxPieces: storefront.maxPieces }), [storefront.maxPieces])
  const builder = useLayoutBuilder(definitions, limits)
  const { dispatch } = builder
  // "Design your own" opens the builder with nothing in it. A preset or a link
  // opens it by giving it a layout; "Start again" with no layout returns to the
  // shapes, unless the shopper had asked for an empty builder.
  const [designingOwn, setDesigningOwn] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  // Which open end's "add a unit" list is showing. Held here, not in the
  // workspace, because a tap on a dashed space in the gallery opens it too.
  const [pickerEnd, setPickerEnd] = useState<ChainEnd | null>(null)
  const { activeTab, hosts } = useLayoutStageState(storefront.slug)

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

  const presets = useMemo<PresetTileView[]>(() => {
    if (!payload) return []
    return storefront.presets.map((preset, index) => {
      const chain = preset.pieceIds.map((pieceId, position) => ({ entryId: `p${index}-${position}`, pieceId }))
      const price = priceLayout(payload, storefront.pieceOptionId, chain, layoutChoices, {})
      return {
        key: String(index),
        name: preset.name,
        placed: placeChain(chain, definitions),
        unitCountText: unitCountLabel(chain.length),
        priceText: price.total > 0 ? formatMoney(price.total, selection.currencySymbol) : '',
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

  const addToBasket = (layoutQuantity: number, deliveryMeta: Record<string, string>) => {
    if (!view || !view.price.buyable || !payload) return
    const lines = addLayoutToBasket({
      extraMeta: deliveryMeta,
      slug: storefront.slug,
      parentProductId: storefront.parentProductId,
      units: view.price.units,
      shapeLabel: view.shapeLabel,
      arrangement: view.arrangementText,
      code: view.code,
      layoutQuantity,
    })
    const layouts = layoutQuantity === 1 ? 'Your layout is' : `${layoutQuantity} of your layout are`
    setStatusText(`${layouts} in the basket - ${unitCountLabel(builder.draft.chain.length * layoutQuantity)} across ${lines === 1 ? '1 line' : `${lines} lines`}.`)
  }

  const started = designingOwn || builder.draft.chain.length > 0
  const isEmpty = builder.draft.chain.length === 0
  const ghosts = useMemo(() => (view ? joinableSpaces(view, isEmpty) : []), [view, isEmpty])

  const selectUnit = useCallback(
    (entryId: string | null) => {
      setPickerEnd(null)
      dispatch({ type: 'select', entryId })
    },
    [dispatch],
  )
  const openPicker = useCallback(
    (end: ChainEnd) => {
      dispatch({ type: 'select', entryId: null })
      setPickerEnd(end)
    },
    [dispatch],
  )

  // What the layout view draws, published for the gallery (or the inline view)
  // to pick up. Null until a layout is started: before that the gallery keeps
  // its photographs and offers no layout thumbnail.
  const snapshot = useMemo<LayoutStageSnapshot | null>(() => {
    if (!started || !view) return null
    return {
      revision: builder.editCount,
      wanted: activeTab !== 'individual',
      parentProductId: storefront.parentProductId,
      look: storefront.viewer,
      placed: builder.placed,
      pieceById,
      childIdByEntry: view.childIdByEntry,
      ghosts,
      selectedEntryId: builder.selectedEntryId,
      widthText: view.widthText,
      depthText: view.depthText,
      summaryText: isEmpty ? 'Tap the + to place your first unit' : `${view.shapeLabel} · ${view.unitCountText} · ${view.footprintText}`,
      arrangementText: view.arrangementText,
      isEmpty,
      labelFor,
      onSelectUnit: selectUnit,
      onPickGhost: openPicker,
    }
  }, [started, view, builder.editCount, builder.placed, builder.selectedEntryId, activeTab, storefront, pieceById, ghosts, isEmpty, labelFor, selectUnit, openPicker])

  useEffect(() => {
    publishLayoutStage(storefront.slug, snapshot)
  }, [storefront.slug, snapshot])
  useEffect(() => () => publishLayoutStage(storefront.slug, null), [storefront.slug])

  if (!started || !payload || !view || !snapshot) {
    return (
      <PresetStart
        intro={intro}
        labelFor={labelFor}
        presets={presets}
        pricesInText={pricesInText}
        onStartPreset={(key) => {
          const preset = storefront.presets[Number(key)]
          if (!preset) return
          dispatch({ type: 'start-from', pieceIds: preset.pieceIds, byShopper: true })
          setStatusText(null)
        }}
        onDesignOwn={() => {
          setStatusText(null)
          setPickerEnd(null)
          setDesigningOwn(true)
        }}
      />
    )
  }

  return (
    <LayoutWorkspace
      storefront={storefront}
      payload={payload}
      currencySymbol={selection.currencySymbol}
      priceSuffix={selection.priceSuffix}
      builder={builder}
      view={view}
      snapshot={snapshot}
      viewInGallery={hosts > 0}
      pickerEnd={pickerEnd}
      onOpenPicker={openPicker}
      onClosePicker={() => setPickerEnd(null)}
      onSelectUnit={selectUnit}
      layoutChoices={layoutChoices}
      statusText={statusText}
      onChooseLayoutValue={(optionId, valueId) => {
        setStatusText(null)
        selection.setOption(optionId, valueId)
      }}
      onReset={() => {
        setPickerEnd(null)
        setStatusText(null)
        setDesigningOwn(false)
        dispatch({ type: 'clear' })
      }}
      onResetLayout={() => {
        setPickerEnd(null)
        setStatusText(null)
        setDesigningOwn(true)
        dispatch({ type: 'clear' })
      }}
      showShapes={!designingOwn}
      onAddToBasket={addToBasket}
    />
  )
}
