import { describe, expect, it } from 'vitest'
import {
  combineLayoutDelivery,
  commonServices,
  plainTrialLines,
  serviceTrialLines,
  type ValidatedLine,
} from '@/modules/modular-configurator-for-shop/lib/layout-delivery'

// Two services, as the basket offers them on a line: free flat-pack, and paid
// installation that lands later. The corner unit is slower than the rest.
function option(value: string, price: number, headline: string) {
  return {
    value,
    label: `${value} ${headline}`,
    priceAdjust: price,
    summary: { headline, secondary: value, switchLabel: `${value} ${headline}`, priceLabel: price > 0 ? `+£${price.toFixed(2)}` : 'Free' },
  }
}

function line(lineId: string, productId: string, chosen: string, sort: string | null, headlines: Record<string, string>, prices: Record<string, number> = { flat: 0, install: 25.95 }): ValidatedLine {
  return {
    lineId,
    productId,
    available: true,
    control: {
      key: 'shippingTier',
      label: 'Delivery',
      value: chosen,
      renderAs: 'summary',
      optionsSelfLabelled: true,
      options: Object.keys(prices).map((value) => option(value, prices[value] ?? 0, headlines[value] ?? '')),
    },
    lineMeta: sort ? { batch: { sort } } : null,
  }
}

const LINES = [
  { productId: 'central', quantity: 2 },
  { productId: 'corner', quantity: 1 },
]
const CENTRAL_DATES = { flat: 'Arrives by Tue 29th', install: 'Arrives by Tue 6th' }
const CORNER_DATES = { flat: 'Arrives by Thu 1st', install: 'Arrives by Thu 8th' }

const CENTRAL_PLAIN = line('mcf-plain:central', 'central', 'flat', '2026-09-29', CENTRAL_DATES)
const PLAIN = [CENTRAL_PLAIN, line('mcf-plain:corner', 'corner', 'flat', '2026-10-01', CORNER_DATES)]
const TRIAL = [
  line('mcf-trial:0:central', 'central', 'flat', '2026-09-29', CENTRAL_DATES),
  line('mcf-trial:0:corner', 'corner', 'flat', '2026-10-01', CORNER_DATES),
  line('mcf-trial:1:central', 'central', 'install', '2026-10-06', CENTRAL_DATES),
  line('mcf-trial:1:corner', 'corner', 'install', '2026-10-08', CORNER_DATES),
]

describe('delivery for a whole layout', () => {
  it('asks the basket about each line, then about each line with each service', () => {
    expect(plainTrialLines(LINES).map((request) => request.lineId)).toEqual(['mcf-plain:central', 'mcf-plain:corner'])
    expect(serviceTrialLines(LINES, 'shippingTier', ['flat', 'install']).map((request) => [request.lineId, request.meta])).toEqual([
      ['mcf-trial:0:central', { shippingTier: 'flat' }],
      ['mcf-trial:0:corner', { shippingTier: 'flat' }],
      ['mcf-trial:1:central', { shippingTier: 'install' }],
      ['mcf-trial:1:corner', { shippingTier: 'install' }],
    ])
  })

  it('offers only the services every unit can have', () => {
    const cornerFlatOnly = line('mcf-plain:corner', 'corner', 'flat', null, CORNER_DATES, { flat: 0 })
    expect(commonServices([CENTRAL_PLAIN, cornerFlatOnly])).toEqual({ metaKey: 'shippingTier', values: ['flat'] })
    expect(commonServices([{ ...CENTRAL_PLAIN, control: null }])).toBeNull()
  })

  it('dates each service by the unit that arrives last, and prices it per item', () => {
    const delivery = combineLayoutDelivery(LINES, PLAIN, TRIAL, 'install', '£')
    expect(delivery?.metaKey).toBe('shippingTier')
    expect(delivery?.defaultValue).toBe('flat')
    expect(delivery?.control.value).toBe('install')
    expect(delivery?.control.options.map((o) => [o.value, o.summary?.headline, o.summary?.priceLabel])).toEqual([
      ['flat', 'Arrives by Thu 1st', 'Free'],
      ['install', 'Arrives by Thu 8th', '+£25.95 per item'],
    ])
    // Three items (two centrals and a corner) at £25.95 each.
    expect(delivery?.totalByValue.get('install')).toBe(77.85)
    expect(delivery?.totalByValue.get('flat')).toBe(0)
  })

  it('falls back to the basket’s own choice when the one asked for is not on offer', () => {
    expect(combineLayoutDelivery(LINES, PLAIN, TRIAL, 'gone', '£')?.control.value).toBe('flat')
  })
})
