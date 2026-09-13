'use client'

// One value of the unit option on the set-up screen: whether it is a unit, how it
// joins, its footprint, and which way its model needs turning.
import { useState } from 'react'
import type { PieceConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import type { AdminOptionValue } from '@/modules/modular-configurator-for-shop/lib/admin-payload'
import {
  SHAPE_CHOICES,
  choiceFromShape,
  guessShapeFromLabel,
  shapeFromChoice,
} from '@/modules/modular-configurator-for-shop/lib/shape-choice'
import { buttonStyle, fieldStyle, hintStyle, labelStyle, numberFieldStyle } from '@/modules/modular-configurator-for-shop/components/admin/admin-styles'

interface PieceSetupRowProps {
  value: AdminOptionValue
  piece: PieceConfig | null
  onChange: (piece: PieceConfig | null) => void
}

const TURNS: ReadonlyArray<{ value: PieceConfig['modelTurnDegrees']; label: string }> = [
  { value: 0, label: 'Faces forwards already' },
  { value: 90, label: 'Turn a quarter clockwise' },
  { value: 180, label: 'Turn right round' },
  { value: 270, label: 'Turn a quarter anticlockwise' },
]

/** Fallback footprint for a newly ticked unit with nothing in its specification. */
const FALLBACK_SIDE_MM = 700

export function newPieceFor(value: AdminOptionValue): PieceConfig {
  return {
    valueSlug: value.slug,
    shape: shapeFromChoice(guessShapeFromLabel(value.label)),
    widthMm: value.suggestedWidthMm ?? FALLBACK_SIDE_MM,
    depthMm: value.suggestedDepthMm ?? FALLBACK_SIDE_MM,
    modelTurnDegrees: 0,
  }
}

/**
 * A millimetre field that lets the owner clear it and type afresh: the text is
 * held as typed, and only a whole number reaches the set-up.
 */
function MillimetreInput({ label, value, onCommit }: { label: string; value: number; onCommit: (millimetres: number) => void }) {
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  // A new figure from outside (the specification button) replaces what is typed.
  if (shown !== value) {
    setShown(value)
    setText(String(value))
  }
  return (
    <label style={{ display: 'grid', gap: '0.25rem' }}>
      <span style={labelStyle}>{label}</span>
      <input
        style={numberFieldStyle}
        type="number"
        inputMode="numeric"
        min={50}
        max={6000}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = Math.round(Number(event.target.value))
          if (event.target.value !== '' && Number.isFinite(parsed) && parsed > 0) {
            setShown(parsed)
            onCommit(parsed)
          }
        }}
      />
    </label>
  )
}

export function PieceSetupRow({ value, piece, onChange }: PieceSetupRowProps) {
  const id = `mcf-piece-${value.slug}`
  const hasSuggestion = value.suggestedWidthMm !== null && value.suggestedDepthMm !== null
  const suggestionDiffers =
    piece !== null && hasSuggestion && (piece.widthMm !== value.suggestedWidthMm || piece.depthMm !== value.suggestedDepthMm)

  return (
    <div style={{ display: 'grid', gap: '0.5rem', padding: '0.625rem 0', borderTop: '1px solid var(--color-border)' }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
        <input
          id={id}
          type="checkbox"
          checked={piece !== null}
          onChange={(event) => onChange(event.target.checked ? newPieceFor(value) : null)}
        />
        {value.label}
      </label>

      {piece ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end', paddingLeft: '1.5rem' }}>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>How it joins</span>
            <select
              style={fieldStyle}
              value={choiceFromShape(piece.shape)}
              onChange={(event) => {
                const choice = SHAPE_CHOICES.find((candidate) => candidate.value === event.target.value)
                if (choice) onChange({ ...piece, shape: shapeFromChoice(choice.value) })
              }}
            >
              {SHAPE_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <MillimetreInput label="Width (mm)" value={piece.widthMm} onCommit={(widthMm) => onChange({ ...piece, widthMm })} />
          <MillimetreInput label="Depth (mm)" value={piece.depthMm} onCommit={(depthMm) => onChange({ ...piece, depthMm })} />
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>3D model</span>
            <select
              style={fieldStyle}
              value={piece.modelTurnDegrees}
              onChange={(event) => {
                const turn = TURNS.find((candidate) => String(candidate.value) === event.target.value)
                if (turn) onChange({ ...piece, modelTurnDegrees: turn.value })
              }}
            >
              {TURNS.map((turn) => (
                <option key={turn.value} value={turn.value}>
                  {turn.label}
                </option>
              ))}
            </select>
          </label>
          {suggestionDiffers ? (
            <button
              type="button"
              style={buttonStyle}
              onClick={() =>
                onChange({ ...piece, widthMm: value.suggestedWidthMm ?? piece.widthMm, depthMm: value.suggestedDepthMm ?? piece.depthMm })
              }
            >
              Use the specification ({value.suggestedWidthMm} × {value.suggestedDepthMm} mm)
            </button>
          ) : null}
        </div>
      ) : null}
      {piece && !hasSuggestion ? (
        <p style={{ ...hintStyle, paddingLeft: '1.5rem' }}>
          No overall width and depth in this unit&apos;s specification, so the sizes are yours to type in.
        </p>
      ) : null}
    </div>
  )
}
