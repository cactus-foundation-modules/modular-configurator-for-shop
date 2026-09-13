// The card that sits in the product page's purchase area: before a layout exists,
// a row of starting shapes drawn to scale with their prices; once one does, the
// layout in brief with Edit and Add to basket.
//
// Presentational only - it takes finished strings and plans, and calls back.
// The live card (ConfiguratorCard) and the page editor's preview both render
// this, so the editor shows exactly the markup the shop page will.
import type { PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { CONFIGURATOR_CSS } from '@/modules/modular-configurator-for-shop/components/public/configurator-css'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'

export interface CardPresetView {
  key: string
  name: string
  placed: readonly PlacedPiece[]
  unitCountText: string
  priceText: string
}

export interface CardSummaryView {
  placed: readonly PlacedPiece[]
  shapeText: string
  detailText: string
  priceText: string
  priceNote: string
  retailText: string | null
  problemText: string | null
}

export interface ConfiguratorCardViewProps {
  heading: string
  intro: string
  labelFor: (pieceId: string) => string
  presets: readonly CardPresetView[]
  pricesInText: string
  summary: CardSummaryView | null
  statusText: string | null
  onStartPreset: (key: string) => void
  onDesignOwn: () => void
  onEdit: () => void
  onAddToBasket: () => void
  onStartAgain: () => void
}

export function ConfiguratorCardView({
  heading,
  intro,
  labelFor,
  presets,
  pricesInText,
  summary,
  statusText,
  onStartPreset,
  onDesignOwn,
  onEdit,
  onAddToBasket,
  onStartAgain,
}: ConfiguratorCardViewProps) {
  return (
    <section className="mcf-card" data-cactus-unstyled="" aria-label={heading}>
      <style dangerouslySetInnerHTML={{ __html: CONFIGURATOR_CSS }} />
      <div className="mcf-card-head">
        <div>
          <h2 className="mcf-card-title">{heading}</h2>
          {intro ? <p className="mcf-card-intro">{intro}</p> : null}
        </div>
        <span className="mcf-badge">3D</span>
      </div>

      {summary ? (
        <>
          <div className="mcf-summary">
            <LayoutPlan className="mcf-summary-plan" placed={summary.placed} labelFor={labelFor} description={`Plan of your layout: ${summary.detailText}`} />
            <div className="mcf-summary-lines">
              <span className="mcf-summary-shape">{summary.shapeText}</span>
              <span className="mcf-summary-detail">{summary.detailText}</span>
              <div className="mcf-price">
                <span className="mcf-price-total">{summary.priceText}</span>
                {summary.priceNote ? <span className="mcf-price-note">{summary.priceNote}</span> : null}
                {summary.retailText ? <span className="mcf-price-note">{summary.retailText}</span> : null}
              </div>
              {summary.problemText ? <p className="mcf-status mcf-status--problem">{summary.problemText}</p> : null}
            </div>
          </div>
          <div className="mcf-actions">
            <button type="button" className="mcf-button mcf-button--quiet mcf-button--wide" onClick={onEdit}>
              Edit layout in 3D
            </button>
            <button type="button" className="mcf-button mcf-button--wide" disabled={summary.problemText !== null} onClick={onAddToBasket}>
              Add layout to basket
            </button>
          </div>
          <button type="button" className="mcf-link-button" onClick={onStartAgain}>
            Start a different layout
          </button>
        </>
      ) : (
        <>
          <div className="mcf-presets">
            {presets.map((preset) => (
              <button key={preset.key} type="button" className="mcf-preset" onClick={() => onStartPreset(preset.key)}>
                <LayoutPlan className="mcf-preset-plan" placed={preset.placed} labelFor={labelFor} description="" />
                <span className="mcf-preset-name">{preset.name}</span>
                <span className="mcf-preset-meta">
                  {preset.unitCountText} · {preset.priceText}
                </span>
              </button>
            ))}
            <button type="button" className="mcf-preset mcf-preset--own" onClick={onDesignOwn}>
              <span className="mcf-plus" aria-hidden="true">
                +
              </span>
              <span className="mcf-preset-name">Design your own</span>
            </button>
          </div>
          {presets.length > 0 && pricesInText ? <p className="mcf-status">{pricesInText}</p> : null}
        </>
      )}
      {statusText ? (
        <p className="mcf-status mcf-status--good" role="status">
          {statusText}
        </p>
      ) : null}
    </section>
  )
}
