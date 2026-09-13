// A layout written into the address bar, so the link in hand IS the layout:
// shared, bookmarked or sent with a quote request, it opens on the same units in
// the same order with the same per-unit choices.
//
//   ?modular-layout=left-unit.central-unit~upholstery-colour:rivet-olive.corner-unit
//
// Units are separated by ".", in chain order, each named by its option value
// slug. A unit's own choices follow its slug after "~", as `option-key:value-slug`
// pairs, where the option key is the same slugified option name shop-variations
// uses for its own parameters. A unit laid the other way round (a curve with no
// back) carries a bare "~flip", which a link reader that predates it ignores. Slugs, not ids, for the same reason the stored
// set-up uses them: an id means nothing to the next catalogue import.
//
// The parameter has a name of its own rather than reusing shop-variations' one
// parameter per option, which is what keeps it from ever colliding with them.
import { optionParamKey } from '@/modules/shop-variations/lib/url-selection'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'
import type { SvrOptionWithValues } from '@/modules/shop-variations/lib/types'

export const LAYOUT_PARAM = 'modular-layout'

const UNIT_SEPARATOR = '.'
const CHOICE_SEPARATOR = '~'
const PAIR_SEPARATOR = ':'
const FLIP_MARK = 'flip'

/** One unit as the code carries it. */
export interface LayoutCodeUnit {
  pieceId: string
  choices: OptionSelection
  flipped: boolean
}

/** A layout as the code carries it: its units in order. */
export interface DecodedLayout {
  units: LayoutCodeUnit[]
}

export interface LayoutCodeVocabulary {
  /** Unit option value id -> slug, for the units that may be placed. */
  pieceSlugById: ReadonlyMap<string, string>
  /** Every option on the product except the unit option. */
  otherOptions: readonly SvrOptionWithValues[]
}

export function encodeLayout(units: readonly LayoutCodeUnit[], vocabulary: LayoutCodeVocabulary): string {
  return units
    .map((unit) => {
      const slug = vocabulary.pieceSlugById.get(unit.pieceId)
      if (!slug) return null
      const parts = [slug, ...(unit.flipped ? [FLIP_MARK] : []), ...encodeChoices(unit.choices, vocabulary.otherOptions)]
      return parts.join(CHOICE_SEPARATOR)
    })
    .filter((unit): unit is string => unit !== null)
    .join(UNIT_SEPARATOR)
}

function encodeChoices(choices: OptionSelection, options: readonly SvrOptionWithValues[]): string[] {
  const pairs: string[] = []
  for (const option of options) {
    const valueId = choices[option.id]
    if (!valueId) continue
    const value = option.values.find((candidate) => candidate.id === valueId)
    if (value) pairs.push(`${optionParamKey(option.name)}${PAIR_SEPARATOR}${value.slug}`)
  }
  return pairs
}

/**
 * Reads a code back. Anything it does not recognise - a unit since withdrawn,
 * an option renamed - is dropped rather than failing the whole link, so an old
 * link opens on as much of the layout as still exists. Null when nothing does.
 */
export function decodeLayout(code: string, vocabulary: LayoutCodeVocabulary): DecodedLayout | null {
  const pieceIdBySlug = new Map([...vocabulary.pieceSlugById].map(([pieceId, slug]) => [slug, pieceId]))
  const optionByKey = new Map(vocabulary.otherOptions.map((option) => [optionParamKey(option.name), option]))
  const units: LayoutCodeUnit[] = []
  for (const unit of code.split(UNIT_SEPARATOR)) {
    const parts = unit.split(CHOICE_SEPARATOR)
    const pieceId = pieceIdBySlug.get(parts[0] ?? '')
    if (!pieceId) continue
    const rest = parts.slice(1)
    units.push({ pieceId, choices: decodeChoices(rest, optionByKey), flipped: rest.includes(FLIP_MARK) })
  }
  return units.length > 0 ? { units } : null
}

function decodeChoices(pairs: string[], optionByKey: ReadonlyMap<string, SvrOptionWithValues>): OptionSelection {
  const choices: OptionSelection = {}
  for (const pair of pairs) {
    const separatorAt = pair.indexOf(PAIR_SEPARATOR)
    if (separatorAt <= 0) continue
    const option = optionByKey.get(pair.slice(0, separatorAt))
    const value = option?.values.find((candidate) => candidate.slug === pair.slice(separatorAt + 1))
    if (option && value) choices[option.id] = value.id
  }
  return choices
}
