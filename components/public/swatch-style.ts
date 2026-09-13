import type { CSSProperties } from 'react'
import type { SvrOptionValue } from '@/modules/shop-variations/lib/types'

/** The small picture an option value shows: its small rendition where it has one. */
export function swatchOf(value: Pick<SvrOptionValue, 'swatch' | 'swatchSmall'>): string | null {
  return value.swatchSmall || value.swatch || null
}

/** Paints a swatch: a hex is the product's own colour data (not interface chrome), anything else a picture. */
export function swatchStyle(swatch: string): CSSProperties {
  return swatch.startsWith('#') ? { backgroundColor: swatch } : { backgroundImage: `url("${swatch.replace(/"/g, '%22')}")` }
}
