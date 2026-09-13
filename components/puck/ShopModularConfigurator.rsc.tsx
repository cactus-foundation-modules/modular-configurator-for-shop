// The storefront half of the layout builder block: resolve the page's product and
// its set-up server-side and hand the card its data, so the card is in the first
// HTML beside the option controls. Renders nothing at all for a product that has
// not switched the builder on, so the block can sit in the shared product layout.
import { currentProductSlug } from '@/modules/shop-variations/lib/variation-bootstrap'
import { loadConfiguratorBlockData } from '@/modules/modular-configurator-for-shop/lib/storefront-payload'
import { ConfiguratorCard } from '@/modules/modular-configurator-for-shop/components/public/ConfiguratorCard'
import {
  DEFAULT_HEADING,
  DEFAULT_INTRO,
  shopModularConfiguratorPuckComponent,
  type ShopModularConfiguratorProps,
} from '@/modules/modular-configurator-for-shop/components/puck/ShopModularConfigurator'

async function ShopModularConfiguratorRsc(props: ShopModularConfiguratorProps) {
  const slug = currentProductSlug()
  if (!slug) return null
  const data = await loadConfiguratorBlockData(slug)
  if (!data) return null
  return (
    <ConfiguratorCard
      storefront={data.payload}
      bootstrap={data.bootstrap}
      heading={props.heading?.trim() || DEFAULT_HEADING}
      intro={props.intro?.trim() ?? DEFAULT_INTRO}
    />
  )
}

export const shopModularConfiguratorPuckRscComponent = {
  ...shopModularConfiguratorPuckComponent,
  render: ShopModularConfiguratorRsc,
}
