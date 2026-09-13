-- modular-configurator-for-shop: a link from one product to another's layout builder.
--
-- One row per product that points shoppers at a layout builder elsewhere - a
-- ready-made set sending them to the range the set is made from, say. The link
-- sits under the short description (block "Shop: Build your own layout link")
-- and can open the builder already laid out, depending on what the shopper has
-- chosen on this product. `starting_layouts` refers to options by NAME and
-- values by SLUG, never by id, for the same reason `mcf_product_configs` does:
-- a catalogue re-import regenerates ids. See lib/layout-link-schema.ts.
CREATE TABLE IF NOT EXISTS "mcf_layout_links" (
  "product_id" TEXT PRIMARY KEY,
  -- The product whose layout builder the link opens.
  "target_product_id" TEXT NOT NULL,
  "lead_text" TEXT NOT NULL DEFAULT '',
  "link_text" TEXT NOT NULL DEFAULT '',
  "new_tab" BOOLEAN NOT NULL DEFAULT FALSE,
  "starting_layouts" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mcf_layout_links_product_fkey" FOREIGN KEY ("product_id")
    REFERENCES "shp_products" ("id") ON DELETE CASCADE,
  CONSTRAINT "mcf_layout_links_target_fkey" FOREIGN KEY ("target_product_id")
    REFERENCES "shp_products" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mcf_layout_links_target_idx" ON "mcf_layout_links" ("target_product_id");
