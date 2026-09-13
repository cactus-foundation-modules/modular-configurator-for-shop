'use client'

// The panel for one selected unit, opened in place under its row in the list:
// swap it for another type that still fits, give it choices of its own (a
// contrasting fabric, say), or take it out.
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
  onSwap: (pieceId: string) => void
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
  onSwap,
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

      {otherOptions.map((option) => {
        const layoutValue = option.values.find((value) => value.id === layoutChoices[option.id])
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
              options={[
                {
                  value: '',
                  label: `Same as the layout${layoutValue ? ` (${layoutValue.label})` : ''}`,
                  swatch: layoutValue ? swatchOf(layoutValue) : null,
                },
                ...option.values.map((value) => ({ value: value.id, label: value.label, swatch: swatchOf(value) })),
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
