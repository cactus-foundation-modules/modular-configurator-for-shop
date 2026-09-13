'use client'

// The layout builder's controls, laid out down the product page's purchase
// column: what to add and why not, the units in order and the selected one,
// starting shapes, the layout's own options, and the price with the add button
// last - the same order, and the same look, as the individual tab's price,
// delivery box and buy row.
//
// The view of the layout normally lives in the product gallery; it is drawn here
// only when the page has no gallery to host it. This owns how many layouts and the
// delivery choice - the layout, the selection and the open picker belong to
// LayoutBuilder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { swapOptions } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { refusalSentence, unitProblemSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'
import type { ConfiguratorStorefrontPayload } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { VariantSelectorPayload } from '@/modules/shop-variations/lib/types'
import type { ChainEnd } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { LayoutStageView } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageView'
import { OptionChoices } from '@/modules/modular-configurator-for-shop/components/public/OptionChoices'
import { PiecePicker } from '@/modules/modular-configurator-for-shop/components/public/PiecePicker'
import { UnitEditor } from '@/modules/modular-configurator-for-shop/components/public/UnitEditor'
import { LayoutDeliveryPicker } from '@/modules/modular-configurator-for-shop/components/public/LayoutDeliveryPicker'
import { useLayoutDelivery } from '@/modules/modular-configurator-for-shop/components/public/use-layout-delivery'
import { deliveryLinesFor } from '@/modules/modular-configurator-for-shop/lib/layout-delivery'
import type { useLayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import { otherOptionsOf, pieceLookup, type LayoutView } from '@/modules/modular-configurator-for-shop/components/public/use-layout-view'

type LayoutBuilderState = ReturnType<typeof useLayoutBuilder>

interface LayoutWorkspaceProps {
  storefront: ConfiguratorStorefrontPayload
  payload: VariantSelectorPayload
  currencySymbol: string
  priceSuffix: string
  builder: LayoutBuilderState
  view: LayoutView
  snapshot: LayoutStageSnapshot
  /** True when the product gallery is showing the layout, so no view is drawn here. */
  viewInGallery: boolean
  pickerEnd: ChainEnd | null
  onOpenPicker: (end: ChainEnd) => void
  onClosePicker: () => void
  onSelectUnit: (entryId: string | null) => void
  layoutChoices: OptionSelection
  statusText: string | null
  onChooseLayoutValue: (optionId: string, valueId: string) => void
  /** Starts the layout again, back to the shapes. */
  onReset: () => void
  /** `deliveryMeta` is the shopper's delivery choice as line meta, or empty for the basket's own. */
  onAddToBasket: (layoutQuantity: number, deliveryMeta: Record<string, string>) => void
}

const MAX_LAYOUT_QUANTITY = 20

export function LayoutWorkspace({
  storefront,
  payload,
  currencySymbol,
  priceSuffix,
  builder,
  view,
  snapshot,
  viewInGallery,
  pickerEnd,
  onOpenPicker,
  onClosePicker,
  onSelectUnit,
  layoutChoices,
  statusText,
  onChooseLayoutValue,
  onReset,
  onAddToBasket,
}: LayoutWorkspaceProps) {
  const [layoutQuantity, setLayoutQuantity] = useState(1)
  const [deliveryChoice, setDeliveryChoice] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const { draft, selectedEntryId, refusal, dispatch, canUndo } = builder
  const pieceById = useMemo(() => pieceLookup(storefront.pieces), [storefront.pieces])
  const definitions = useMemo(
    () => new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.definition])),
    [storefront.pieces],
  )
  const otherOptions = useMemo(() => otherOptionsOf(payload, storefront.pieceOptionId), [payload, storefront.pieceOptionId])
  const labelFor = (pieceId: string) => pieceById.get(pieceId)?.label ?? 'Unit'
  const money = (amount: number) => formatMoney(amount, currencySymbol)

  // A space tapped in the gallery opens its list down here, possibly out of
  // sight on a phone - so bring it into view whenever one opens.
  useEffect(() => {
    if (pickerEnd) pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pickerEnd])

  const priceOfPieceAlone = (pieceId: string): number | null =>
    priceLayout(payload, storefront.pieceOptionId, [{ entryId: 'probe', pieceId }], layoutChoices, {}).units[0]?.variant?.price ?? null

  const layoutValueProblem = (optionId: string, valueId: string): string | null => {
    if (draft.chain.length === 0) return null
    const trial = priceLayout(payload, storefront.pieceOptionId, draft.chain, { ...layoutChoices, [optionId]: valueId }, draft.unitChoices)
    return trial.units.some((unit) => unit.problem === 'unavailable') ? 'not made for every unit in this layout' : null
  }

  const isEmpty = draft.chain.length === 0

  // One layout's variations and how many of each - what the basket is asked
  // about for delivery. Only once every unit is a real variation.
  const units = view.price.units
  const deliveryLines = useMemo(() => deliveryLinesFor(units), [units])
  const { delivery } = useLayoutDelivery(deliveryLines, deliveryChoice, currencySymbol)
  // Written onto the lines only when the shopper picked something other than what
  // the basket would pick anyway - a default nobody chose is not a choice to freeze.
  const deliveryMeta = useMemo<Record<string, string>>(
    () => (delivery && delivery.control.value !== delivery.defaultValue ? { [delivery.metaKey]: delivery.control.value } : {}),
    [delivery],
  )

  const selectedIndex = draft.chain.findIndex((entry) => entry.entryId === selectedEntryId)
  const selectedEntry = selectedIndex >= 0 ? draft.chain[selectedIndex] : undefined
  const pickerView = pickerEnd ? view.ends[pickerEnd] : null
  const firstProblem = view.price.units.find((unit) => unit.problem !== null)
  const addBlockedBecause = isEmpty
    ? 'Add a unit to start'
    : firstProblem?.problem
      ? `Unit ${draft.chain.indexOf(firstProblem.entry) + 1}: ${unitProblemSentence(firstProblem.problem)}`
      : null

  return (
    <div className="mcf-workspace">
      {viewInGallery ? null : <LayoutStageView snapshot={snapshot} fill={false} />}

      {refusal ? (
        <div className="mcf-notice" role="status">
          <span>{refusalSentence(refusal, storefront.maxPieces)}</span>
          <button type="button" className="mcf-link-button" onClick={() => dispatch({ type: 'dismiss-refusal' })}>
            OK
          </button>
        </div>
      ) : null}

      {pickerView && pickerEnd ? (
        <div ref={pickerRef}>
        <PiecePicker
          heading={isEmpty ? 'Choose your first unit' : `Add a unit ${pickerView.besideText}`}
          candidates={pickerView.candidates}
          labelFor={labelFor}
          priceFor={priceOfPieceAlone}
          currencySymbol={currencySymbol}
          maxPieces={storefront.maxPieces}
          onPick={(pieceId) => {
            dispatch({ type: 'add', end: pickerEnd, pieceId })
            onClosePicker()
          }}
          onCancel={onClosePicker}
        />
        </div>
      ) : null}

      <section className="mcf-section" aria-labelledby="mcf-your-layout">
        <div className="mcf-section-head">
          <h3 id="mcf-your-layout" className="mcf-section-title">
            Your layout
          </h3>
          <div className="mcf-row">
            <button type="button" className="mcf-link-button" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
              Undo
            </button>
          </div>
        </div>
        <p className="mcf-section-note">
          Tap a dashed space in the picture, or a button below, to add a unit there. Tap a unit to swap it, change its
          fabric or take it out.
        </p>
        {snapshot.ghosts.length > 0 ? (
          <div className="mcf-row">
            {snapshot.ghosts.map((ghost) => (
              <button
                key={ghost.end}
                type="button"
                className="mcf-chip"
                aria-pressed={pickerEnd === ghost.end}
                onClick={() => onOpenPicker(ghost.end)}
              >
                + {ghost.label}
              </button>
            ))}
          </div>
        ) : null}

        {selectedEntry ? (
          <UnitEditor
            number={selectedIndex + 1}
            label={labelFor(selectedEntry.pieceId)}
            swapTo={swapOptions(draft.chain, selectedEntry.entryId, definitions, { maxPieces: storefront.maxPieces })}
            labelFor={labelFor}
            otherOptions={otherOptions}
            layoutChoices={layoutChoices}
            ownChoices={draft.unitChoices[selectedEntry.entryId] ?? {}}
            onSwap={(pieceId) => dispatch({ type: 'swap', entryId: selectedEntry.entryId, pieceId })}
            onChoose={(optionId, valueId) => dispatch({ type: 'set-unit-choice', entryId: selectedEntry.entryId, optionId, valueId })}
            onRemove={() => dispatch({ type: 'remove', entryId: selectedEntry.entryId })}
            onClose={() => onSelectUnit(null)}
          />
        ) : null}

        {!isEmpty ? (
          <ol className="mcf-units">
            {view.price.units.map((unit, index) => {
              const own = draft.unitChoices[unit.entry.entryId] ?? {}
              const ownLabels = otherOptions.flatMap((option) => {
                const value = option.values.find((candidate) => candidate.id === own[option.id])
                return value ? [value.label] : []
              })
              return (
                <li key={unit.entry.entryId} className="mcf-unit" data-selected={unit.entry.entryId === selectedEntryId}>
                  <span className="mcf-unit-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="mcf-unit-select"
                    aria-pressed={unit.entry.entryId === selectedEntryId}
                    onClick={() => onSelectUnit(unit.entry.entryId)}
                  >
                    <span className="mcf-unit-name">{view.labels[index]}</span>
                    {unit.problem ? (
                      <span className="mcf-unit-detail mcf-unit-detail--problem">{unitProblemSentence(unit.problem)}</span>
                    ) : ownLabels.length > 0 ? (
                      <span className="mcf-unit-detail">In {ownLabels.join(', ')}</span>
                    ) : null}
                  </button>
                  <span className="mcf-unit-price">{unit.variant ? money(unit.variant.price) : ''}</span>
                </li>
              )
            })}
          </ol>
        ) : null}
      </section>

      {storefront.presets.length > 0 ? (
        <section className="mcf-section" aria-labelledby="mcf-shapes">
          <h3 id="mcf-shapes" className="mcf-section-title">
            Start from a shape
          </h3>
          {!isEmpty ? <p className="mcf-section-note">Picking one replaces your layout - Undo brings it back.</p> : null}
          <div className="mcf-row">
            {storefront.presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="mcf-chip"
                onClick={() => {
                  onClosePicker()
                  dispatch({ type: 'start-from', pieceIds: preset.pieceIds, byShopper: true })
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {otherOptions.map((option) => {
        const chosen = option.values.find((value) => value.id === layoutChoices[option.id])
        return (
          <section key={option.id} className="mcf-section" aria-labelledby={`mcf-option-${option.id}`}>
            <div className="mcf-section-head">
              <h3 id={`mcf-option-${option.id}`} className="mcf-section-title">
                {option.name}
              </h3>
              <p className="mcf-section-note">{chosen ? `${chosen.label}, every unit` : 'Every unit'}</p>
            </div>
            <OptionChoices
              option={option}
              chosenValueId={layoutChoices[option.id] ?? null}
              onChoose={(valueId) => onChooseLayoutValue(option.id, valueId)}
              unavailableReason={(valueId) => layoutValueProblem(option.id, valueId)}
            />
          </section>
        )
      })}

      <div className="mcf-ws-foot">
        <div className="mcf-price-block">
          <span className="mcf-price-now">{money(view.price.total * layoutQuantity)}</span>
          {view.price.compareAtTotal !== null ? (
            <span className="mcf-price-was">{money(view.price.compareAtTotal * layoutQuantity)}</span>
          ) : null}
          {view.price.retailTotal !== null ? (
            <span className="mcf-price-rrp">RRP {money(view.price.retailTotal * layoutQuantity)}</span>
          ) : null}
          {priceSuffix ? <span className="mcf-price-note">{priceSuffix}</span> : null}
          <button type="button" className="mcf-reset" onClick={onReset}>
            Reset options
          </button>
        </div>
        <p className={addBlockedBecause ? 'mcf-status mcf-status--problem' : 'mcf-status'}>
          {addBlockedBecause ?? `${view.shapeLabel} · ${view.countsText}`}
        </p>

        {delivery ? (
          <LayoutDeliveryPicker
            delivery={delivery}
            itemCount={draft.chain.length * layoutQuantity}
            layoutQuantity={layoutQuantity}
            currencySymbol={currencySymbol}
            onChange={setDeliveryChoice}
          />
        ) : null}

        <div className="mcf-buy-row">
          <div className="mcf-qty" role="group" aria-label="How many of this layout">
            <button
              type="button"
              aria-label="One fewer"
              disabled={layoutQuantity <= 1}
              onClick={() => setLayoutQuantity((value) => Math.max(1, value - 1))}
            >
              −
            </button>
            <span className="mcf-qty-value" aria-live="polite">
              {layoutQuantity}
            </span>
            <button
              type="button"
              aria-label="One more"
              disabled={layoutQuantity >= MAX_LAYOUT_QUANTITY}
              onClick={() => setLayoutQuantity((value) => Math.min(MAX_LAYOUT_QUANTITY, value + 1))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="mcf-add"
            disabled={addBlockedBecause !== null || !view.price.buyable}
            onClick={() => onAddToBasket(layoutQuantity, deliveryMeta)}
          >
            Add layout to basket
          </button>
        </div>
        {statusText ? (
          <p className="mcf-status mcf-status--good" role="status">
            {statusText}
          </p>
        ) : null}
      </div>
    </div>
  )
}
