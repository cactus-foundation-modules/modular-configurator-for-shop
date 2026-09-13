'use client'

// The panel for one selected unit: swap it for another type that still fits,
// give it choices of its own (a contrasting fabric, say), or take it out.
import type { PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { SvrOptionWithValues } from '@/modules/shop-variations/lib/types'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'

interface UnitEditorProps {
  number: number
  label: string
  swapTo: readonly PieceDefinition[]
  labelFor: (pieceId: string) => string
  otherOptions: readonly SvrOptionWithValues[]
  layoutChoices: OptionSelection
  ownChoices: OptionSelection
  onSwap: (pieceId: string) => void
  onChoose: (optionId: string, valueId: string | null) => void
  onRemove: () => void
  onClose: () => void
}

export function UnitEditor({
  number,
  label,
  swapTo,
  labelFor,
  otherOptions,
  layoutChoices,
  ownChoices,
  onSwap,
  onChoose,
  onRemove,
  onClose,
}: UnitEditorProps) {
  return (
    <section className="mcf-unit-editor" aria-label={`Unit ${number}, ${label}`}>
      <div className="mcf-unit-editor-head">
        <p className="mcf-section-title">
          Unit {number}: {label}
        </p>
        <button type="button" className="mcf-link-button" onClick={onClose}>
          Done
        </button>
      </div>

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

      {otherOptions.map((option) => {
        const layoutValue = option.values.find((value) => value.id === layoutChoices[option.id])
        const own = ownChoices[option.id] ?? ''
        const selectId = `mcf-unit-${number}-${option.id}`
        return (
          <div key={option.id} className="mcf-section">
            <label className="mcf-section-note" htmlFor={selectId}>
              {option.name} for this unit
            </label>
            <select
              id={selectId}
              className="mcf-select"
              value={own}
              onChange={(event) => onChoose(option.id, event.target.value || null)}
            >
              <option value="">Same as the layout{layoutValue ? ` (${layoutValue.label})` : ''}</option>
              {option.values.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      <div className="mcf-actions">
        <button type="button" className="mcf-button mcf-button--quiet" onClick={onRemove}>
          Take this unit out
        </button>
      </div>
    </section>
  )
}
