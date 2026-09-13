'use client'

// The owner's ready-made layouts: each a name and the units in the order they
// join, drawn as a plan beside it so a layout that cannot be built is plain to
// see before anyone saves it. With none written, the storefront suggests its own
// and those are drawn here too, so the owner knows what shoppers will be offered.
import { findChainProblem } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { placeChain, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { PieceConfig, PresetConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
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

export function PresetPreview({ slugs, definitions, labelBySlug, maxPieces }: {
  slugs: readonly string[]
  definitions: ReadonlyMap<string, PieceDefinition>
  labelBySlug: ReadonlyMap<string, string>
  maxPieces: number
}) {
  const chain = slugs.map((pieceId, index) => ({ entryId: `preview-${index}`, pieceId }))
  const problem = findChainProblem(chain, definitions, { maxPieces })
  if (problem) return <p style={errorStyle}>{refusalSentence(problem, maxPieces)}</p>
  return (
    <LayoutPlan
      className="mcf-preset-plan"
      placed={placeChain(chain, definitions)}
      labelFor={(slug) => labelBySlug.get(slug) ?? slug}
      description={slugs.map((slug) => labelBySlug.get(slug) ?? slug).join(', ')}
    />
  )
}

export function PresetListEditor({ presets, pieces, labelBySlug, maxPieces, onChange }: PresetListEditorProps) {
  const definitions = definitionsBySlug(pieces)
  const labelFor = (slug: string) => labelBySlug.get(slug) ?? slug
  const update = (index: number, next: PresetConfig) => onChange(presets.map((preset, position) => (position === index ? next : preset)))

  if (pieces.length === 0) return <p style={hintStyle}>Tick at least one unit above first.</p>

  const suggested = presets.length === 0 ? suggestPresets([...definitions.values()], { maxPieces }) : []

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
                <PresetPreview slugs={preset.pieceIds} definitions={definitions} labelBySlug={labelBySlug} maxPieces={maxPieces} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {presets.map((preset, index) => (
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
              {preset.valueSlugs.map((slug, position) => (
                <button
                  key={`${slug}-${position}`}
                  type="button"
                  style={buttonStyle}
                  aria-label={`Take ${labelFor(slug)} out of ${preset.name || 'this layout'}`}
                  onClick={() => update(index, { ...preset, valueSlugs: preset.valueSlugs.filter((_, at) => at !== position) })}
                >
                  {position + 1}. {labelFor(slug)} ×
                </button>
              ))}
              <select
                style={fieldStyle}
                value=""
                aria-label="Add a unit to the end"
                onChange={(event) => {
                  if (event.target.value) update(index, { ...preset, valueSlugs: [...preset.valueSlugs, event.target.value] })
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
            <div>
              <button type="button" style={buttonStyle} onClick={() => onChange(presets.filter((_, at) => at !== index))}>
                Remove this layout
              </button>
            </div>
          </div>
          {preset.valueSlugs.length > 0 ? (
            <PresetPreview slugs={preset.valueSlugs} definitions={definitions} labelBySlug={labelBySlug} maxPieces={maxPieces} />
          ) : (
            <p style={hintStyle}>Add units to see it.</p>
          )}
        </div>
      ))}

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
