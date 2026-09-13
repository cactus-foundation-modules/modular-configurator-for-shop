// Reads a written length ("79cm", "790 mm", "0.79m") as whole millimetres, for
// suggesting unit footprints from a product's specification. Deliberately strict:
// a bare number with no unit is not guessed at - "79" could be any of three
// things, and a footprint ten times too big puts a seat through a wall. The
// owner types those in instead.
const LENGTH_PATTERN = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*$/i

const MILLIMETRES_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000 }

export function parseLengthToMm(written: string): number | null {
  const match = LENGTH_PATTERN.exec(written)
  if (!match) return null
  const amount = Number((match[1] ?? '').replace(',', '.'))
  const perUnit = MILLIMETRES_PER_UNIT[(match[2] ?? '').toLowerCase()]
  if (!Number.isFinite(amount) || perUnit === undefined) return null
  const millimetres = Math.round(amount * perUnit)
  return millimetres > 0 ? millimetres : null
}
