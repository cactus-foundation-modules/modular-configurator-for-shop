// Which of the product page's two tabs opens first.
//
// "Shop individual items", the left-hand tab - so a shopper lands on the page's
// ordinary options and price, and every advert or shared variation link lands on
// the single unit and price that was clicked. Only a layout link
// (?modular-layout=…) opens on "Build a layout", because it is one.
import { LAYOUT_PARAM } from '@/modules/modular-configurator-for-shop/lib/layout-code'

export type ProductTab = 'build' | 'individual'

export type SearchParamsRecord = Record<string, string | string[] | undefined>

function hasValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((entry) => entry.trim() !== '')
  return typeof value === 'string' && value.trim() !== ''
}

export function openingTabFor(searchParams: SearchParamsRecord | null): ProductTab {
  return searchParams && hasValue(searchParams[LAYOUT_PARAM]) ? 'build' : 'individual'
}
