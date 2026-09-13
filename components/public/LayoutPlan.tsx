'use client'

// A layout drawn from above, to scale: each unit's footprint with its backrest
// and arms marked, numbered to match the list, and dashed "+" spaces where a
// unit can join. The accessible twin of the 3D view - everything the shopper can
// do by pointing at the model they can do here with a keyboard - and, in its
// small size, the thumbnail on the product page's card.
//
// Drawn in millimetres, straight from the placement maths: the SVG's y axis runs
// towards the shopper exactly as the layout's z does, so nothing is flipped.
import type { KeyboardEvent, ReactElement } from 'react'
import {
  curveCentre,
  curveLayOf,
  layoutBounds,
  pointOnPiece,
  type ChainEnd,
  type FloorRectangle,
  type FloorVector,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { formatMetres } from '@/modules/modular-configurator-for-shop/lib/layout-describe'

export interface PlanGhost {
  end: ChainEnd
  footprint: FloorRectangle
  /** Read aloud: "Add a unit after Corner Unit". */
  label: string
}

interface LayoutPlanProps {
  placed: readonly PlacedPiece[]
  labelFor: (pieceId: string) => string
  /**
   * Text alternative for the whole drawing. Empty marks it decorative - for a
   * plan inside a button whose own words already say what it shows.
   */
  description: string
  className?: string
  interactive?: boolean
  selectedEntryId?: string | null
  ghosts?: readonly PlanGhost[]
  showDimensions?: boolean
  emptyText?: string
  onSelect?: (entryId: string) => void
  onAdd?: (end: ChainEnd) => void
}

/** Thickness of a drawn backrest and arm, as a share of the unit. */
const BACK_SHARE = 0.2
const ARM_SHARE = 0.12
const EMPTY_VIEW = { minX: -600, maxX: 600, minZ: -400, maxZ: 400 }

function activateOnKey(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

function unionOf(rectangles: readonly FloorRectangle[]): FloorRectangle | null {
  if (rectangles.length === 0) return null
  return {
    minX: Math.min(...rectangles.map((rectangle) => rectangle.minX)),
    maxX: Math.max(...rectangles.map((rectangle) => rectangle.maxX)),
    minZ: Math.min(...rectangles.map((rectangle) => rectangle.minZ)),
    maxZ: Math.max(...rectangles.map((rectangle) => rectangle.maxZ)),
  }
}

export function LayoutPlan({
  placed,
  labelFor,
  description,
  className,
  interactive = false,
  selectedEntryId = null,
  ghosts = [],
  showDimensions = false,
  emptyText,
  onSelect,
  onAdd,
}: LayoutPlanProps) {
  const bounds = layoutBounds(placed)
  const drawn = unionOf([...(bounds ? [bounds] : []), ...ghosts.map((ghost) => ghost.footprint)]) ?? EMPTY_VIEW
  const extent = Math.max(drawn.maxX - drawn.minX, drawn.maxZ - drawn.minZ, 1200)
  const margin = extent * 0.08
  const dimensionGap = showDimensions && bounds ? extent * 0.09 : 0
  const fontSize = extent / (interactive ? 26 : 18)
  const viewBox = [
    drawn.minX - margin,
    drawn.minZ - margin,
    drawn.maxX - drawn.minX + margin * 2 + dimensionGap * 1.6,
    drawn.maxZ - drawn.minZ + margin * 2 + dimensionGap * 1.6,
  ].join(' ')

  return (
    <svg
      className={className}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={interactive ? 'group' : description ? 'img' : undefined}
      aria-label={description || undefined}
      aria-hidden={description ? undefined : true}
      focusable="false"
    >
      {placed.map((piece, index) => (
        <PlanUnit
          key={piece.entry.entryId}
          piece={piece}
          number={index + 1}
          label={labelFor(piece.entry.pieceId)}
          fontSize={fontSize}
          interactive={interactive}
          selected={piece.entry.entryId === selectedEntryId}
          onSelect={onSelect}
        />
      ))}
      {ghosts.map((ghost) => (
        <PlanGhostSpace key={ghost.end} ghost={ghost} fontSize={fontSize * 1.6} onAdd={onAdd} />
      ))}
      {placed.length === 0 && emptyText ? (
        <text className="mcf-plan-empty" x={(drawn.minX + drawn.maxX) / 2} y={(drawn.minZ + drawn.maxZ) / 2} style={{ fontSize }}>
          {emptyText}
        </text>
      ) : null}
      {bounds && showDimensions ? <PlanDimensions bounds={bounds} gap={dimensionGap} fontSize={fontSize} /> : null}
    </svg>
  )
}

interface PlanUnitProps {
  piece: PlacedPiece
  number: number
  label: string
  fontSize: number
  interactive: boolean
  selected: boolean
  onSelect?: (entryId: string) => void
}

/**
 * A quarter of a ring as an SVG path, in the piece's own frame: between two
 * radii, from the direction `from` round to the direction `to` about `centre`.
 */
function ringPath(centre: FloorVector, innerRadius: number, outerRadius: number, from: FloorVector, to: FloorVector): string {
  // The SVG y axis is the layout's z, so a positive cross product is clockwise on screen.
  const sweep = from.x * to.z - from.z * to.x > 0 ? 1 : 0
  const at = (radius: number, direction: FloorVector) => `${centre.x + radius * direction.x} ${centre.z + radius * direction.z}`
  return [
    `M ${at(outerRadius, from)}`,
    `A ${outerRadius} ${outerRadius} 0 0 ${sweep} ${at(outerRadius, to)}`,
    `L ${at(innerRadius, to)}`,
    `A ${innerRadius} ${innerRadius} 0 0 ${1 - sweep} ${at(innerRadius, from)}`,
    'Z',
  ].join(' ')
}

/** The piece's outline, backrest and arms, in its own frame, and where its number goes. */
function planShapeOf(piece: PlacedPiece): { body: ReactElement; numberAt: FloorVector } {
  const { widthMm: width, depthMm: depth, shape } = piece.definition
  const back = depth * BACK_SHARE
  const arm = width * ARM_SHARE
  switch (shape.kind) {
    case 'curve': {
      const lay = curveLayOf(shape.back, piece.entry.flipped)
      const centre = curveCentre(width, lay)
      // From the entry face round to the exit face (see chain-geometry's curve faces).
      const from = lay === 'outside' ? { x: 0, z: -1 } : { x: 0, z: 1 }
      const to = { x: 1, z: 0 }
      const inner = width - shape.seatDepthMm
      const band = shape.seatDepthMm * BACK_SHARE
      const middle = { x: (from.x + to.x) / Math.SQRT2, z: (from.z + to.z) / Math.SQRT2 }
      const seatRadius = shape.back === 'outside' ? inner + (shape.seatDepthMm - band) / 2 : shape.back === 'inside' ? inner + band + (shape.seatDepthMm - band) / 2 : inner + shape.seatDepthMm / 2
      return {
        body: (
          <>
            <path className="mcf-plan-unit" d={ringPath(centre, inner, width, from, to)} />
            {shape.back === 'outside' ? <path className="mcf-plan-back" d={ringPath(centre, width - band, width, from, to)} /> : null}
            {shape.back === 'inside' ? <path className="mcf-plan-back" d={ringPath(centre, inner, inner + band, from, to)} /> : null}
          </>
        ),
        numberAt: { x: centre.x + seatRadius * middle.x, z: centre.z + seatRadius * middle.z },
      }
    }
    case 'round-end':
      return {
        body: (
          <path
            className="mcf-plan-unit"
            d={`M ${-width / 2} ${-depth / 2} L ${width / 2} ${-depth / 2} A ${width / 2} ${depth} 0 0 1 ${-width / 2} ${-depth / 2} Z`}
          />
        ),
        numberAt: { x: 0, z: 0 },
      }
    case 'corner':
      return {
        body: (
          <>
            <rect className="mcf-plan-unit" x={-width / 2} y={-depth / 2} width={width} height={depth} rx={Math.min(width, depth) * 0.05} />
            <rect className="mcf-plan-back" x={-width / 2} y={-depth / 2} width={width} height={back} />
            <rect
              className="mcf-plan-back"
              x={shape.backSide === 'left' ? -width / 2 : width / 2 - back}
              y={-depth / 2}
              width={back}
              height={depth}
            />
          </>
        ),
        numberAt: { x: 0, z: back / 2 },
      }
    case 'straight':
      return {
        body: (
          <>
            <rect className="mcf-plan-unit" x={-width / 2} y={-depth / 2} width={width} height={depth} rx={Math.min(width, depth) * 0.05} />
            {shape.backless ? null : <rect className="mcf-plan-back" x={-width / 2} y={-depth / 2} width={width} height={back} />}
            {shape.closedLeft ? (
              <rect className="mcf-plan-arm" x={-width / 2} y={-depth / 2 + back} width={arm} height={depth - back} />
            ) : null}
            {shape.closedRight ? (
              <rect className="mcf-plan-arm" x={width / 2 - arm} y={-depth / 2 + back} width={arm} height={depth - back} />
            ) : null}
          </>
        ),
        numberAt: { x: 0, z: shape.backless ? 0 : back / 2 },
      }
  }
}

function PlanUnit({ piece, number, label, fontSize, interactive, selected, onSelect }: PlanUnitProps) {
  const degrees = (-piece.pose.rotationY * 180) / Math.PI
  const { body: outline, numberAt } = planShapeOf(piece)
  // The number sits on the seat, in front of any backrest, and stays upright.
  const seatCentre = pointOnPiece(piece.pose, numberAt)
  const select = () => onSelect?.(piece.entry.entryId)

  const body = (
    <>
      <g transform={`translate(${piece.pose.centre.x} ${piece.pose.centre.z}) rotate(${degrees})`}>{outline}</g>
      <text className="mcf-plan-number" x={seatCentre.x} y={seatCentre.z} style={{ fontSize }}>
        {number}
      </text>
    </>
  )

  if (!interactive) return <g>{body}</g>
  return (
    <g
      className="mcf-plan-hit"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Unit ${number}, ${label}`}
      onClick={select}
      onKeyDown={(event) => activateOnKey(event, select)}
    >
      {body}
    </g>
  )
}

function PlanGhostSpace({ ghost, fontSize, onAdd }: { ghost: PlanGhost; fontSize: number; onAdd?: (end: ChainEnd) => void }) {
  const { footprint } = ghost
  const add = () => onAdd?.(ghost.end)
  return (
    <g
      className="mcf-plan-hit"
      role="button"
      tabIndex={0}
      aria-label={ghost.label}
      onClick={add}
      onKeyDown={(event) => activateOnKey(event, add)}
    >
      <rect
        className="mcf-plan-ghost"
        x={footprint.minX}
        y={footprint.minZ}
        width={footprint.maxX - footprint.minX}
        height={footprint.maxZ - footprint.minZ}
        rx={Math.min(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ) * 0.05}
      />
      <text
        className="mcf-plan-ghost-plus"
        x={(footprint.minX + footprint.maxX) / 2}
        y={(footprint.minZ + footprint.maxZ) / 2}
        style={{ fontSize }}
      >
        +
      </text>
    </g>
  )
}

function PlanDimensions({ bounds, gap, fontSize }: { bounds: FloorRectangle; gap: number; fontSize: number }) {
  const widthLineZ = bounds.maxZ + gap * 0.6
  const depthLineX = bounds.maxX + gap * 0.6
  const tick = gap * 0.25
  return (
    <g aria-hidden="true">
      <line className="mcf-plan-dimension-line" x1={bounds.minX} y1={widthLineZ} x2={bounds.maxX} y2={widthLineZ} />
      <line className="mcf-plan-dimension-line" x1={bounds.minX} y1={widthLineZ - tick} x2={bounds.minX} y2={widthLineZ + tick} />
      <line className="mcf-plan-dimension-line" x1={bounds.maxX} y1={widthLineZ - tick} x2={bounds.maxX} y2={widthLineZ + tick} />
      <text className="mcf-plan-dimension" x={(bounds.minX + bounds.maxX) / 2} y={widthLineZ + gap * 0.55} style={{ fontSize }}>
        {formatMetres(bounds.maxX - bounds.minX)}
      </text>
      <line className="mcf-plan-dimension-line" x1={depthLineX} y1={bounds.minZ} x2={depthLineX} y2={bounds.maxZ} />
      <line className="mcf-plan-dimension-line" x1={depthLineX - tick} y1={bounds.minZ} x2={depthLineX + tick} y2={bounds.minZ} />
      <line className="mcf-plan-dimension-line" x1={depthLineX - tick} y1={bounds.maxZ} x2={depthLineX + tick} y2={bounds.maxZ} />
      <text
        className="mcf-plan-dimension"
        x={depthLineX + gap * 0.55}
        y={(bounds.minZ + bounds.maxZ) / 2}
        style={{ fontSize }}
        transform={`rotate(90 ${depthLineX + gap * 0.55} ${(bounds.minZ + bounds.maxZ) / 2})`}
      >
        {formatMetres(bounds.maxZ - bounds.minZ)}
      </text>
    </g>
  )
}
