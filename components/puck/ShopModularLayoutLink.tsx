// The editor half of the "Build your own layout link" block: a line under the
// short description on a product that points shoppers at a layout builder on
// another product (a ready-made set sending them to the range it is made from).
//
// What it says and where it goes are set per product, on the product's edit
// screen under Layout builder, so the canvas shows the default wording with a
// link going nowhere. Same markup as the storefront (LayoutLinkLine).
import { LayoutLinkLine } from '@/modules/modular-configurator-for-shop/components/public/LayoutLinkLine'
import { DEFAULT_LEAD_TEXT, DEFAULT_LINK_TEXT } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'

export function ShopModularLayoutLinkEditor() {
  return <LayoutLinkLine leadText={DEFAULT_LEAD_TEXT} linkText={DEFAULT_LINK_TEXT} newTab={false} href="#" />
}

export const shopModularLayoutLinkPuckComponent = {
  label: 'Shop: Build your own layout link (modular products)',
  fields: {},
  defaultProps: {},
  render: ShopModularLayoutLinkEditor,
}
