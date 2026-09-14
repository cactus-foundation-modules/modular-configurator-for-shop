// The `shop.gallery-media` provider: on a product with the layout builder
// switched on, the gallery gains the layout view - its stage and a "Your layout"
// thumbnail - which the builder puts up once a layout is started. Every other
// product gets null, and its gallery renders exactly as before.
//
// Server-only (prisma, through the readers below). The payload is only the
// product's slug: the view draws from what the builder publishes in the browser
// (see components/public/layout-stage-store.ts), so nothing about the layout has
// to be resolved or sent twice.
import type { ShopGalleryMediaProvider } from '@/modules/shop/lib/gallery-media'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getProductConfiguratorCached } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { GalleryLayoutStage, GalleryLayoutThumbs, type GalleryLayoutPayload } from '@/modules/modular-configurator-for-shop/components/public/GalleryLayoutMedia'

export const modularLayoutGalleryProvider: ShopGalleryMediaProvider = {
  async load(productId: string): Promise<GalleryLayoutPayload | null> {
    const saved = await getProductConfiguratorCached(productId)
    if (!saved?.enabled || saved.config.pieces.length === 0) return null
    const product = await getProductById(productId)
    return product ? { slug: product.slug } : null
  },
  Thumbs: GalleryLayoutThumbs,
  Stage: GalleryLayoutStage,
  mobileStage: 'immersive',
}
