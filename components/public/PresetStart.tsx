// The "Build a layout" tab before a layout exists: the ready-made shapes drawn
// to scale with their prices, and "Design your own". Choosing either starts the
// builder - and only then does the 3D view load.
//
// Presentational only - finished strings and plans in, callbacks out. The live
// builder and the page editor's preview both render it, so the editor shows the
// markup the shop page will.
import type { PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'

export interface PresetTileView {
  key: string
  name: string
  placed: readonly PlacedPiece[]
  unitCountText: string
  priceText: string
}

interface PresetStartProps {
  intro: string
  labelFor: (pieceId: string) => string
  presets: readonly PresetTileView[]
  pricesInText: string
  onStartPreset: (key: string) => void
  onDesignOwn: () => void
}

export function PresetStart({ intro, labelFor, presets, pricesInText, onStartPreset, onDesignOwn }: PresetStartProps) {
  return (
    <div className="mcf-start">
      {intro ? <p className="mcf-card-intro">{intro}</p> : null}
      <div className="mcf-presets">
        {presets.map((preset) => (
          <button key={preset.key} type="button" className="mcf-preset" onClick={() => onStartPreset(preset.key)}>
            <LayoutPlan className="mcf-preset-plan" placed={preset.placed} labelFor={labelFor} description="" />
            <span className="mcf-preset-name">{preset.name}</span>
            <span className="mcf-preset-meta">
              {preset.unitCountText}
              {preset.priceText ? ` · ${preset.priceText}` : ''}
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
    </div>
  )
}
