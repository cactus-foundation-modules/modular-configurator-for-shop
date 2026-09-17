'use client'

// The owner's ready-made layouts: each a name and the units in the order they
// join - with a backless unit stood in front of any unit that can have one, a
// backless unit beside a corner turned to line up with the row, and a curve or
// wedge with no back laid the other way round - drawn as a
// plan beside it so a layout that cannot be built is plain to see before anyone
// saves it. With none written, the storefront suggests its own and those are
// drawn here too, so the owner knows what shoppers will be offered.
import { chainFromUnits, findChainProblem, type LayoutUnitSpec } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { canBeFrontSpur, canBeTurned, canHostFrontSpur, isReversible, placeLayout, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import {
  presetUnitsOf,
  presetWithUnits,
  type PieceConfig,
  type PresetConfig,
  type PresetUnit,
} from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { presetLayoutUnits } from '@/modules/modular-configurator-for-shop/lib/preset-units'
import { suggestPresets } from '@/modules/modular-configurator-for-shop/lib/suggested-presets'
import { refusalSentence } from '@/modules/modular-configurator-for-shop/lib/shopper-copy'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { buttonStyle, errorStyle, fieldStyle, hintStyle, labelStyle } from '@/modules/modular-configurator-for-shop/components/admin/admin-styles'

interface PresetListEditorProps {
  presets: readonly PresetConfig[]
  pieces: readonly PieceConfig[]
  labelBySlug: ReadonlyMap<string, string>
  maxPieces: number
  onChange: (presets: PresetConfig[]) => void
}

const MAX_PRESETS = 12

function definitionsBySlug(pieces: readonly PieceConfig[]): Map<string, PieceDefinition> {
  return new Map(
    pieces.map((piece) => [
      piece.valueSlug,
      { pieceId: piece.valueSlug, shape: piece.shape, widthMm: piece.widthMm, depthMm: piece.depthMm },
    ]),
  )
}

/** Units keyed by slug, as the set-up screen keys them. */
export function slugUnits(slugs: readonly string[]): LayoutUnitSpec[] {
  return slugs.map((pieceId) => ({ pieceId }))
}

export function PresetPreview({ units, definitions, labelBySlug, maxPieces }: {
  /** Keyed by slug. */
  units: readonly LayoutUnitSpec[]
  definitions: ReadonlyMap<string, PieceDefinition>
  labelBySlug: ReadonlyMap<string, string>
  maxPieces: number
}) {
  const chain = chainFromUnits(units, 'preview-')
  const problem = findChainProblem(chain, definitions, { maxPieces })
  if (problem) return <p style={errorStyle}>{refusalSentence(problem, maxPieces)}</p>
  const labelFor = (slug: string) => labelBySlug.get(slug) ?? slug
  return (
    <LayoutPlan
      className="mcf-preset-plan"
      placed={placeLayout(chain, definitions)}
      labelFor={labelFor}
      description={units.map((unit) => (unit.frontPieceId ? `${labelFor(unit.pieceId)} with ${labelFor(unit.frontPieceId)} in front` : labelFor(unit.pieceId))).join(', ')}
    />
  )
}

/**
 * Whether the set-up screen offers turning this unit: the same rule as the
 * shopper's panel - a backless unit that is not square, beside a corner - and
 * always for one turned already, so it can be put back.
 */
function turnOfferedAt(units: readonly PresetUnit[], index: number, definitions: ReadonlyMap<string, PieceDefinition>): boolean {
  const unit = units[index]
  const definition = unit ? definitions.get(unit.valueSlug) : undefined
  if (!unit || !definition || !canBeTurned(definition)) return false
  if (unit.turned) return true
  const besideCorner = [units[index - 1], units[index + 1]].some((neighbour) => neighbour && definitions.get(neighbour.valueSlug)?.shape.kind === 'corner')
  return besideCorner && definition.widthMm !== definition.depthMm
}

export function PresetListEditor({ presets, pieces, labelBySlug, maxPieces, onChange }: PresetListEditorProps) {
  const definitions = definitionsBySlug(pieces)
  const labelFor = (slug: string) => labelBySlug.get(slug) ?? slug
  const update = (index: number, next: PresetConfig) => onChange(presets.map((preset, position) => (position === index ? next : preset)))

  if (pieces.length === 0) return <p style={hintStyle}>Tick at least one unit above first.</p>

  const suggested = presets.length === 0 ? suggestPresets([...definitions.values()], { maxPieces }) : []
  const frontSlugs = pieces.filter((piece) => {
    const definition = definitions.get(piece.valueSlug)
    return definition !== undefined && canBeFrontSpur(definition)
  })

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {presets.length === 0 ? (
        <>
          <p style={hintStyle}>
            None written, so shoppers are offered these, worked out from the units you have ticked:
            {suggested.length === 0 ? ' none fit these units yet.' : ''}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9rem), 1fr))', gap: '0.5rem' }}>
            {suggested.map((preset) => (
              <div key={preset.name} style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={labelStyle}>{preset.name}</span>
                <PresetPreview units={preset.units} definitions={definitions} labelBySlug={labelBySlug} maxPieces={maxPieces} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {presets.map((preset, index) => {
        const units = presetUnitsOf(preset)
        const setUnits = (next: readonly PresetUnit[]) => update(index, presetWithUnits(preset, next))
        const setUnit = (position: number, unit: PresetUnit) => setUnits(units.map((current, at) => (at === position ? unit : current)))
        const extras = units.flatMap((unit, position) => {
          const definition = definitions.get(unit.valueSlug)
          const canHaveFront = definition !== undefined && canHostFrontSpur(definition) && frontSlugs.length > 0
          const canTurn = turnOfferedAt(units, position, definitions)
          const canFlip = definition !== undefined && isReversible(definition)
          return canHaveFront || canTurn || canFlip ? [{ unit, position, canHaveFront, canTurn, canFlip }] : []
        })
        return (
        <div
          key={index}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 10rem)', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--color-border)', borderRadius: 8 }}
        >
          <div style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={labelStyle}>Name</span>
              <input
                style={fieldStyle}
                value={preset.name}
                maxLength={60}
                onChange={(event) => update(index, { ...preset, name: event.target.value })}
              />
            </label>
            <span style={labelStyle}>Units, in the order they join</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {units.map((unit, position) => (
                <button
                  key={`${unit.valueSlug}-${position}`}
                  type="button"
                  style={buttonStyle}
                  aria-label={`Take ${labelFor(unit.valueSlug)} out of ${preset.name || 'this layout'}`}
                  onClick={() => setUnits(units.filter((_, at) => at !== position))}
                >
                  {position + 1}. {labelFor(unit.valueSlug)} ×
                </button>
              ))}
              <select
                style={fieldStyle}
                value=""
                aria-label="Add a unit to the end"
                onChange={(event) => {
                  if (event.target.value) setUnits([...units, { valueSlug: event.target.value }])
                }}
              >
                <option value="">Add a unit…</option>
                {pieces.map((piece) => (
                  <option key={piece.valueSlug} value={piece.valueSlug}>
                    {labelFor(piece.valueSlug)}
                  </option>
                ))}
              </select>
            </div>
            {extras.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.375rem' }}>
                <span style={labelStyle}>In front, turned and laid the other way</span>
                {extras.map(({ unit, position, canHaveFront, canTurn, canFlip }) => (
                  <div key={`${unit.valueSlug}-${position}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={hintStyle}>
                      {position + 1}. {labelFor(unit.valueSlug)}
                    </span>
                    {canHaveFront ? (
                      <select
                        style={fieldStyle}
                        value={unit.frontSlug ?? ''}
                        aria-label={`What stands in front of unit ${position + 1}, ${labelFor(unit.valueSlug)}`}
                        onChange={(event) => setUnit(position, { ...unit, frontSlug: event.target.value || undefined })}
                      >
                        <option value="">Nothing in front</option>
                        {frontSlugs.map((piece) => (
                          <option key={piece.valueSlug} value={piece.valueSlug}>
                            {labelFor(piece.valueSlug)} in front
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {canTurn ? (
                      <label style={{ ...hintStyle, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <input type="checkbox" checked={unit.turned === true} onChange={(event) => setUnit(position, { ...unit, turned: event.target.checked })} />
                        Turned to line up with the row
                      </label>
                    ) : null}
                    {canFlip ? (
                      <label style={{ ...hintStyle, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <input type="checkbox" checked={unit.flipped === true} onChange={(event) => setUnit(position, { ...unit, flipped: event.target.checked })} />
                        Bends the other way
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div>
              <button type="button" style={buttonStyle} onClick={() => onChange(presets.filter((_, at) => at !== index))}>
                Remove this layout
              </button>
            </div>
          </div>
          {units.length > 0 ? (
            <PresetPreview
              units={presetLayoutUnits(preset, (slug) => slug) ?? []}
              definitions={definitions}
              labelBySlug={labelBySlug}
              maxPieces={maxPieces}
            />
          ) : (
            <p style={hintStyle}>Add units to see it.</p>
          )}
        </div>
        )
      })}

      {presets.length < MAX_PRESETS ? (
        <div>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => onChange([...presets, { name: presets.length === 0 ? 'Popular layout' : `Layout ${presets.length + 1}`, valueSlugs: [] }])}
          >
            Write a ready-made layout
          </button>
        </div>
      ) : null}
    </div>
  )
}
