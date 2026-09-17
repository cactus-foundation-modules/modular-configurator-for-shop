'use client'

// "Add a unit here": every unit type, with what it costs in the layout's
// choices, and - for the ones that cannot go at this end - why not. Refused
// units stay in the list, disabled, so nothing silently goes missing.
import { formatMoney } from '@/modules/shop/lib/money'
import { TaxViewMoney } from '@/modules/shop/components/public/TaxViewText'
import type { ProductTaxView } from '@/modules/shop/lib/tax-view-shared'
import type { EndCandidate } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { refusalHint } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'

interface PiecePickerProps {
  heading: string
  candidates: readonly EndCandidate[]
  labelFor: (pieceId: string) => string
  priceFor: (pieceId: string) => number | null
  currencySymbol: string
  /** The shopper's VAT switch, or null where the shop has it off. */
  taxView: ProductTaxView | null
  maxPieces: number
  onPick: (pieceId: string) => void
  /** Absent when there is nothing to cancel back to (an empty layout). */
  onCancel?: () => void
}

export function PiecePicker({ heading, candidates, labelFor, priceFor, currencySymbol, taxView, maxPieces, onPick, onCancel }: PiecePickerProps) {
  return (
    <section className="mcf-picker" aria-label={heading}>
      <div className="mcf-section-head">
        <p className="mcf-section-title">{heading}</p>
        {onCancel ? (
          <button type="button" className="mcf-link-button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <ul className="mcf-picker-list">
        {candidates.map((candidate) => {
          const { pieceId } = candidate.definition
          const price = priceFor(pieceId)
          return (
            <li key={pieceId}>
              <button
                type="button"
                className="mcf-picker-option"
                disabled={candidate.refusal !== null}
                onClick={() => onPick(pieceId)}
              >
                <span className="mcf-unit-name">{labelFor(pieceId)}</span>
                <span className="mcf-unit-price">{price !== null ? <TaxViewMoney amount={price} view={taxView} format={(n) => formatMoney(n, currencySymbol)} /> : ''}</span>
                {candidate.refusal ? <span className="mcf-picker-reason">{refusalHint(candidate.refusal, maxPieces)}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
