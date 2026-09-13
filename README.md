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
   - tick each unit and say how it joins (no arms, arm on the left, arm on the right,
     arms both sides, or a corner with its second back on the left or right - always as
     seen from the front), its footprint in millimetres, and whether its 3D model needs
     turning to face forwards;
   - optionally write ready-made layouts. With none, shoppers are offered a pair, a row
     of three, an L and a U, built from the units ticked, wherever the range can make them.

## How a layout goes together

A layout is a chain. Walking it from first unit to last is walking each straight run
from its left end to its right end, as seen standing in front of the seats (the way the
product photographs show them). So:

- a unit with an arm on its left can only start a layout, one with an arm on its right
  can only finish it;
- a corner turns the chain towards the seats' front, and the unit after it always lands
  against the corner's open side with its back in line with the corner's second back.

`lib/chain-geometry.ts` places every unit from that one rule (a "turtle walk" gluing
each unit's entry face to the previous unit's exit face) and `lib/chain-editing.ts`
refuses any edit that would put an arm in the middle, overlap two units or exceed the
size limit. The 3D view, the plan, the price and the basket all read the same placement,
so they cannot disagree.

## What the shopper gets

- **Two tabs under the short description**: "Build a layout" and "Shop individual items"
  (both labels editable on the block). The page opens on the builder, unless its address
  names a single unit - an advert's or a shared variation's link - when it opens on the
  individual items, at the price that was clicked. A layout link always opens the builder.
- **In "Build a layout"**, the ready-made shapes drawn to scale and priced in the options
  chosen on the page, and "Design your own". Choosing one starts the builder in place: the
  view (3D, or the plan from above, with overall sizes on or off), what can be added where
  and why not, the units in order, a panel for the selected unit (swap it, give it its own
  fabric, take it out), starting shapes, the layout's own options, undo, and the total with
  an "Add layout to basket" button. The 3D view only loads once a layout is started. The
  plan does everything the 3D view does, by keyboard.
- **Both tabs share one set of choices**: a fabric picked in either is picked in the other.
- **A link that reopens the layout**: `?modular-layout=left-unit.central-unit~upholstery-colour:rivet-olive.corner-unit`.
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

Basket lines carry `meta.modularLayout` (`lib/line-meta.ts`): the layout id, role,
listing, shape, unit and line counts, arrangement and link code, all size-capped.

## Extension points

| Point | Entry |
|---|---|
| `shop.product-editor-sections` | `components/admin/ModularConfiguratorSection` - the Layout builder panel |
| `shop.cart-line-resolver` | `lib/line-resolver#resolveLayoutLineMeta` |
| `shop.cart-line-resolver-prefetch` | `lib/line-resolver#prefetchLayoutLines` |

Puck block `ShopModularConfigurator` on the `shopProductDetail` layout type. Admin API:
`GET` / `PUT /api/m/modular-configurator-for-shop/admin/products/[productId]`
(`shop.products`).

## Tests

- `npx vitest run modules/modular-configurator-for-shop` - placement, editing, pricing,
  link codes, basket lines, grouping and set-up validation.
- `RUN_MODULAR_CONFIGURATOR_SQL=1 npx vitest run modules/modular-configurator-for-shop/lib/db/configurator-sql.live.test.ts`
  with `OVH_SERVER` / `OVH_USER` / `OVH_PASSWORD` exported - every raw statement against a
  throwaway Postgres. A skip is not a pass.
