// The editor half of the layout builder block. A static, inert preview: the real
// card needs the product's variations and set-up, which the editor canvas does
// not have. It renders the same card markup the shop page does, drawn from a
// sample range, so the layout reads true while it is being arranged.
import { placeChain, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import { unitCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'
import { formatMoney } from '@/modules/shop/lib/money'
import { ConfiguratorCardView } from '@/modules/modular-configurator-for-shop/components/public/ConfiguratorCardView'

export type ShopModularConfiguratorProps = {
  heading?: string
  intro?: string
}

export const DEFAULT_HEADING = 'Build a layout'
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

export function ShopModularConfiguratorEditor(props: ShopModularConfiguratorProps) {
  return (
    <ConfiguratorCardView
      heading={props.heading?.trim() || DEFAULT_HEADING}
      intro={props.intro?.trim() ?? DEFAULT_INTRO}
      labelFor={(pieceId) => SAMPLE_LABELS[pieceId] ?? 'Unit'}
      presets={samplePresets()}
      pricesInText="Sample prices - the shop page shows the product's own"
      summary={null}
      statusText={null}
      onStartPreset={doNothing}
      onDesignOwn={doNothing}
      onEdit={doNothing}
      onAddToBasket={doNothing}
      onStartAgain={doNothing}
    />
  )
}

export const shopModularConfiguratorPuckComponent = {
  label: 'Shop: Layout builder (modular products)',
  fields: {
    heading: { type: 'text' as const, label: 'Heading (blank uses "Build a layout")' },
    intro: { type: 'textarea' as const, label: 'Introduction' },
  },
  defaultProps: { heading: '', intro: DEFAULT_INTRO } as ShopModularConfiguratorProps,
  render: ShopModularConfiguratorEditor,
}
