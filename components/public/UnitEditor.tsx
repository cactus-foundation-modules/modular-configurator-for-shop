'use client'

// The panel for one selected unit, opened under the row of unit pills:
// swap it for another type that still fits, curve a backless curve the other
// way, turn a backless unit beside a corner to line up with the row, give it
// choices of its own (a contrasting fabric, say), or take it out.
import { useId } from 'react'
import { SwatchSelect } from '@/modules/modular-configurator-for-shop/components/public/SwatchSelect'
import { swatchOf } from '@/modules/modular-configurator-for-shop/components/public/swatch-style'
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { SvrOptionWithValues } from '@/modules/shop-variations/lib/types'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'

interface UnitEditorProps {
  label: string
  swapTo: readonly PieceDefinition[]
  labelFor: (pieceId: string) => string
  otherOptions: readonly SvrOptionWithValues[]
  layoutChoices: OptionSelection
  ownChoices: OptionSelection
  /** What the unit actually is, option by option. */
  madeIn: OptionSelection
  /** Options where the unit is not made in the layout's choice and takes the nearest it is. */
  adjustedOptionIds: readonly string[]
  /** Lays the unit the other way round; only for a unit that can be. */
  onFlip?: () => void
  /** Turns a backless unit a quarter; only where that is offered. */
  onTurn?: () => void
  /** The unit is turned already, so the button turns it back. */
  turned?: boolean
  /** Whether this unit comes in a value at all, keeping its other choices. */
  isMadeIn: (optionId: string, valueId: string) => boolean
  onSwap: (pieceId: string) => void
  /** Backless types that may sit in front of this backed straight module. */
  frontSpurTo?: readonly PieceDefinition[]
  onAddFrontSpur?: (pieceId: string) => void
  onChoose: (optionId: string, valueId: string | null) => void
  onRemove: () => void
  onClose: () => void
}

export function UnitEditor({
  label,
  swapTo,
  labelFor,
  otherOptions,
  layoutChoices,
  ownChoices,
  madeIn,
  adjustedOptionIds,
  onFlip,
  onTurn,
  turned = false,
  isMadeIn,
  onSwap,
  frontSpurTo,
  onAddFrontSpur,
  onChoose,
  onRemove,
  onClose,
}: UnitEditorProps) {
  const baseId = useId()
  return (
    <section className="mcf-unit-editor" aria-label={`${label}: swap, fabric and removal`}>
      {swapTo.length > 0 ? (
        <div className="mcf-section">
          <p className="mcf-section-note">Swap it for</p>
          <div className="mcf-row">
            {swapTo.map((definition) => (
              <button key={definition.pieceId} type="button" className="mcf-chip" onClick={() => onSwap(definition.pieceId)}>
                {labelFor(definition.pieceId)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {frontSpurTo && frontSpurTo.length > 0 && onAddFrontSpur ? (
        <div className="mcf-section">
          <p className="mcf-section-note">Add a backless cube in front of this seat</p>
          <div className="mcf-row">
            {frontSpurTo.map((definition) => (
              <button key={definition.pieceId} type="button" className="mcf-chip" onClick={() => onAddFrontSpur(definition.pieceId)}>
                {labelFor(definition.pieceId)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {onTurn ? (
        <div className="mcf-section">
          <p className="mcf-section-note">This unit has no back, so it can face either way</p>
          <div className="mcf-row">
            <button type="button" className="mcf-chip" aria-pressed={turned} onClick={onTurn}>
              {turned ? 'Turn it back' : 'Turn it'}
            </button>
          </div>
        </div>
      ) : null}

      {onFlip ? (
        <div className="mcf-section">
          <p className="mcf-section-note">This unit has no back, so it can curve either way</p>
          <div className="mcf-row">
            <button type="button" className="mcf-chip" onClick={onFlip}>
              Curve it the other way
            </button>
          </div>
        </div>
      ) : null}

      {otherOptions.map((option) => {
        const adjusted = adjustedOptionIds.includes(option.id)
        const layoutValue = option.values.find((value) => value.id === (adjusted ? madeIn[option.id] : layoutChoices[option.id]))
        const own = ownChoices[option.id] ?? ''
        const labelId = `${baseId}-${option.id}-label`
        return (
          <div key={option.id} className="mcf-section">
            <span id={labelId} className="mcf-section-note">
              {option.name} for this unit
            </span>
            <SwatchSelect
              labelId={labelId}
              value={own}
              onChange={(valueId) => onChoose(option.id, valueId || null)}
              unavailableNote="not made in this combination"
              options={[
                {
                  value: '',
                  label: adjusted
                    ? `Closest it comes in${layoutValue ? ` (${layoutValue.label})` : ''}`
                    : `Same as the layout${layoutValue ? ` (${layoutValue.label})` : ''}`,
                  swatch: layoutValue ? swatchOf(layoutValue) : null,
                },
                ...option.values.map((value) => ({
                  value: value.id,
                  label: value.label,
                  swatch: swatchOf(value),
                  unavailable: !isMadeIn(option.id, value.id),
                })),
              ]}
            />
          </div>
        )
      })}

      <div className="mcf-actions">
        <button type="button" className="mcf-button mcf-button--quiet" onClick={onRemove}>
          Take this unit out
        </button>
        <button type="button" className="mcf-link-button" onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  )
}
