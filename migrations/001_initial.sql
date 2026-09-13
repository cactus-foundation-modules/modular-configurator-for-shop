-- modular-configurator-for-shop: per-product layout builder settings.
--
-- One row per listing (a parent product with variations) that offers the
-- layout builder. Everything about HOW its units join - which option holds the
-- units, each unit's shape and footprint, the ready-made layouts - lives in
-- `config` jsonb, and refers to shop-variations options by NAME and values by
-- SLUG, never by id: a catalogue re-import regenerates ids and would silently
-- detach every stored unit. See lib/config-schema.ts for the shape.
CREATE TABLE IF NOT EXISTS "mcf_product_configs" (
  "product_id" TEXT PRIMARY KEY,
  -- Off keeps the saved set-up but takes the builder off the product page.
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mcf_product_configs_product_fkey" FOREIGN KEY ("product_id")
    REFERENCES "shp_products" ("id") ON DELETE CASCADE
);
