// The storefront half of the "Build your own layout link" block. Nothing at all -
// no markup - on a product without a link, which is nearly all of them, so the
// block can sit in the shared product layout straight after the short description.
import { currentProductSlug } from '@/modules/shop-variations/lib/variation-bootstrap'
import { loadLayoutLinkBlockData } from '@/modules/modular-configurator-for-shop/lib/layout-link-storefront'
import { LayoutLinkView } from '@/modules/modular-configurator-for-shop/components/public/LayoutLinkView'
import { shopModularLayoutLinkPuckComponent } from '@/modules/modular-configurator-for-shop/components/puck/ShopModularLayoutLink'

async function ShopModularLayoutLinkRsc() {
  const slug = currentProductSlug()
  const data = slug ? await loadLayoutLinkBlockData(slug) : null
  return data ? <LayoutLinkView data={data} /> : null
}

export const shopModularLayoutLinkPuckRscComponent = {
  ...shopModularLayoutLinkPuckComponent,
  render: ShopModularLayoutLinkRsc,
}
