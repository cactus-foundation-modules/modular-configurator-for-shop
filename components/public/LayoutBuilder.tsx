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
import { chainFromUnits, spaceOfKey, type SpaceKey } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { formatMoney } from '@/modules/shop/lib/money'
import { taxViewAmounts, type ProductTaxView } from '@/modules/shop/lib/tax-view-shared'
import { useVariationSelection } from '@/modules/shop-variations/lib/use-variation-selection'
import type { PackedVariationBootstrap } from '@/modules/shop-variations/lib/variation-bootstrap-pack'
import { layoutPieceCount, placeLayout } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
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

// A preset tile's price on each side of tax, for the shopper's VAT switch.
function presetPriceSides(total: number, taxView: ProductTaxView, currencySymbol: string): NonNullable<PresetTileView['priceSides']> {
  const amounts = taxViewAmounts(total, taxView)
  return {
    defaultSide: taxView.defaultSide,
    ex: formatMoney(amounts.ex, currencySymbol),
    inc: formatMoney(amounts.inc, currencySymbol),
  }
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
  // Which space's "add a unit" list is showing - an open end, or in front of a
  // unit. Held here, not in the workspace, because a tap on a dashed space in the
  // gallery opens it too.
  const [pickerSpace, setPickerSpace] = useState<SpaceKey | null>(null)
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
    if (decoded) dispatch({ type: 'start-from', units: decoded.units, byShopper: false })
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

  const taxView = selection.taxView
  const presets = useMemo<PresetTileView[]>(() => {
    if (!payload) return []
    return storefront.presets.map((preset, index) => {
      const chain = chainFromUnits(preset.units, `p${index}-`)
      const price = priceLayout(payload, storefront.pieceOptionId, chain, layoutChoices, {})
      return {
        key: String(index),
        name: preset.name,
        placed: placeLayout(chain, definitions),
        unitCountText: unitCountLabel(layoutPieceCount(chain)),
        priceText: price.total > 0 ? formatMoney(price.total, selection.currencySymbol) : '',
        // Both sides of tax where the shopper's VAT switch is on (shop's
        // lib/tax-view-shared.ts), so a tile follows it like every other price.
        ...(price.total > 0 && taxView ? { priceSides: presetPriceSides(price.total, taxView, selection.currencySymbol) } : {}),
      }
    })
  }, [payload, storefront.presets, storefront.pieceOptionId, layoutChoices, definitions, selection.currencySymbol, taxView])

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
    setStatusText(`${layouts} in the basket - ${unitCountLabel(view.price.units.length * layoutQuantity)} across ${lines === 1 ? '1 line' : `${lines} lines`}.`)
  }

  const started = designingOwn || builder.draft.chain.length > 0
  const isEmpty = builder.draft.chain.length === 0
  const ghosts = useMemo(() => (view ? joinableSpaces(view, isEmpty) : []), [view, isEmpty])

  const selectUnit = useCallback(
    (entryId: string | null) => {
      setPickerSpace(null)
      dispatch({ type: 'select', entryId })
    },
    [dispatch],
  )
  const openPicker = useCallback(
    (key: SpaceKey) => {
      dispatch({ type: 'select', entryId: null })
      setPickerSpace(key)
    },
    [dispatch],
  )
  const removeUnit = useCallback(
    (entryId: string) => {
      setPickerSpace(null)
      dispatch({ type: 'remove', entryId })
      dispatch({ type: 'select', entryId: null })
    },
    [dispatch],
  )
  const addUnit = useCallback(
    (key: SpaceKey, pieceId: string) => {
      const space = spaceOfKey(key)
      if (space.kind === 'end') {
        // The end stays open for the next unit: a row is usually laid several at a go.
        dispatch({ type: 'add', end: space.end, pieceId })
        setPickerSpace(key)
        return
      }
      // A unit in front fills its space, so there is nothing left to pick for it.
      dispatch({ type: 'add-front-spur', hostEntryId: space.hostEntryId, pieceId, select: false })
      setPickerSpace(null)
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
      summaryWithSizesOnly: !isEmpty && storefront.viewSummary === 'with-sizes',
      arrangementText: view.arrangementText,
      isEmpty,
      labelFor,
      onSelectUnit: selectUnit,
      onPickGhost: openPicker,
      onRemoveUnit: removeUnit,
    }
  }, [started, view, builder.editCount, builder.placed, builder.selectedEntryId, activeTab, storefront, pieceById, ghosts, isEmpty, labelFor, selectUnit, openPicker, removeUnit])

  useEffect(() => {
    publishLayoutStage(storefront.slug, snapshot)
  }, [storefront.slug, snapshot])
  useEffect(() => () => publishLayoutStage(storefront.slug, null), [storefront.slug])

  // The layout a reset just cleared, if there is one to go back to. The Undo
  // button lives in the workspace, so without this a reset that lands on the
  // shapes would throw a twelve-unit layout away for good.
  const clearedLayout = builder.history[builder.history.length - 1]
  const canReturnToLayout = isEmpty && (clearedLayout?.chain.length ?? 0) > 0

  if (!started || !payload || !view || !snapshot) {
    return (
      <PresetStart
        intro={intro}
        labelFor={labelFor}
        presets={presets}
        pricesInText={pricesInText}
        onBackToLayout={canReturnToLayout ? () => {
          setStatusText(null)
          dispatch({ type: 'undo' })
        } : undefined}
        onStartPreset={(key) => {
          const preset = storefront.presets[Number(key)]
          if (!preset) return
          dispatch({
            type: 'start-from',
            units: preset.units.map((unit) => ({
              pieceId: unit.pieceId,
              ...(unit.flipped ? { flipped: true } : {}),
              ...(unit.turned ? { turned: true } : {}),
              ...(unit.frontPieceId ? { front: { pieceId: unit.frontPieceId } } : {}),
            })),
            byShopper: true,
          })
          setStatusText(null)
        }}
        onDesignOwn={() => {
          setStatusText(null)
          setPickerSpace(null)
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
      taxView={taxView}
      builder={builder}
      view={view}
      snapshot={snapshot}
      viewInGallery={hosts > 0}
      pickerSpace={pickerSpace}
      onOpenPicker={openPicker}
      onClosePicker={() => setPickerSpace(null)}
      onAddUnit={addUnit}
      onSelectUnit={selectUnit}
      layoutChoices={layoutChoices}
      statusText={statusText}
      onChooseLayoutValue={(optionId, valueId) => {
        setStatusText(null)
        selection.setOption(optionId, valueId)
      }}
      onReset={() => {
        setPickerSpace(null)
        setStatusText(null)
        setDesigningOwn(false)
        dispatch({ type: 'clear' })
      }}
      onResetLayout={() => {
        setPickerSpace(null)
        setStatusText(null)
        // Back to the shapes, the same place "Reset options" goes: a shopper who
        // clears a layout is starting again, and starting again is where the
        // ready-made shapes are offered. Only a product with no shapes to offer
        // goes straight to an empty builder, where "Design your own" would be the
        // only tile on the screen.
        setDesigningOwn(storefront.presets.length === 0)
        dispatch({ type: 'clear' })
      }}
      onAddToBasket={addToBasket}
    />
  )
}
