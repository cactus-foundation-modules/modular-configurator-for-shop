'use client'

// The layout builder, laid out down the product page's purchase column: the view
// (the 3D model, or the plan from above), what to add and why not, the units in
// order and the selected one, starting shapes, the layout's own options, and the
// price with the add button last - the same order a shopper reads the rest of
// the purchase area in.
//
// It owns only what is about viewing (3D or plan, sizes on or off, which end's
// picker is open, how many layouts). The layout belongs to LayoutBuilder.
import { useMemo, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { swapOptions } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { ChainEnd } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { priceLayout } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'
import { refusalSentence, unitProblemSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'
import type { ConfiguratorStorefrontPayload } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { VariantSelectorPayload } from '@/modules/shop-variations/lib/types'
import { LayoutPlan, type PlanGhost } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { LayoutStageLazy } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageLazy'
import { OptionChoices } from '@/modules/modular-configurator-for-shop/components/public/OptionChoices'
import { PiecePicker } from '@/modules/modular-configurator-for-shop/components/public/PiecePicker'
import { UnitEditor } from '@/modules/modular-configurator-for-shop/components/public/UnitEditor'
import type { useLayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/use-layout-builder'
import { otherOptionsOf, pieceLookup, type LayoutView } from '@/modules/modular-configurator-for-shop/components/public/use-layout-view'

type LayoutBuilderState = ReturnType<typeof useLayoutBuilder>
type ViewChoice = '3d' | 'plan'

interface LayoutWorkspaceProps {
  storefront: ConfiguratorStorefrontPayload
  payload: VariantSelectorPayload
  currencySymbol: string
  priceSuffix: string
  builder: LayoutBuilderState
  view: LayoutView
  layoutChoices: OptionSelection
  statusText: string | null
  onChooseLayoutValue: (optionId: string, valueId: string) => void
  onAddToBasket: (layoutQuantity: number) => void
}

const MAX_LAYOUT_QUANTITY = 20

export function LayoutWorkspace({
  storefront,
  payload,
  currencySymbol,
  priceSuffix,
  builder,
  view,
  layoutChoices,
  statusText,
  onChooseLayoutValue,
  onAddToBasket,
}: LayoutWorkspaceProps) {
  const [viewChoice, setViewChoice] = useState<ViewChoice>('3d')
  const [showDimensions, setShowDimensions] = useState(true)
  const [pickerEnd, setPickerEnd] = useState<ChainEnd | null>(null)
  const [layoutQuantity, setLayoutQuantity] = useState(1)
  const [unitsLoading, setUnitsLoading] = useState(0)

  const { draft, placed, selectedEntryId, refusal, dispatch, canUndo } = builder
  const pieceById = useMemo(() => pieceLookup(storefront.pieces), [storefront.pieces])
  const definitions = useMemo(
    () => new Map(storefront.pieces.map((piece) => [piece.pieceId, piece.definition])),
    [storefront.pieces],
  )
  const otherOptions = useMemo(() => otherOptionsOf(payload, storefront.pieceOptionId), [payload, storefront.pieceOptionId])
  const labelFor = (pieceId: string) => pieceById.get(pieceId)?.label ?? 'Unit'
  const money = (amount: number) => formatMoney(amount, currencySymbol)

  const chooseEnd = (end: ChainEnd) => {
    dispatch({ type: 'select', entryId: null })
    setPickerEnd(end)
  }
  const selectUnit = (entryId: string | null) => {
    setPickerEnd(null)
    dispatch({ type: 'select', entryId })
  }

  const priceOfPieceAlone = (pieceId: string): number | null =>
    priceLayout(payload, storefront.pieceOptionId, [{ entryId: 'probe', pieceId }], layoutChoices, {}).units[0]?.variant?.price ?? null

  const layoutValueProblem = (optionId: string, valueId: string): string | null => {
    if (draft.chain.length === 0) return null
    const trial = priceLayout(payload, storefront.pieceOptionId, draft.chain, { ...layoutChoices, [optionId]: valueId }, draft.unitChoices)
    return trial.units.some((unit) => unit.problem === 'unavailable') ? 'not made for every unit in this layout' : null
  }

  const isEmpty = draft.chain.length === 0
  // Memoised on the layout so the 3D scene is only handed new spaces when they move.
  const planGhosts = useMemo<PlanGhost[]>(
    () =>
      (['start', 'end'] as const).flatMap((end) => {
        const endView = view.ends[end]
        if (!endView.ghost || (end === 'start' && isEmpty)) return []
        const label = isEmpty ? 'Add your first unit' : `Add a unit ${endView.besideText}`
        return [{ end, footprint: endView.ghost.footprint, label }]
      }),
    [view.ends, isEmpty],
  )
  const sceneGhosts = useMemo(() => planGhosts.map(({ end, footprint }) => ({ end, footprint })), [planGhosts])

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
      <div className="mcf-stage">
        {/* Both views stay mounted, so switching back to 3D does not rebuild the scene. */}
        <div className="mcf-stage-view" hidden={viewChoice !== '3d'}>
          <LayoutStageLazy
            parentProductId={storefront.parentProductId}
            look={storefront.viewer}
            placed={placed}
            pieceById={pieceById}
            childIdByEntry={view.childIdByEntry}
            ghosts={sceneGhosts}
            selectedEntryId={selectedEntryId}
            showDimensions={showDimensions}
            widthText={view.widthText}
            depthText={view.depthText}
            onSelectUnit={selectUnit}
            onPickGhost={chooseEnd}
            onLoadingChange={setUnitsLoading}
          />
        </div>
        <div className="mcf-stage-view mcf-stage-plan" hidden={viewChoice !== 'plan'}>
          <LayoutPlan
            className="mcf-plan"
            placed={placed}
            labelFor={labelFor}
            description={isEmpty ? 'Empty layout plan' : `Plan of your layout: ${view.arrangementText}`}
            interactive
            selectedEntryId={selectedEntryId}
            ghosts={planGhosts}
            showDimensions={showDimensions}
            onSelect={(entryId) => selectUnit(entryId === selectedEntryId ? null : entryId)}
            onAdd={chooseEnd}
          />
        </div>
        <div className="mcf-stage-tools">
          <button type="button" className="mcf-chip" aria-pressed={viewChoice === '3d'} onClick={() => setViewChoice('3d')}>
            3D
          </button>
          <button type="button" className="mcf-chip" aria-pressed={viewChoice === 'plan'} onClick={() => setViewChoice('plan')}>
            Plan
          </button>
          <button type="button" className="mcf-chip" aria-pressed={showDimensions} onClick={() => setShowDimensions((value) => !value)}>
            Sizes
          </button>
        </div>
        <p className="mcf-stage-caption" aria-live="polite">
          {unitsLoading > 0 && viewChoice === '3d'
            ? 'Bringing the units in…'
            : isEmpty
              ? 'Tap the + to place your first unit'
              : `${view.shapeLabel} · ${view.unitCountText} · ${view.footprintText}`}
        </p>
      </div>

      {refusal ? (
        <div className="mcf-notice" role="status">
          <span>{refusalSentence(refusal, storefront.maxPieces)}</span>
          <button type="button" className="mcf-link-button" onClick={() => dispatch({ type: 'dismiss-refusal' })}>
            OK
          </button>
        </div>
      ) : null}

      {pickerView && pickerEnd ? (
        <PiecePicker
          heading={isEmpty ? 'Choose your first unit' : `Add a unit ${pickerView.besideText}`}
          candidates={pickerView.candidates}
          labelFor={labelFor}
          priceFor={priceOfPieceAlone}
          currencySymbol={currencySymbol}
          maxPieces={storefront.maxPieces}
          onPick={(pieceId) => {
            dispatch({ type: 'add', end: pickerEnd, pieceId })
            setPickerEnd(null)
          }}
          onCancel={() => setPickerEnd(null)}
        />
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
              <button type="button" className="mcf-link-button" onClick={() => dispatch({ type: 'clear' })}>
                Start again
              </button>
            ) : null}
          </div>
        </div>
        <p className="mcf-section-note">
          Tap a dashed space to add a unit there. Tap a unit to swap it, change its fabric or take it out.
        </p>

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
            onClose={() => selectUnit(null)}
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
                    onClick={() => selectUnit(unit.entry.entryId)}
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
                  setPickerEnd(null)
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
        <div className="mcf-summary-lines">
          <div className="mcf-price">
            <span className="mcf-price-total">{money(view.price.total * layoutQuantity)}</span>
            {priceSuffix ? <span className="mcf-price-note">{priceSuffix}</span> : null}
            {view.price.compareAtTotal !== null ? (
              <span className="mcf-price-was">{money(view.price.compareAtTotal * layoutQuantity)}</span>
            ) : null}
            {view.price.retailTotal !== null ? (
              <span className="mcf-price-note">RRP {money(view.price.retailTotal * layoutQuantity)}</span>
            ) : null}
          </div>
          <p className={addBlockedBecause ? 'mcf-status mcf-status--problem' : 'mcf-status'}>
            {addBlockedBecause ?? `${view.shapeLabel} · ${view.countsText}`}
          </p>
        </div>
        <div className="mcf-actions">
          <div className="mcf-stepper" role="group" aria-label="How many of this layout">
            <button
              type="button"
              className="mcf-icon-button"
              aria-label="One fewer"
              disabled={layoutQuantity <= 1}
              onClick={() => setLayoutQuantity((value) => Math.max(1, value - 1))}
            >
              −
            </button>
            <span className="mcf-stepper-value" aria-live="polite">
              {layoutQuantity}
            </span>
            <button
              type="button"
              className="mcf-icon-button"
              aria-label="One more"
              disabled={layoutQuantity >= MAX_LAYOUT_QUANTITY}
              onClick={() => setLayoutQuantity((value) => Math.min(MAX_LAYOUT_QUANTITY, value + 1))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="mcf-button mcf-button--wide"
            disabled={addBlockedBecause !== null || !view.price.buyable}
            onClick={() => onAddToBasket(layoutQuantity)}
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
