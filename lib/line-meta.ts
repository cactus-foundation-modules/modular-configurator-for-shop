// What a layout writes onto each basket line, and the one reader for it. Shared
// by the product page (which writes it) and the basket resolver (which reads it
// back from whatever the browser sent - so it is parsed, never trusted).
//
// The basket keeps a line's meta to 4000 bytes and its id to 64 characters (see
// shop's cart store route), so the free-text fields here are capped well inside
// that, leaving room for the other modules that stamp the same line (a delivery
// service, an accessory group).
import { z } from 'zod'
import { MAX_PIECES_CEILING } from '@/modules/modular-configurator-for-shop/lib/config-schema'

export const LAYOUT_META_KEY = 'modularLayout'

const MAX_ARRANGEMENT_LENGTH = 900
const MAX_CODE_LENGTH = 1200

export const LayoutLineMetaSchema = z.object({
  /** Ties the lines of one layout together; a fresh one per add. */
  layoutId: z.string().regex(/^[a-z0-9]{6,16}$/),
  /** 'main' is the line the rest nest under in the basket. */
  role: z.enum(['main', 'unit']),
  /** The listing the layout was built on. */
  parentProductId: z.string().min(1).max(64),
  shapeLabel: z.string().min(1).max(40),
  unitCount: z.number().int().min(1).max(MAX_PIECES_CEILING * 999),
  /** How many distinct lines the layout went in as, so a removed one shows. */
  lineCount: z.number().int().min(1).max(MAX_PIECES_CEILING),
  /** "Left Unit → Central Unit → Corner Unit", read by whoever packs it. */
  arrangement: z.string().max(MAX_ARRANGEMENT_LENGTH),
  /** The same layout as a link code, to reopen it; empty when too long to keep. */
  code: z.string().max(MAX_CODE_LENGTH),
  /** Position of this line within its layout, first unit first. */
  order: z.number().int().min(0).max(MAX_PIECES_CEILING),
})

export type LayoutLineMeta = z.infer<typeof LayoutLineMetaSchema>

export function readLayoutLineMeta(meta: Record<string, unknown> | undefined): LayoutLineMeta | null {
  const parsed = LayoutLineMetaSchema.safeParse(meta?.[LAYOUT_META_KEY])
  return parsed.success ? parsed.data : null
}

/** Trims free text to what the meta may carry, marking the cut. */
export function fitArrangement(arrangement: string): string {
  return arrangement.length <= MAX_ARRANGEMENT_LENGTH
    ? arrangement
    : `${arrangement.slice(0, MAX_ARRANGEMENT_LENGTH - 1)}…`
}

/** A code too long to keep is dropped rather than cut: half a layout reopens wrong. */
export function fitCode(code: string): string {
  return code.length <= MAX_CODE_LENGTH ? code : ''
}
