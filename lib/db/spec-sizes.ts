// Footprint suggestions from a product's own specification, for the set-up
// screen's "fill sizes from the specification" button. Read-only raw SQL over the
// product attributes module's tables, behind a to_regclass probe: that module is
// not required, and on a shop without it this simply suggests nothing.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { parseLengthToMm } from '@/modules/modular-configurator-for-shop/lib/length-parse'

export interface SuggestedFootprint {
  widthMm: number | null
  depthMm: number | null
}

// Tried in order: the overall figure is the footprint; a bare "Width" is the
// next best thing. "Seat Width" and friends are never the footprint.
const WIDTH_ATTRIBUTES = ['overall width', 'width']
const DEPTH_ATTRIBUTES = ['overall depth', 'depth']

async function hasAttributeTables(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT (
      to_regclass('public.pat_attributes') IS NOT NULL
      AND to_regclass('public.pat_attribute_values') IS NOT NULL
      AND to_regclass('public.pat_product_values') IS NOT NULL
    ) AS present
  `
  return rows[0]?.present === true
}

/** Suggested footprint per product id, for the products given. */
export async function suggestFootprints(productIds: readonly string[]): Promise<Map<string, SuggestedFootprint>> {
  const suggestions = new Map<string, SuggestedFootprint>()
  const unique = [...new Set(productIds)].filter(Boolean)
  if (unique.length === 0 || !(await hasAttributeTables())) return suggestions

  const wanted = [...WIDTH_ATTRIBUTES, ...DEPTH_ATTRIBUTES]
  const rows = await prisma.$queryRaw<Array<{ product_id: string; attribute: string; label: string }>>`
    SELECT pv."product_id", lower(a."name") AS attribute, av."label"
    FROM "pat_product_values" pv
    JOIN "pat_attribute_values" av ON av."id" = pv."value_id"
    JOIN "pat_attributes" a ON a."id" = av."attribute_id"
    WHERE pv."product_id" IN (${Prisma.join(unique)})
      AND lower(a."name") IN (${Prisma.join(wanted)})
  `
  const labelsByProduct = new Map<string, Map<string, string>>()
  for (const row of rows) {
    const labels = labelsByProduct.get(row.product_id) ?? new Map<string, string>()
    if (!labels.has(row.attribute)) labels.set(row.attribute, row.label)
    labelsByProduct.set(row.product_id, labels)
  }
  for (const [productId, labels] of labelsByProduct) {
    suggestions.set(productId, {
      widthMm: firstParsed(labels, WIDTH_ATTRIBUTES),
      depthMm: firstParsed(labels, DEPTH_ATTRIBUTES),
    })
  }
  return suggestions
}

function firstParsed(labels: ReadonlyMap<string, string>, attributeNames: readonly string[]): number | null {
  for (const name of attributeNames) {
    const label = labels.get(name)
    const parsed = label ? parseLengthToMm(label) : null
    if (parsed !== null) return parsed
  }
  return null
}
