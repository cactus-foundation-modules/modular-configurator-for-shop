// The stored shape of a product's link to a layout builder on another product,
// and the one place it is validated. Shared by the admin route (what may be
// saved), the storefront block (what is read back) and the editor (what it
// edits), so the three can never disagree about a field.
//
// Options are referred to by NAME and values by SLUG, never by id, as the
// builder's own set-up is: a catalogue re-import regenerates ids.
import { z } from 'zod'
import { MAX_PIECES_CEILING } from '@/modules/modular-configurator-for-shop/lib/config-schema'

export const MAX_STARTING_LAYOUTS = 12
export const DEFAULT_LEAD_TEXT = 'Need a custom layout?'
export const DEFAULT_LINK_TEXT = 'Click to create your own layout'

/** A choice on THIS product that picks a starting layout: "Seats is 10 Seater". */
export const LinkConditionSchema = z.object({
  optionName: z.string().trim().min(1).max(200),
  valueSlug: z.string().trim().min(1).max(200),
})

export const StartingLayoutSchema = z.object({
  /** Null for the layout used whatever is chosen (or while nothing is). */
  when: LinkConditionSchema.nullable(),
  /** Unit option value slugs of the TARGET product, in the order they join. */
  valueSlugs: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_PIECES_CEILING),
})

export const LayoutLinkSchema = z.object({
  targetProductId: z.string().trim().min(1).max(200),
  /** Plain text before the link. Blank shows the link on its own. */
  leadText: z.string().trim().max(200),
  /** The link's own words. The editor starts a new link on the defaults above. */
  linkText: z.string().trim().min(1).max(200),
  newTab: z.boolean(),
  startingLayouts: z.array(StartingLayoutSchema).max(MAX_STARTING_LAYOUTS),
})

export type LinkCondition = z.infer<typeof LinkConditionSchema>
export type StartingLayout = z.infer<typeof StartingLayoutSchema>
export type LayoutLink = z.infer<typeof LayoutLinkSchema>

/** What the admin editor sends: a link to save, or null to take it away. */
export const SaveLayoutLinkBodySchema = z.object({
  link: LayoutLinkSchema.nullable(),
})

export type SaveLayoutLinkBody = z.infer<typeof SaveLayoutLinkBodySchema>

/**
 * Reads stored starting layouts defensively. A damaged entry is dropped rather
 * than breaking the product page: the link still shows, and opens the builder
 * product without a layout in it.
 */
export function parseStoredStartingLayouts(raw: unknown): StartingLayout[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const parsed = StartingLayoutSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}
