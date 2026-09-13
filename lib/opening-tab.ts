// Which of the product page's two tabs opens first.
//
// "Build a layout", unless the address names one unit and not a layout. That is
// the shape of every Google Shopping and shared single-variation link
// (?unit=corner-unit&…), and a shopper arriving on one clicked a single unit at
// a single price - the page has to open on that unit and that price, not on a
// builder that shows neither. A layout link (?modular-layout=…) always wins.
import { optionParamKey } from '@/modules/shop-variations/lib/url-selection'
import { LAYOUT_PARAM } from '@/modules/modular-configurator-for-shop/lib/layout-code'

export type ProductTab = 'build' | 'individual'

export type SearchParamsRecord = Record<string, string | string[] | undefined>

function hasValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((entry) => entry.trim() !== '')
  return typeof value === 'string' && value.trim() !== ''
}

export function openingTabFor(searchParams: SearchParamsRecord | null, pieceOptionName: string): ProductTab {
  if (!searchParams) return 'build'
  if (hasValue(searchParams[LAYOUT_PARAM])) return 'build'
  return hasValue(searchParams[optionParamKey(pieceOptionName)]) ? 'individual' : 'build'
}
