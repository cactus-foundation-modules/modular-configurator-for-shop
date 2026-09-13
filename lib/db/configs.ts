// $queryRaw over mcf_product_configs, matching the raw-SQL data layers of the
// other shop companions. The config column is parsed defensively on the way out
// (see parseStoredConfig): a damaged row reads as "not set up".
import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import {
  parseStoredConfig,
  type ConfiguratorConfig,
} from '@/modules/modular-configurator-for-shop/lib/config-schema'

export interface ProductConfiguratorRow {
  productId: string
  enabled: boolean
  config: ConfiguratorConfig
  updatedAt: string
}

interface RawRow {
  product_id: string
  enabled: boolean
  config: unknown
  updated_at: Date
}

export async function getProductConfigurator(productId: string): Promise<ProductConfiguratorRow | null> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT "product_id", "enabled", "config", "updated_at"
    FROM "mcf_product_configs"
    WHERE "product_id" = ${productId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return {
    productId: row.product_id,
    enabled: row.enabled,
    config: parseStoredConfig(row.config),
    updatedAt: row.updated_at.toISOString(),
  }
}

/** One read per product per request, however many blocks ask. */
export const getProductConfiguratorCached = cache(getProductConfigurator)

export async function saveProductConfigurator(
  productId: string,
  enabled: boolean,
  config: ConfiguratorConfig,
): Promise<void> {
  const configJson = JSON.stringify(config)
  await prisma.$executeRaw`
    INSERT INTO "mcf_product_configs" ("product_id", "enabled", "config", "updated_at")
    VALUES (${productId}, ${enabled}, ${configJson}::jsonb, NOW())
    ON CONFLICT ("product_id") DO UPDATE SET
      "enabled" = EXCLUDED."enabled",
      "config" = EXCLUDED."config",
      "updated_at" = NOW()
  `
}
