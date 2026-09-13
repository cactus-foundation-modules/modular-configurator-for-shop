// The storefront half of the "Build a layout / Shop individual items" block.
//
// A product with the layout builder switched on gets both tabs, opening on the
// builder unless the address names a single unit (an advert's link). Every other
// product gets the individual slot's blocks exactly as if this block were not
// there - no tab bar, no builder, no extra markup - so the block can sit in the
// shared product layout.
import { currentProductPageSearchParams } from '@/modules/shop/lib/product-page-params'
import { currentProductSlug } from '@/modules/shop-variations/lib/variation-bootstrap'
import { loadConfiguratorBlockData } from '@/modules/modular-configurator-for-shop/lib/storefront-payload'
import { openingTabFor } from '@/modules/modular-configurator-for-shop/lib/opening-tab'
import { ConfiguratorTabs } from '@/modules/modular-configurator-for-shop/components/public/ConfiguratorTabs'
import { LayoutBuilder } from '@/modules/modular-configurator-for-shop/components/public/LayoutBuilder'
import {
  DEFAULT_BUILD_LABEL,
  DEFAULT_INDIVIDUAL_LABEL,
  DEFAULT_INTRO,
  labelOr,
  shopModularConfiguratorPuckComponent,
  type ShopModularConfiguratorProps,
} from '@/modules/modular-configurator-for-shop/components/puck/ShopModularConfigurator'

async function ShopModularConfiguratorRsc(props: ShopModularConfiguratorProps) {
  const individual = props.individual?.() ?? null
  const slug = currentProductSlug()
  const data = slug ? await loadConfiguratorBlockData(slug) : null
  if (!data) return <>{individual}</>
  return (
    <ConfiguratorTabs
      buildLabel={labelOr(props.buildLabel, DEFAULT_BUILD_LABEL)}
      individualLabel={labelOr(props.individualLabel, DEFAULT_INDIVIDUAL_LABEL)}
      openingTab={openingTabFor(currentProductPageSearchParams(), data.payload.pieceOptionName)}
      build={<LayoutBuilder storefront={data.payload} bootstrap={data.bootstrap} intro={props.intro?.trim() ?? DEFAULT_INTRO} />}
      individual={individual}
    />
  )
}

export const shopModularConfiguratorPuckRscComponent = {
  ...shopModularConfiguratorPuckComponent,
  render: ShopModularConfiguratorRsc,
}
