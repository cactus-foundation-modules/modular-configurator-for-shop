<p align="center">
  <img src="module-art.webp" alt="Modular Configurator for Shop" width="640" />
</p>

# Modular Configurator for Shop

Lets a shopper build a layout out of a modular product's units - a sofa that turns a
corner, a run of bench seating - in 3D on the product page, see how much floor it
takes, and put the whole arrangement in the basket in one go.

It works on the variations and 3D models a product already has. A unit is simply one
value of one option ("Unit: Left Unit / Central Unit / Corner Unit / Right Unit"), and
every unit in a layout is bought as the real variation it is, at its own price.

## Requires

| Module | Minimum | Why |
|---|---|---|
| `shop` | 0.1.429 | Products, the basket, and the cart-line resolver seam the layout groups its lines through |
| `shop-variations` | 0.1.187 | The variation payload, the shared option selection, and purchase companions |
| `product-3d-views-for-shop` | 0.1.105 | The model loader, fabric painting, lighting and the painted-bundle route |

`product-attributes-for-shop` is **not** required. Unit footprints can be suggested
from each unit's "Overall Width" and "Overall Depth" specification, read with raw SQL
behind a `to_regclass` probe; on a shop without it the sizes are simply typed in.

## Setting it up

1. Install the module, then put the **Shop: Layout builder tabs (modular products)** block
   in the product page layout, straight after the short description, and drag the page's
   option, price, delivery and Add to basket blocks into its **Shop individual items**
   slot. Blocks that belong under both tabs (accessories, delivery links) go after it.
   On a product without the builder the block shows its slot's blocks and nothing else -
   no tabs - so the shared layout is the right place for it.
2. On the product's edit screen, open **Layout builder**:
   - tick **Show the layout builder on this product**;
   - pick the option whose values are the units;
   - tick each unit and say how it joins - no arms (with or without a back), arm on the
     left, arm on the right, arms both sides, a corner with its second back on the left or
     right, a quarter-circle curve with its back outside, inside or no back at all, or a
     rounded end that wraps one row round to the row behind it - always as seen from the
     front; its footprint in millimetres (a curve's size and seat depth); and how its 3D
     model is turned. Leave that on **Work it out from each model**: supplier files face
     every which way, often differently from one variation to the next, and the builder
     turns each file to match the shape it was told the unit is (`lib/model-orientation.ts`);
   - optionally write ready-made layouts. With none, shoppers are offered a pair, a row
     of three, an L, a U, a booth, a round island and a capsule island, built from the
     units ticked, wherever the range can make them.

## Linking a ready-made set to the builder

A product that is not built from units itself - a ready-made set made from the range - can
carry a line under its short description sending shoppers to the product with the builder:

1. Put the **Shop: Build your own layout link (modular products)** block in the product page
   layout, straight after the short description. It renders nothing on products without a link.
2. On the set's edit screen, open **Layout builder** -> **Link to a layout builder on another
   product**: pick the builder product, the words before the link and the link itself, whether
   it opens in a new tab, and optionally **starting layouts** - units from the builder product,
   each used "whatever is chosen" or when one of the set's own choices is picked (an 8 or a 10
   seater, a left or right arm).

The address follows the shopper (`lib/layout-link.ts`): the first starting layout their choices
meet, else the unconditional one, written as `?modular-layout=`; plus each choice the builder
product also offers - same option name and value, or else the one option holding that value
slug ("Back Height: High Back" -> `back=high-back`) - as its own shop-variations parameter, so
the builder opens on the same fabric. The line hides itself when the builder product is
archived, hidden or has its builder switched off.

## How a layout goes together

A layout is a chain. Walking it from first unit to last is walking each straight run
from its left end to its right end, as seen standing in front of the seats (the way the
product photographs show them). So:

- a unit with an arm on its left can only start a layout, one with an arm on its right
  can only finish it;
- a corner turns the chain towards the seats' front, and the unit after it always lands
  against the corner's open side with its back in line with the corner's second back;
- a curve with its back outside turns towards the seats' front too (three make a booth),
  one with its back inside turns away from it (four make a round island), and one with no
  back goes whichever way fits - the shopper can turn it round from its panel;
- a rounded end joins the end of one row to the end of the row behind it, back to back,
  so two rounded ends and two rows make a capsule island. A layout that joins up all the
  way round has no ends left to add to.

`lib/chain-geometry.ts` places every unit from that one rule (a "turtle walk" gluing
each unit's entry face to the previous unit's exit face) and `lib/chain-editing.ts`
refuses any edit that would put an arm in the middle, overlap two units (by their real
outlines, not the boxes round them) or exceed the size limit. The 3D view, the plan, the
price and the basket all read the same placement, so they cannot disagree.

Options other than the unit are chosen once for the layout. A unit not made in the
layout's choice - a backless unit that only comes in a standard back, say - is matched to
the nearest combination it is made in, and its row says what it is in
(`lib/layout-pricing.ts`).

## What the shopper gets

- **Two tabs under the short description**: "Shop individual items", then "Build a layout"
  (both labels editable on the block). The page opens on the individual items; only a
  layout link opens the builder.
- **In "Build a layout"**, the ready-made shapes drawn to scale and priced in the options
  chosen on the page, and "Design your own". Choosing one starts the builder. **The layout
  view takes over the product gallery's main picture** - 3D, or the plan from above, with
  overall sizes on or off - with a "Your layout" thumbnail leading the strip and the
  photographs still underneath it; clicking a photo shows the photo, and any change to the
  layout brings the view back. Switching to "Shop individual items" hands the gallery back.
  (On a page with no gallery, the view is drawn in the tab instead.) The tab holds what can be added where
  and why not, the units in order, a panel for the selected unit (swap it, give it its own
  fabric, take it out), starting shapes, the layout's own options, undo, then the price
  (styled like the individual tab's, with "Reset options" beside it to start again), the
  delivery choice in the basket's own box and chips - services every unit can have, dated
  by the unit arriving last, priced per item with the layout's total - and "Add layout to
  basket". The 3D view only loads once a layout is started. The
  plan does everything the 3D view does, by keyboard.
- **Both tabs share one set of choices**: a fabric picked in either is picked in the other.
- **A link that reopens the layout**: `?modular-layout=left-unit.central-unit~upholstery-colour:rivet-olive.corner-unit`.
  A backless curve laid the other way round carries `~flip`.
- **One grouped set of basket lines** - one line per distinct variation, repeats folded
  into a quantity, the first unit heading the group with the layout's shape and
  arrangement written on it for whoever packs the order.

## Product add-ons

The add-ons box keeps working exactly as it does on any product. Two things to know:

- **The layout's 3D view never changes for add-ons.** Each unit is drawn from its own
  painted bundle with no add-on model context, whatever is ticked.
- **Accessories group with the layout** when the product the add-ons box is adding them
  for is one of the layout's units: the layout's resolver joins the group the add-ons box
  already heads, so units and accessories nest under one line whichever order they were
  bought in. An accessory added while the page's own options name a variation that is not
  in the layout renders as its own line, as it would on any product.
- Recommended add-on quantities are still per single unit, from the page's own quantity.

## Data

`mcf_product_configs` - one row per listing: `product_id` (FK to `shp_products`, cascade),
`enabled`, and `config` jsonb (see `lib/config-schema.ts`). Options are referred to by
name and values by slug, never by id, so a catalogue re-import leaves the set-up intact.

`mcf_layout_links` - one row per product linking to a builder: `product_id` (PK, FK cascade),
`target_product_id` (FK cascade), `lead_text`, `link_text`, `new_tab`, `starting_layouts` jsonb
(see `lib/layout-link-schema.ts`), options by name and values by slug.

Basket lines carry `meta.modularLayout` (`lib/line-meta.ts`): the layout id, role,
listing, shape, unit and line counts, arrangement and link code, all size-capped.

## Extension points

| Point | Entry |
|---|---|
| `shop.product-editor-sections` | `components/admin/ModularConfiguratorSection` - the Layout builder panel |
| `shop.gallery-media` | `lib/gallery-provider#modularLayoutGalleryProvider` - the layout view on the gallery stage |
| `shop.cart-line-resolver` | `lib/line-resolver#resolveLayoutLineMeta` |
| `shop.cart-line-resolver-prefetch` | `lib/line-resolver#prefetchLayoutLines` |

Puck blocks `ShopModularConfigurator` and `ShopModularLayoutLink` on the `shopProductDetail`
layout type. Admin API (`shop.products`):
`GET` / `PUT /api/m/modular-configurator-for-shop/admin/products/[productId]` and
`GET` / `PUT /api/m/modular-configurator-for-shop/admin/products/[productId]/layout-link`.

## Tests

- `npx vitest run modules/modular-configurator-for-shop` - placement, editing, pricing,
  link codes, basket lines, grouping and set-up validation.
- `RUN_MODULAR_CONFIGURATOR_SQL=1 npx vitest run modules/modular-configurator-for-shop/lib/db/configurator-sql.live.test.ts`
  with `OVH_SERVER` / `OVH_USER` / `OVH_PASSWORD` exported - every raw statement against a
  throwaway Postgres. A skip is not a pass.
