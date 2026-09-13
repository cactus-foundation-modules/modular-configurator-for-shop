import { ModularConfiguratorEditor } from '@/modules/modular-configurator-for-shop/components/admin/ModularConfiguratorEditor'
import { LayoutLinkEditor } from '@/modules/modular-configurator-for-shop/components/admin/LayoutLinkEditor'

// The shop.product-editor-sections entry: the Layout builder panel on a
// product's edit screen. Thin server shell - both editors are client islands
// that fetch their own set-up, so the section costs the page nothing until it
// opens. Two halves: the builder on this product, then a link from this product
// to the builder on another (a ready-made set pointing at its range).
const headingStyle = { margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' } as const

export function ModularConfiguratorSection({ productId }: { productId: string }) {
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={headingStyle}>Build layouts on this product</h3>
        <ModularConfiguratorEditor productId={productId} />
      </section>
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={headingStyle}>Link to a layout builder on another product</h3>
        <LayoutLinkEditor productId={productId} />
      </section>
    </div>
  )
}
