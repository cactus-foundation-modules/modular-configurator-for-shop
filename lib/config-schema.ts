// The stored shape of one listing's layout builder set-up, and the one place it
// is validated. Shared by the admin route (what may be saved), the storefront
// payload (what is read back) and the editor (what it edits), so the three can
// never disagree about a field.
//
// Options are referred to by NAME and values by SLUG, never by id - the same
// rule product add-ons follows, for the same reason: a catalogue re-import
// regenerates ids, and a set-up keyed on them would quietly detach every unit.
import { z } from 'zod'
import { AUTOMATIC_MODEL_TURN } from '@/modules/modular-configurator-for-shop/lib/model-orientation'

/** Largest footprint a single unit may declare, in millimetres (6 m). */
export const MAX_UNIT_SIDE_MM = 6000
/** Hard ceiling on a layout's size, whatever a set-up asks for. */
export const MAX_PIECES_CEILING = 30
export const DEFAULT_MAX_PIECES = 12

/**
 * When the one-line summary ("L-shape · 3 units · 1.98 m wide × 0.66 m deep")
 * sits over the layout view: always, or only while Sizes is switched on and
 * never at the site's phone width.
 */
export const VIEW_SUMMARY_CHOICES = ['always', 'with-sizes'] as const
export type ViewSummaryChoice = (typeof VIEW_SUMMARY_CHOICES)[number]

const StraightShapeSchema = z.object({
  kind: z.literal('straight'),
  closedLeft: z.boolean(),
  closedRight: z.boolean(),
  backless: z.boolean().optional(),
})

const CornerShapeSchema = z.object({
  kind: z.literal('corner'),
  backSide: z.enum(['left', 'right']),
})

const CurveShapeSchema = z.object({
  kind: z.literal('curve'),
  back: z.enum(['outside', 'inside', 'none']),
  seatDepthMm: z.number().int().min(50).max(MAX_UNIT_SIDE_MM),
})

/** Half a ring: `widthMm` is its outer diameter, `depthMm` its outer radius. */
const HalfCurveShapeSchema = z.object({
  kind: z.literal('half-curve'),
  back: z.enum(['outside', 'inside', 'none']),
  seatDepthMm: z.number().int().min(50).max(MAX_UNIT_SIDE_MM),
})

const RoundEndShapeSchema = z.object({
  kind: z.literal('round-end'),
})

export const PieceShapeSchema = z.discriminatedUnion('kind', [
  StraightShapeSchema,
  CornerShapeSchema,
  CurveShapeSchema,
  HalfCurveShapeSchema,
  RoundEndShapeSchema,
])

export const PieceConfigSchema = z.object({
  /** Slug of the option value this unit is, within the unit option. */
  valueSlug: z.string().trim().min(1).max(200),
  shape: PieceShapeSchema,
  widthMm: z.number().int().min(50).max(MAX_UNIT_SIDE_MM),
  depthMm: z.number().int().min(50).max(MAX_UNIT_SIDE_MM),
  /**
   * Quarter turns (in degrees, clockwise from above) that bring the unit's 3D
   * model round to face the shopper, or 'auto' to work it out from each model
   * file - the default, and the only setting that copes with a unit whose
   * variations' files face different ways. A number is the owner overruling it.
   */
  modelTurnDegrees: z
    .union([z.literal(AUTOMATIC_MODEL_TURN), z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(AUTOMATIC_MODEL_TURN),
})

export const PresetConfigSchema = z.object({
  name: z.string().trim().min(1).max(60),
  valueSlugs: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_PIECES_CEILING),
})

export const ConfiguratorConfigSchema = z.object({
  /** Name of the variation option whose values are the units (e.g. "Unit"). */
  pieceOptionName: z.string().trim().min(1).max(200),
  maxPieces: z.number().int().min(1).max(MAX_PIECES_CEILING),
  pieces: z.array(PieceConfigSchema).max(100),
  /** Owner-made starting layouts. Empty means the storefront suggests its own. */
  presets: z.array(PresetConfigSchema).max(12),
  /** Absent on a set-up saved before the choice existed, which keeps the summary showing. */
  viewSummary: z.enum(VIEW_SUMMARY_CHOICES).default('always'),
})

export type PieceShapeConfig = z.infer<typeof PieceShapeSchema>
export type PieceConfig = z.infer<typeof PieceConfigSchema>
export type PresetConfig = z.infer<typeof PresetConfigSchema>
export type ConfiguratorConfig = z.infer<typeof ConfiguratorConfigSchema>

export const EMPTY_CONFIGURATOR_CONFIG: ConfiguratorConfig = {
  pieceOptionName: '',
  maxPieces: DEFAULT_MAX_PIECES,
  pieces: [],
  presets: [],
  viewSummary: 'always',
}

/**
 * Reads a stored config defensively. A row written by an older version, or
 * damaged by hand, reads as the empty set-up rather than breaking the product
 * page: the builder simply does not appear until it is saved again.
 */
export function parseStoredConfig(raw: unknown): ConfiguratorConfig {
  const parsed = ConfiguratorConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_CONFIGURATOR_CONFIG
}

/** What the admin editor sends to save a listing's set-up. */
export const SaveConfiguratorBodySchema = z.object({
  enabled: z.boolean(),
  config: ConfiguratorConfigSchema,
})

export type SaveConfiguratorBody = z.infer<typeof SaveConfiguratorBodySchema>
