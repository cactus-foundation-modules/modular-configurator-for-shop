import { describe, expect, it } from 'vitest'
import { decodeLayout, encodeLayout, type LayoutCodeVocabulary } from '@/modules/modular-configurator-for-shop/lib/layout-code'

const vocabulary: LayoutCodeVocabulary = {
  pieceSlugById: new Map([
    ['backed', 'infinity-chair-with-back'],
    ['backless', 'infinity-backless-unit'],
  ]),
  otherOptions: [],
}

describe('layout code front spurs', () => {
  it('round-trips a cube in front of a backed seat', () => {
    const code = encodeLayout(
      [{ pieceId: 'backed', choices: {}, flipped: false, front: { pieceId: 'backless', choices: {} } }],
      vocabulary,
    )
    expect(code).toContain('front:infinity-backless-unit')
    const decoded = decodeLayout(code, vocabulary)
    expect(decoded?.units[0]?.front?.pieceId).toBe('backless')
  })
})
