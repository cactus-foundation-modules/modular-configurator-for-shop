// $queryRaw over mcf_layout_links, matching configs.ts beside it. The starting
// layouts column is parsed defensively on the way out (see
// parseStoredStartingLayouts): a damaged entry is dropped, not thrown.
import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import {
  parseStoredStartingLayouts,
  type LayoutLink,
} from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'

interface RawLinkRow {
  target_product_id: string
  lead_text: string
  link_text: string
  new_tab: boolean
  starting_layouts: unknown
}

export async function getLayoutLink(productId: string): Promise<LayoutLink | null> {
  const rows = await prisma.$queryRaw<RawLinkRow[]>`
    SELECT "target_product_id", "lead_text", "link_text", "new_tab", "starting_layouts"
    FROM "mcf_layout_links"
    WHERE "product_id" = ${productId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return {
    targetProductId: row.target_product_id,
    leadText: row.lead_text,
    linkText: row.link_text,
    newTab: row.new_tab,
    startingLayouts: parseStoredStartingLayouts(row.starting_layouts),
  }
}

/** One read per product per request, however many blocks ask. */
export const getLayoutLinkCached = cache(getLayoutLink)

export async function saveLayoutLink(productId: string, link: LayoutLink): Promise<void> {
  const layoutsJson = JSON.stringify(link.startingLayouts)
  await prisma.$executeRaw`
    INSERT INTO "mcf_layout_links"
      ("product_id", "target_product_id", "lead_text", "link_text", "new_tab", "starting_layouts", "updated_at")
    VALUES (${productId}, ${link.targetProductId}, ${link.leadText}, ${link.linkText}, ${link.newTab}, ${layoutsJson}::jsonb, NOW())
    ON CONFLICT ("product_id") DO UPDATE SET
      "target_product_id" = EXCLUDED."target_product_id",
      "lead_text" = EXCLUDED."lead_text",
      "link_text" = EXCLUDED."link_text",
      "new_tab" = EXCLUDED."new_tab",
      "starting_layouts" = EXCLUDED."starting_layouts",
      "updated_at" = NOW()
  `
}

export async function deleteLayoutLink(productId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "mcf_layout_links" WHERE "product_id" = ${productId}`
}

export interface BuilderProductRow {
  productId: string
  name: string
  slug: string
}

/** Every product with its layout builder switched on, by name: the link's possible targets. */
export async function listBuilderProducts(): Promise<BuilderProductRow[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
    SELECT p."id", p."name", p."slug"
    FROM "mcf_product_configs" c
    JOIN "shp_products" p ON p."id" = c."product_id"
    WHERE c."enabled" = TRUE
    ORDER BY p."name" ASC, p."id" ASC
  `
  return rows.map((row) => ({ productId: row.id, name: row.name, slug: row.slug }))
}
