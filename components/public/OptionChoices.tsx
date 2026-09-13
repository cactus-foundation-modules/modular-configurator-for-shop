'use client'

// One variation option's values as buttons: colour or image swatches where the
// values carry them, labelled chips where they do not. Shared by the layout's
// own choices and a single unit's, so both read the same way.
import type { SvrOptionWithValues } from '@/modules/shop-variations/lib/types'
import { SwatchPeek } from '@/modules/modular-configurator-for-shop/components/public/SwatchPeek'
import { swatchOf, swatchStyle } from '@/modules/modular-configurator-for-shop/components/public/swatch-style'

interface OptionChoicesProps {
  option: SvrOptionWithValues
  chosenValueId: string | null
  onChoose: (valueId: string) => void
  /** Values the layout cannot be made in right now, and why (shown on hover and read aloud). */
  unavailableReason?: (valueId: string) => string | null
}

export function OptionChoices({ option, chosenValueId, onChoose, unavailableReason }: OptionChoicesProps) {
  const usesSwatches = option.values.some((value) => swatchOf(value))
  return (
    <div className={usesSwatches ? 'mcf-swatches' : 'mcf-row'} role="group" aria-label={option.name}>
      {option.values.map((value) => {
        const reason = unavailableReason?.(value.id) ?? null
        const chosen = value.id === chosenValueId
        const swatch = swatchOf(value)
        const title = reason ? `${value.label} - ${reason}` : value.label
        return usesSwatches ? (
          <SwatchPeek key={value.id} swatch={swatch} label={value.label} reason={reason}>
            <button
              type="button"
              className="mcf-swatch"
              style={swatch ? swatchStyle(swatch) : undefined}
              aria-pressed={chosen}
              disabled={reason !== null && !chosen}
              onClick={() => onChoose(value.id)}
            >
              <span className="mcf-swatch-label">{title}</span>
            </button>
          </SwatchPeek>
        ) : (
          <button
            key={value.id}
            type="button"
            className="mcf-chip"
            aria-pressed={chosen}
            disabled={reason !== null && !chosen}
            title={reason ?? undefined}
            onClick={() => onChoose(value.id)}
          >
            {value.label}
          </button>
        )
      })}
    </div>
  )
}
