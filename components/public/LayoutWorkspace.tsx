'use client'

// The layout builder's controls, laid out down the product page's purchase
// column: what to add and why not, the units in order (a row of pills) with the
// selected one's panel under them, the
// layout's own options, and the price with the add button
// last - the same order, and the same look, as the individual tab's price,
// delivery box and buy row.
//
// The view of the layout normally lives in the product gallery; it is drawn here
// only when the page has no gallery to host it. This owns how many layouts and the
// delivery choice - the layout, the selection and the open picker belong to
// LayoutBuilder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { TaxViewMoney, TaxViewNote } from '@/modules/shop/components/public/TaxViewText'
import { TaxViewToggle } from '@/modules/shop/components/public/TaxViewToggle'
import type { ProductTaxView } from '@/modules/shop/lib/tax-view-shared'
import { FREE_SPACE_KEY, frontSpurOptions, hostEntryIdForSpur, swapOptions, turnIsOffered, type SpaceKey } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { canStandFree, chainLimitsBeside, freeUnitEntry } from '@/modules/modular-configurator-for-shop/lib/free-units'
import { isReversible } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { layoutValueReachesAUnit, priceLayout, unitIsMadeIn } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { refusalSentence, unitProblemSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'
import type { ConfiguratorStorefrontPayload } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { VariantSelectorPayload } from '@/modules/shop-variations/lib/types'
import type { LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { LayoutStageView } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageView'
import { OptionChoices } from '@/modules/modular-configurator-for-shop/components/public/OptionChoices'
import { PiecePicker } from '@/modules/modular-configurator-for-shop/components/public/PiecePicker'
import { UnitEditor } from '@/modules/modular-configurator-for-shop/components/public/UnitEditor'
import { LayoutDeliveryPicker } from '@/modules/modular-configurator-for-shop/components/public/LayoutDeliveryPicker'
import { useLayoutDelivery } from '@/modules/modular-configurator-for-shop/components/public/use-layout-delivery'
import { deliveryLinesFor } from '@/modules/modular-configurator-for-shop/lib/layout-delivery'
import type { useLayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import { otherOptionsOf, pieceLookup, spaceViewFor, type LayoutView } from '@/modules/modular-configurator-for-shop/components/public/use-layout-view'
import { OPTIONS_AREA_CLASS, useStickyMobileGallery } from '@/modules/shop-variations/lib/use-sticky-mobile-gallery'

type LayoutBuilderState = ReturnType<typeof useLayoutBuilder>

interface LayoutWorkspaceProps {
  storefront: ConfiguratorStorefrontPayload
  payload: VariantSelectorPayload
  currencySymbol: string
  priceSuffix: string
  /** The shopper's with/without VAT switch, or null where the shop has it off. */
  taxView: ProductTaxView | null
  builder: LayoutBuilderState
  view: LayoutView
  snapshot: LayoutStageSnapshot
  /** True when the product gallery is showing the layout, so no view is drawn here. */
  viewInGallery: boolean
  pickerSpace: SpaceKey | null
  onOpenPicker: (key: SpaceKey) => void
  onClosePicker: () => void
  onAddUnit: (key: SpaceKey, pieceId: string) => void
  onSelectUnit: (entryId: string | null) => void
  layoutChoices: OptionSelection
  statusText: string | null
  onChooseLayoutValue: (optionId: string, valueId: string) => void
  /** Starts the layout again, back to the shapes. */
  onReset: () => void
  /** Empties the layout but stays in the builder, on the first-unit list. */
  onResetLayout: () => void
  /** `deliveryMeta` is the shopper's delivery choice as line meta, or empty for the basket's own. */
  onAddToBasket: (layoutQuantity: number, deliveryMeta: Record<string, string>) => void
}

const MAX_LAYOUT_QUANTITY = 20

const unitPanelId = (entryId: string) => `mcf-unit-panel-${entryId}`

export function LayoutWorkspace({
  storefront,
  payload,
  currencySymbol,
  priceSuffix,
  taxView,
  builder,
  view,
  snapshot,
  viewInGallery,
  pickerSpace,
  onOpenPicker,
  onClosePicker,
  onAddUnit,
  onSelectUnit,
  layoutChoices,
  statusText,
  onChooseLayoutValue,
  onReset,
  onResetLayout,
  onAddToBasket,
}: LayoutWorkspaceProps) {
  const [layoutQuantity, setLayoutQuantity] = useState(1)
  const [deliveryChoice, setDeliveryChoice] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const unitEditorRef = useRef<HTMLDivElement>(null)
  const { colRef: stickyViewRef, spacerRef: stickyViewSpacerRef } = useStickyMobileGallery(!viewInGallery)

  const { draft, selectedEntryId, refusal, dispatch, canUndo } = builder
  const pieceById = useMemo(() => pieceLookup(storefront.pieces), [storefront.pieces])
  const definitions = useMemo(
    () => new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.definition])),
    [storefront.pieces],
  )
  const otherOptions = useMemo(() => otherOptionsOf(payload, storefront.pieceOptionId), [payload, storefront.pieceOptionId])
  const labelFor = (pieceId: string) => pieceById.get(pieceId)?.label ?? 'Unit'
  const money = (amount: number) => formatMoney(amount, currencySymbol)
  // A price that follows the shopper's VAT switch where the shop has one on, and
  // prints exactly as `money` does where it has not.
  const figure = (amount: number) => <TaxViewMoney amount={amount} view={taxView} format={money} />

  // A space tapped in the gallery opens its list down here, possibly out of
  // sight on a phone - so bring it into view whenever one opens.
  useEffect(() => {
    if (pickerSpace) pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pickerSpace])
  // Likewise a unit tapped in the gallery: its panel is down here.
  useEffect(() => {
    if (selectedEntryId) unitEditorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedEntryId])

  const priceOfPieceAlone = (pieceId: string): number | null =>
    priceLayout(payload, storefront.pieceOptionId, [{ entryId: 'probe', pieceId }], layoutChoices, {}).units[0]?.variant?.price ?? null

  const layoutValueProblem = (optionId: string, valueId: string): string | null =>
    layoutValueReachesAUnit(payload, storefront.pieceOptionId, [...draft.chain, ...draft.free.map(freeUnitEntry)], draft.unitChoices, optionId, valueId)
      ? null
      : 'not made for any unit in this layout'

  // No layout to join on to yet; and nothing at all, not even a unit on its own.
  const chainEmpty = draft.chain.length === 0
  const isEmpty = chainEmpty && draft.free.length === 0
  // What a chain edit may use: the layout's limits less the room the free units take.
  const chainLimits = chainLimitsBeside(draft.free, { maxPieces: storefront.maxPieces, frontUnits: storefront.frontUnits, freeUnits: storefront.freeUnits })
  const freeSpace = spaceViewFor(view, FREE_SPACE_KEY)
  const freeEntryIds = new Set(draft.free.map((unit) => unit.entryId))

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

  // An empty layout has only one thing to do next, so its list is simply open.
  const openSpace = pickerSpace ?? (isEmpty ? 'end' : null)
  const pickerView = openSpace ? spaceViewFor(view, openSpace) : null
  const firstProblem = view.price.units.find((unit) => unit.problem !== null)

  // The selected unit's panel sits under the row of units rather than in it, so
  // what it offers is worked out once, for that unit alone.
  const selectedIndex = view.price.units.findIndex((unit) => unit.entry.entryId === selectedEntryId)
  const selectedUnit = selectedIndex >= 0 ? view.price.units[selectedIndex] : undefined
  const selectedOwn = (selectedUnit && draft.unitChoices[selectedUnit.entry.entryId]) ?? {}
  const selectedDefinition = selectedUnit ? definitions.get(selectedUnit.entry.pieceId) : undefined
  const selectedIsFrontSpur = selectedUnit ? hostEntryIdForSpur(draft.chain, selectedUnit.entry.entryId) !== null : false
  const selectedStandsFree = selectedUnit ? freeEntryIds.has(selectedUnit.entry.entryId) : false
  const selectedLabel = selectedUnit ? (view.labels[selectedIndex] ?? labelFor(selectedUnit.entry.pieceId)) : ''
  const frontSpurChoices =
    selectedUnit && selectedDefinition && !selectedIsFrontSpur && !selectedStandsFree
      ? frontSpurOptions(draft.chain, selectedUnit.entry.entryId, [...definitions.values()], chainLimits)
      : []
  // A unit on its own can become any other that stands on its own; one in the
  // layout, anything that still fits there.
  const swapChoices = !selectedUnit
    ? []
    : selectedStandsFree
      ? [...definitions.values()].filter((definition) => canStandFree(definition) && definition.pieceId !== selectedUnit.entry.pieceId)
      : swapOptions(draft.chain, selectedUnit.entry.entryId, definitions, chainLimits)
  const resetButton = (
    <button type="button" className="mcf-reset" onClick={onReset}>
      Reset options
    </button>
  )
  const addBlockedBecause = isEmpty
    ? 'Add a unit to start'
      : firstProblem?.problem
      ? `Unit ${view.price.units.indexOf(firstProblem) + 1}: ${unitProblemSentence(firstProblem.problem)}`
      : null

  return (
    <div className="mcf-workspace">
      {viewInGallery ? null : (
        <>
          <div ref={stickyViewRef} className="mcf-sticky-view">
            <LayoutStageView snapshot={snapshot} fill={false} />
          </div>
          <div ref={stickyViewSpacerRef} aria-hidden style={{ display: 'none' }} />
        </>
      )}

      <div className={`mcf-controls ${OPTIONS_AREA_CLASS}`}>
        {refusal ? (
          <div className="mcf-notice" role="status">
            <span>{refusalSentence(refusal, storefront.maxPieces)}</span>
            <button type="button" className="mcf-link-button" onClick={() => dispatch({ type: 'dismiss-refusal' })}>
              OK
            </button>
          </div>
        ) : null}

        {pickerView && openSpace ? (
          <div ref={pickerRef}>
            <PiecePicker
              heading={chainEmpty && openSpace !== FREE_SPACE_KEY ? 'Choose your first unit' : `Add a unit ${pickerView.besideText}`}
              candidates={pickerView.candidates}
              labelFor={labelFor}
              priceFor={priceOfPieceAlone}
              currencySymbol={currencySymbol}
              taxView={taxView}
              maxPieces={storefront.maxPieces}
              onPick={(pieceId) => onAddUnit(openSpace, pieceId)}
              onCancel={isEmpty ? undefined : onClosePicker}
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
              {!isEmpty ? (
                <button type="button" className="mcf-link-button" onClick={onResetLayout}>
                  Reset layout
                </button>
              ) : null}
            </div>
          </div>
          {(snapshot.ghosts.length > 0 || freeSpace) && !isEmpty ? (
            <div className="mcf-row">
              {snapshot.ghosts.map((ghost) => (
                <button
                  key={ghost.key}
                  type="button"
                  className="mcf-chip"
                  aria-pressed={pickerSpace === ghost.key}
                  onClick={() => onOpenPicker(ghost.key)}
                >
                  + {ghost.label}
                </button>
              ))}
              {freeSpace ? (
                <button
                  type="button"
                  className="mcf-chip"
                  aria-pressed={pickerSpace === FREE_SPACE_KEY}
                  onClick={() => onOpenPicker(FREE_SPACE_KEY)}
                >
                  + Add a unit on its own
                </button>
              ) : null}
            </div>
          ) : null}

        {!isEmpty ? (
          // The units in order, side by side as pills that wrap; the selected
          // one opens its panel under the whole row, not inside its own pill.
          <ol className="mcf-units">
            {view.price.units.map((unit, index) => {
              const own = draft.unitChoices[unit.entry.entryId] ?? {}
              // The unit's own choices, and any option it could only be matched
              // to the nearest combination it is made in: either way, not the layout's.
              const ownLabels = otherOptions.flatMap((option) => {
                const differs = Boolean(own[option.id]) || unit.adjustedOptionIds.includes(option.id)
                const value = differs ? option.values.find((candidate) => candidate.id === unit.selection[option.id]) : undefined
                return value ? [value.label] : []
              })
              const selected = unit.entry.entryId === selectedEntryId
              return (
                <li key={unit.entry.entryId} className="mcf-unit" data-selected={selected} data-problem={unit.problem !== null}>
                  <button
                    type="button"
                    className="mcf-unit-select"
                    aria-expanded={selected}
                    aria-controls={selected ? unitPanelId(unit.entry.entryId) : undefined}
                    onClick={() => onSelectUnit(selected ? null : unit.entry.entryId)}
                  >
                    <span className="mcf-unit-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="mcf-unit-text">
                      <span className="mcf-unit-name">{view.labels[index]}</span>
                      {unit.problem ? (
                        <span className="mcf-unit-detail mcf-unit-detail--problem">{unitProblemSentence(unit.problem)}</span>
                      ) : ownLabels.length > 0 ? (
                        <span className="mcf-unit-detail">In {ownLabels.join(', ')}</span>
                      ) : freeEntryIds.has(unit.entry.entryId) ? (
                        <span className="mcf-unit-detail">On its own</span>
                      ) : null}
                    </span>
                    {unit.variant ? <span className="mcf-unit-price">{figure(unit.variant.price)}</span> : null}
                  </button>
                </li>
              )
            })}
          </ol>
        ) : null}

        {selectedUnit ? (
          <div id={unitPanelId(selectedUnit.entry.entryId)} className="mcf-unit-body" ref={unitEditorRef}>
            <p className="mcf-unit-body-title">
              <span className="mcf-unit-number" aria-hidden="true">
                {selectedIndex + 1}
              </span>
              {selectedLabel}
            </p>
            <UnitEditor
              label={selectedLabel}
              swapTo={swapChoices}
              labelFor={labelFor}
              otherOptions={otherOptions}
              layoutChoices={layoutChoices}
              ownChoices={selectedOwn}
              madeIn={selectedUnit.selection}
              adjustedOptionIds={selectedUnit.adjustedOptionIds}
              onFlip={
                selectedDefinition && isReversible(selectedDefinition) && !selectedIsFrontSpur && !selectedStandsFree
                  ? () => dispatch({ type: 'flip', entryId: selectedUnit.entry.entryId })
                  : undefined
              }
              standsFree={selectedStandsFree}
              onTurn={
                selectedStandsFree
                  ? () => dispatch({ type: 'turn-free', entryId: selectedUnit.entry.entryId })
                  : !selectedIsFrontSpur && turnIsOffered(draft.chain, selectedUnit.entry.entryId, definitions, chainLimits)
                    ? () => dispatch({ type: 'turn', entryId: selectedUnit.entry.entryId })
                    : undefined
              }
              turned={selectedUnit.entry.turned === true}
              frontSpurTo={frontSpurChoices}
              onAddFrontSpur={
                frontSpurChoices.length > 0
                  ? (pieceId) => dispatch({ type: 'add-front-spur', hostEntryId: selectedUnit.entry.entryId, pieceId, select: true })
                  : undefined
              }
              isMadeIn={(optionId, valueId) => unitIsMadeIn(payload, storefront.pieceOptionId, selectedUnit.entry.pieceId, optionId, valueId, selectedOwn)}
              onSwap={(pieceId) => dispatch({ type: 'swap', entryId: selectedUnit.entry.entryId, pieceId })}
              onChoose={(optionId, valueId) => dispatch({ type: 'set-unit-choice', entryId: selectedUnit.entry.entryId, optionId, valueId })}
              onRemove={() => dispatch({ type: 'remove', entryId: selectedUnit.entry.entryId })}
              onClose={() => onSelectUnit(null)}
            />
          </div>
        ) : null}
        </section>

      {otherOptions.map((option) => {
        const chosen = option.values.find((value) => value.id === layoutChoices[option.id])
        const somewhereElse = view.price.units.some((unit) => unit.adjustedOptionIds.includes(option.id))
        return (
          <section key={option.id} className="mcf-section" aria-labelledby={`mcf-option-${option.id}`}>
            <div className="mcf-section-head">
              <h3 id={`mcf-option-${option.id}`} className="mcf-section-title">
                {option.name}
              </h3>
              <p className="mcf-section-note">
                {chosen ? (somewhereElse ? `${chosen.label} wherever a unit comes in it` : `${chosen.label}, every unit`) : 'Every unit'}
              </p>
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
            <span className="mcf-price-now">{figure(view.price.total * layoutQuantity)}</span>
            {/* The tax wording straight after the figure it describes, with the
                shopper's switch beside it where the shop has one on. */}
            <TaxViewNote view={taxView} suffix={priceSuffix} className="mcf-price-note" />
            <TaxViewToggle view={taxView} />
            {view.price.compareAtTotal !== null ? (
              <span className="mcf-price-was">{figure(view.price.compareAtTotal * layoutQuantity)}</span>
            ) : null}
            {view.price.retailTotal !== null ? (
              <span className="mcf-price-rrp">RRP {figure(view.price.retailTotal * layoutQuantity)}</span>
            ) : null}
          </div>
          {delivery ? (
            <LayoutDeliveryPicker
              delivery={delivery}
              itemCount={view.price.units.length * layoutQuantity}
              layoutQuantity={layoutQuantity}
              currencySymbol={currencySymbol}
              taxView={taxView}
              onChange={setDeliveryChoice}
            />
          ) : null}

        {/* Reset options sits at the far end of whichever line is above the buy
            row - the green read-back or the reason it cannot be bought yet - as
            it does on the individual items tab, rather than ending the price row
            and pushing the figures onto a second line. */}
        {addBlockedBecause ? (
          <div className="mcf-status-row">
            <p className="mcf-status mcf-status--problem">{addBlockedBecause}</p>
            {resetButton}
          </div>
        ) : (
          // Same green "ready" box as the individual items tab, in the same place above the buy row.
          <div className="mcf-ready">
            {/* The announcement is the words alone, not the link beside them. */}
            <span className="mcf-ready-text" role="status">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>
                Ready to add: {view.shapeLabel} · {view.countsText}
              </span>
            </span>
            {resetButton}
          </div>
        )}

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
    </div>
  )
}
