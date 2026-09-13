// Delivery for a whole layout, from the basket's own answer for each unit.
//
// Pattern: a trial run of shop's cart validation. The builder sends the layout's
// lines to the same endpoint the basket uses - once with no choice made, and once
// with every service asked of every line - and folds the answers into one picker
// for the layout. The services, their charges and their arrival dates are
// therefore exactly the ones the basket will show and charge, whichever module
// supplies them; nothing here knows what a delivery service is. The per-line
// picker is shop's generic `control` contract, and its promised day comes from
// the line's generic `batch` sort key.
//
// Charges are per item: a service's price is added to every unit it is chosen
// for, so a layout's delivery is that price times each line's quantity.
import { z } from 'zod'
import type { CartLineControl } from '@/modules/shop/lib/line-meta'
import { formatMoney } from '@/modules/shop/lib/money'
import type { PricedUnit } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'

const SummarySchema = z.object({
  headline: z.string(),
  secondary: z.string().optional(),
  switchLabel: z.string().optional(),
  priceLabel: z.string().optional(),
})

const OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  priceAdjust: z.number().optional(),
  description: z.string().optional(),
  summary: SummarySchema.optional(),
})

const ControlSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  value: z.string(),
  options: z.array(OptionSchema),
  renderAs: z.enum(['select', 'radios', 'summary']).optional(),
  optionsSelfLabelled: z.boolean().optional(),
})

export const ValidatedLineSchema = z.object({
  lineId: z.string().nullable(),
  productId: z.string(),
  available: z.boolean(),
  control: ControlSchema.nullable().optional(),
  lineMeta: z.object({ batch: z.object({ sort: z.string() }).nullable().optional() }).nullable().optional(),
})

export const ValidateResponseSchema = z.object({ lines: z.array(ValidatedLineSchema) })

export type ValidatedLine = z.infer<typeof ValidatedLineSchema>

/** One distinct variation in the layout, and how many of it one layout holds. */
export interface DeliveryUnitLine {
  productId: string
  quantity: number
}

export interface TrialLineRequest {
  productId: string
  quantity: number
  lineId: string
  meta: Record<string, unknown>
}

/** The layout's delivery picker, and what each service costs across the layout. */
export interface LayoutDelivery {
  /** The line meta key a choice is written under (shop's control contract). */
  metaKey: string
  /** The service the basket would pick with no choice made. */
  defaultValue: string
  /** Shop's control, merged across the layout, with per-item wording on the prices. */
  control: CartLineControl
  /** Delivery for ONE layout, per service. */
  totalByValue: ReadonlyMap<string, number>
}

/**
 * One layout's variations and how many of each. Empty until every unit is a real
 * variation - there is nothing to ask the basket about a half-chosen layout.
 */
export function deliveryLinesFor(units: readonly PricedUnit[]): DeliveryUnitLine[] {
  const counts = new Map<string, number>()
  for (const unit of units) {
    if (!unit.variant) return []
    counts.set(unit.variant.childProductId, (counts.get(unit.variant.childProductId) ?? 0) + 1)
  }
  return [...counts].map(([productId, quantity]) => ({ productId, quantity }))
}

const PLAIN_PREFIX = 'mcf-plain:'
const TRIAL_PREFIX = 'mcf-trial:'

/** The first trial: each line as the basket would price it, no choice made. */
export function plainTrialLines(lines: readonly DeliveryUnitLine[]): TrialLineRequest[] {
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity, lineId: `${PLAIN_PREFIX}${line.productId}`, meta: {} }))
}

/** The second trial: every line with every service chosen, to learn each service's arrival day. */
export function serviceTrialLines(lines: readonly DeliveryUnitLine[], metaKey: string, values: readonly string[]): TrialLineRequest[] {
  return values.flatMap((value, index) =>
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      lineId: trialLineId(index, line.productId),
      meta: { [metaKey]: value },
    })),
  )
}

/** Keyed by the service's position, not its name, so the id stays inside the basket's 64 characters. */
function trialLineId(serviceIndex: number, productId: string): string {
  return `${TRIAL_PREFIX}${serviceIndex}:${productId}`
}

/**
 * The services every line of the layout can have, in the first line's order,
 * under the key the lines' pickers share. Null when the lines carry no picker, or
 * disagree about what it is - there is then no one choice to offer the layout.
 */
export function commonServices(plain: readonly ValidatedLine[]): { metaKey: string; values: string[] } | null {
  const controls = plain.map((line) => line.control ?? null)
  const first = controls[0]
  if (!first || controls.some((control) => !control || control.key !== first.key)) return null
  const values = first.options
    .map((option) => option.value)
    .filter((value) => controls.every((control) => control?.options.some((option) => option.value === value)))
  return values.length > 0 ? { metaKey: first.key, values } : null
}

function priceLabelFor(perItem: readonly number[], currencySymbol: string, fallback: string | undefined): string | undefined {
  const lowest = Math.min(...perItem)
  const highest = Math.max(...perItem)
  if (highest <= 0) return fallback
  if (Math.abs(highest - lowest) < 0.005) return `+${formatMoney(highest, currencySymbol)} per item`
  return `from +${formatMoney(lowest > 0 ? lowest : highest, currencySymbol)} per item`
}

/**
 * Folds the two trials into the layout's picker. Each service is described by
 * the unit that arrives LAST with it - a layout is only delivered when all of it
 * is - and priced per item, with its total across the layout alongside.
 */
export function combineLayoutDelivery(
  lines: readonly DeliveryUnitLine[],
  plain: readonly ValidatedLine[],
  trial: readonly ValidatedLine[],
  chosenValue: string | null,
  currencySymbol: string,
): LayoutDelivery | null {
  const services = commonServices(plain)
  const firstControl = plain[0]?.control
  if (!services || !firstControl) return null

  const quantityByProduct = new Map(lines.map((line) => [line.productId, line.quantity]))
  const trialById = new Map(trial.map((line) => [line.lineId ?? '', line]))
  const totalByValue = new Map<string, number>()

  const options: CartLineControl['options'] = []
  for (const [serviceIndex, value] of services.values.entries()) {
    const answers = lines.flatMap((line) => {
      const answered = trialById.get(trialLineId(serviceIndex, line.productId))
      const option = answered?.control?.options.find((candidate) => candidate.value === value)
      return answered && option ? [{ line, answered, option }] : []
    })
    if (answers.length !== lines.length) continue
    const latest = answers.reduce((last, answer) =>
      (answer.answered.lineMeta?.batch?.sort ?? '') > (last.answered.lineMeta?.batch?.sort ?? '') ? answer : last,
    )
    const perItem = answers.map((answer) => answer.option.priceAdjust ?? 0)
    const total = answers.reduce(
      (sum, answer) => sum + Math.round((answer.option.priceAdjust ?? 0) * 100) * (quantityByProduct.get(answer.line.productId) ?? 0),
      0,
    ) / 100
    totalByValue.set(value, total)
    const summary = latest.option.summary
    options.push({
      value,
      label: latest.option.label,
      priceAdjust: Math.max(...perItem),
      ...(latest.option.description ? { description: latest.option.description } : {}),
      ...(summary ? { summary: { ...summary, priceLabel: priceLabelFor(perItem, currencySymbol, summary.priceLabel) } } : {}),
    })
  }
  if (options.length === 0) return null

  const defaultValue = options.some((option) => option.value === firstControl.value) ? firstControl.value : options[0]?.value ?? ''
  const value = chosenValue && options.some((option) => option.value === chosenValue) ? chosenValue : defaultValue
  return {
    metaKey: services.metaKey,
    defaultValue,
    control: {
      key: services.metaKey,
      label: firstControl.label,
      value,
      options,
      ...(firstControl.renderAs ? { renderAs: firstControl.renderAs } : {}),
      ...(firstControl.optionsSelfLabelled ? { optionsSelfLabelled: true } : {}),
    },
    totalByValue,
  }
}
