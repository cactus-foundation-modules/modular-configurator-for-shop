'use client'

// One variation option's values as buttons: colour or image swatches where the
// values carry them, labelled chips where they do not. Shared by the layout's
// own choices and a single unit's, so both read the same way.
import type { SvrOptionWithValues } from '@/modules/shop-variations/lib/types'

interface OptionChoicesProps {
  option: SvrOptionWithValues
  chosenValueId: string | null
  onChoose: (valueId: string) => void
  /** Values the layout cannot be made in right now, and why (shown on hover and read aloud). */
  unavailableReason?: (valueId: string) => string | null
}

function swatchStyle(swatch: string): React.CSSProperties {
  // A hex swatch is the product's own colour data, not interface chrome.
  return swatch.startsWith('#') ? { backgroundColor: swatch } : { backgroundImage: `url("${swatch.replace(/"/g, '%22')}")` }
}

export function OptionChoices({ option, chosenValueId, onChoose, unavailableReason }: OptionChoicesProps) {
  const usesSwatches = option.values.some((value) => value.swatchSmall || value.swatch)
  return (
    <div className={usesSwatches ? 'mcf-swatches' : 'mcf-row'} role="group" aria-label={option.name}>
      {option.values.map((value) => {
        const reason = unavailableReason?.(value.id) ?? null
        const chosen = value.id === chosenValueId
        const swatch = value.swatchSmall || value.swatch
        const title = reason ? `${value.label} - ${reason}` : value.label
        return usesSwatches ? (
          <button
            key={value.id}
            type="button"
            className="mcf-swatch"
            style={swatch ? swatchStyle(swatch) : undefined}
            aria-pressed={chosen}
            disabled={reason !== null && !chosen}
            title={title}
            onClick={() => onChoose(value.id)}
          >
            <span className="mcf-swatch-label">{title}</span>
          </button>
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
