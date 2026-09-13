'use client'

// One value of the unit option on the set-up screen: whether it is a unit, how it
// joins, its footprint, and which way its model needs turning.
import { useState } from 'react'
import type { PieceConfig } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { AUTOMATIC_MODEL_TURN } from '@/modules/modular-configurator-for-shop/lib/model-orientation'
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
  { value: AUTOMATIC_MODEL_TURN, label: 'Work it out from each model (recommended)' },
  { value: 0, label: 'Faces forwards already' },
  { value: 90, label: 'Turn a quarter clockwise' },
  { value: 180, label: 'Turn right round' },
  { value: 270, label: 'Turn a quarter anticlockwise' },
]

/** Fallback footprint for a newly ticked unit with nothing in its specification. */
const FALLBACK_SIDE_MM = 700

export function newPieceFor(value: AdminOptionValue): PieceConfig {
  const shape = shapeFromChoice(guessShapeFromLabel(value.label))
  const widthMm = value.suggestedWidthMm ?? FALLBACK_SIDE_MM
  const depthMm = value.suggestedDepthMm ?? FALLBACK_SIDE_MM
  return withShape({ valueSlug: value.slug, shape, widthMm, depthMm, modelTurnDegrees: AUTOMATIC_MODEL_TURN }, shape)
}

/**
 * A unit given a new shape, with its sizes kept sensible for it: a curve's
 * footprint is a square as big as the curve, and its seat fits inside that.
 */
function withShape(piece: PieceConfig, shape: PieceConfig['shape']): PieceConfig {
  if (shape.kind !== 'curve') return { ...piece, shape }
  const size = Math.max(piece.widthMm, piece.depthMm)
  const seatDepthMm = Math.min(shape.seatDepthMm, size - 50)
  return { ...piece, widthMm: size, depthMm: size, shape: { ...shape, seatDepthMm } }
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

function curveBack(piece: PieceConfig): 'outside' | 'inside' | 'none' {
  return piece.shape.kind === 'curve' ? piece.shape.back : 'outside'
}

/** What the sizes mean for this kind of unit, in the owner's words. */
function shapeHint(piece: PieceConfig): string {
  switch (piece.shape.kind) {
    case 'curve':
      return 'A quarter of a circle. Its size is the width (and depth) of the whole curve from the outside; its seat depth is how deep each cut end is, which should match the units it joins.'
    case 'round-end':
      return 'Width is the flat side, which joins two rows sat back to back. Depth is how far the rounded part sticks out.'
    default:
      return 'Width is across the front of the unit; depth is from the back to the front of the seat.'
  }
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
                if (choice) onChange(withShape(piece, shapeFromChoice(choice.value, piece.shape)))
              }}
            >
              {SHAPE_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          {piece.shape.kind === 'curve' ? (
            <>
              <MillimetreInput
                label="Size of the curve (mm)"
                value={piece.widthMm}
                onCommit={(size) => onChange({ ...piece, widthMm: size, depthMm: size })}
              />
              <MillimetreInput
                label="Seat depth (mm)"
                value={piece.shape.seatDepthMm}
                onCommit={(seatDepthMm) => onChange({ ...piece, shape: { kind: 'curve', back: curveBack(piece), seatDepthMm } })}
              />
            </>
          ) : (
            <>
              <MillimetreInput label="Width (mm)" value={piece.widthMm} onCommit={(widthMm) => onChange({ ...piece, widthMm })} />
              <MillimetreInput label="Depth (mm)" value={piece.depthMm} onCommit={(depthMm) => onChange({ ...piece, depthMm })} />
            </>
          )}
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
      {piece ? <p style={{ ...hintStyle, paddingLeft: '1.5rem' }}>{shapeHint(piece)}</p> : null}
      {piece && !hasSuggestion ? (
        <p style={{ ...hintStyle, paddingLeft: '1.5rem' }}>
          No overall width and depth in this unit&apos;s specification, so the sizes are yours to type in.
        </p>
      ) : null}
    </div>
  )
}
