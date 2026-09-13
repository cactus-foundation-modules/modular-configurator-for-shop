// The editor half of the "Build a layout / Shop individual items" block.
//
// Two tabs. "Shop individual items" is a slot: the page's ordinary option, price
// and basket blocks are dropped into it, and it is what a product without the
// layout builder shows, with no tab bar at all. "Build a layout" is the builder,
// which needs the product's variations and set-up the editor canvas does not
// have - so here it shows a static sample drawn with the same markup, opening on
// the individual tab so its blocks can be arranged.
import type { ReactNode } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { placeChain, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import { unitCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { ConfiguratorTabs } from '@/modules/modular-configurator-for-shop/components/public/ConfiguratorTabs'
import { PresetStart } from '@/modules/modular-configurator-for-shop/components/public/PresetStart'

/** Puck hands a slot field to render as a function returning the slot's blocks. */
type SlotRender = (props?: { className?: string; style?: React.CSSProperties }) => ReactNode

export type ShopModularConfiguratorProps = {
  buildLabel?: string
  individualLabel?: string
  intro?: string
  individual?: SlotRender
}

export const DEFAULT_BUILD_LABEL = 'Build a layout'
export const DEFAULT_INDIVIDUAL_LABEL = 'Shop individual items'
export const DEFAULT_INTRO = 'Put units together in 3D, see how much room it takes, and buy the whole arrangement in one go.'

const SAMPLE_PIECES: PieceDefinition[] = [
  { pieceId: 'left', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760 },
  { pieceId: 'middle', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760 },
  { pieceId: 'right', shape: { kind: 'straight', closedLeft: false, closedRight: true }, widthMm: 790, depthMm: 760 },
  { pieceId: 'corner', shape: { kind: 'corner', backSide: 'left' }, widthMm: 760, depthMm: 760 },
]
const SAMPLE_PRICES: Record<string, number> = { left: 344, middle: 306, right: 344, corner: 417 }
const SAMPLE_LABELS: Record<string, string> = { left: 'Left unit', middle: 'Middle unit', right: 'Right unit', corner: 'Corner unit' }

function samplePresets() {
  const definitions = new Map(SAMPLE_PIECES.map((piece) => [piece.pieceId, piece]))
  return suggestPresets(SAMPLE_PIECES, { maxPieces: 12 }).map((preset, index) => {
    const chain = preset.pieceIds.map((pieceId, position) => ({ entryId: `s${index}-${position}`, pieceId }))
    const total = preset.pieceIds.reduce((sum, pieceId) => sum + (SAMPLE_PRICES[pieceId] ?? 0), 0)
    return {
      key: String(index),
      name: preset.name,
      placed: placeChain(chain, definitions),
      unitCountText: unitCountLabel(chain.length),
      priceText: formatMoney(total),
    }
  })
}

function doNothing(): void {}

export function labelOr(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

export function ShopModularConfiguratorEditor(props: ShopModularConfiguratorProps) {
  return (
    <ConfiguratorTabs
      slug="editor-preview"
      buildLabel={labelOr(props.buildLabel, DEFAULT_BUILD_LABEL)}
      individualLabel={labelOr(props.individualLabel, DEFAULT_INDIVIDUAL_LABEL)}
      openingTab="individual"
      build={
        <PresetStart
          intro={props.intro?.trim() ?? DEFAULT_INTRO}
          labelFor={(pieceId) => SAMPLE_LABELS[pieceId] ?? 'Unit'}
          presets={samplePresets()}
          pricesInText="Sample layouts - the shop page shows the product's own"
          onStartPreset={doNothing}
          onDesignOwn={doNothing}
        />
      }
      individual={props.individual?.()}
    />
  )
}

export const shopModularConfiguratorPuckComponent = {
  label: 'Shop: Layout builder tabs (modular products)',
  fields: {
    buildLabel: { type: 'text' as const, label: 'Builder tab label (blank uses "Build a layout")' },
    individualLabel: { type: 'text' as const, label: 'Individual tab label (blank uses "Shop individual items")' },
    intro: { type: 'textarea' as const, label: 'Builder introduction' },
    // The page's own option, price and basket blocks go in here. A block that
    // must show under either tab (accessories, delivery links) goes after this
    // block instead.
    individual: { type: 'slot' as const, disallow: ['Split', 'ShopModularConfigurator'] },
  },
  // A slot's saved value is its list of blocks; Puck turns it into the render
  // function the component receives.
  defaultProps: { buildLabel: '', individualLabel: '', intro: DEFAULT_INTRO, individual: [] },
  render: ShopModularConfiguratorEditor,
}
