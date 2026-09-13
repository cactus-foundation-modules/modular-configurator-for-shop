import { ModularConfiguratorEditor } from '@/modules/modular-configurator-for-shop/components/admin/ModularConfiguratorEditor'

// The shop.product-editor-sections entry: the Layout builder panel on a
// product's edit screen. Thin server shell - the editor is a client island that
// fetches its own set-up, so the section costs the page nothing until it opens.
export function ModularConfiguratorSection({ productId }: { productId: string }) {
  return <ModularConfiguratorEditor productId={productId} />
}
