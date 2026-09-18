'use client'

// A layout drawn from above, to scale: each unit's footprint with its backrest
// and arms marked, numbered to match the list, and dashed "+" spaces where a
// unit can join. The accessible twin of the 3D view - everything the shopper can
// do by pointing at the model they can do here with a keyboard - and, in its
// small size, the thumbnail on the product page's card.
//
// Drawn in millimetres, straight from the placement maths: the SVG's y axis runs
// towards the shopper exactly as the layout's z does, so nothing is flipped.
//
// A unit standing on its own can be dragged about, or nudged with the arrow keys
// once it has focus (Shift for a finer step). While it is dragged it is drawn
// where it would land, in the danger colour where it cannot; the drawing's frame
// holds still until it is let go of.
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import {
  curveCentre,
  curveLayOf,
  halfCurveCentre,
  layoutBounds,
  outlineMiddle,
  pointOnPiece,
  segmentCorners,
  segmentInset,
  type FloorRectangle,
  type FloorVector,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { SpaceKey } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { formatMetres } from '@/modules/modular-configurator-for-shop/lib/layout-describe'

export interface PlanGhost {
  key: SpaceKey
  footprint: FloorRectangle
  /** The space's own outline on the floor: the unit that would go there, turned as it would sit. */
  outline: readonly FloorVector[]
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
  onAdd?: (key: SpaceKey) => void
  /** Units that can be dragged about (those standing on their own). */
  movableEntryIds?: ReadonlySet<string>
  /** Whether a movable unit could stand with its middle at `centre`. */
  canMoveTo?: (entryId: string, centre: FloorVector) => boolean
  /** A movable unit put down with its middle at `centre`. */
  onMove?: (entryId: string, centre: FloorVector) => unknown
}

interface PlanDrag {
  entryId: string
  pointerId: number
  /** From the floor under the pointer to the unit's middle, so it keeps hold where it was picked up. */
  grab: FloorVector
  startX: number
  startY: number
  moved: boolean
  centre: FloorVector
  fits: boolean
}

/** Thickness of a drawn backrest and arm, as a share of the unit. */
const BACK_SHARE = 0.2
const ARM_SHARE = 0.12
const EMPTY_VIEW = { minX: -600, maxX: 600, minZ: -400, maxZ: 400 }
/** How far a pointer goes before a press on a movable unit is a drag, not a tap. */
const DRAG_SLOP_PX = 5
/** An arrow key's nudge, in millimetres, and with Shift held. */
const NUDGE_MM = 100
const FINE_NUDGE_MM = 10
const NUDGES: Readonly<Record<string, FloorVector>> = {
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
}
const NOTHING_MOVABLE: ReadonlySet<string> = new Set()

/** The floor point under a pointer, in the drawing's own millimetres. */
function floorPointOf(svg: SVGSVGElement | null, clientX: number, clientY: number): FloorVector | null {
  const matrix = svg?.getScreenCTM()
  if (!matrix) return null
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return { x: point.x, z: point.y }
}

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
  movableEntryIds = NOTHING_MOVABLE,
  canMoveTo,
  onMove,
}: LayoutPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<PlanDrag | null>(null)
  // A drag ends in a click on whatever it was let go over; that click is not a tap.
  const swallowClickRef = useRef(false)
  const canDrag = interactive && onMove !== undefined
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

  const startDrag = (piece: PlacedPiece, event: ReactPointerEvent<SVGGElement>) => {
    if (!canDrag || !event.isPrimary || event.button !== 0) return
    const floor = floorPointOf(svgRef.current, event.clientX, event.clientY)
    if (!floor) return
    swallowClickRef.current = false
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // Uncaptured, the drag still follows while the pointer stays over the plan.
    }
    setDrag({
      entryId: piece.entry.entryId,
      pointerId: event.pointerId,
      grab: { x: piece.pose.centre.x - floor.x, z: piece.pose.centre.z - floor.z },
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      centre: piece.pose.centre,
      fits: true,
    })
  }
  const followDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= DRAG_SLOP_PX) return
    const floor = floorPointOf(svgRef.current, event.clientX, event.clientY)
    if (!floor) return
    const centre = { x: Math.round(floor.x + drag.grab.x), z: Math.round(floor.z + drag.grab.z) }
    setDrag({ ...drag, moved: true, centre, fits: canMoveTo ? canMoveTo(drag.entryId, centre) : true })
  }
  const endDrag = (event: ReactPointerEvent<SVGSVGElement>, dropped: boolean) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    setDrag(null)
    if (!drag.moved) return
    // The click that follows the release comes in the same turn, if it comes to
    // a unit at all; after that there is nothing left to swallow.
    swallowClickRef.current = true
    window.setTimeout(() => {
      swallowClickRef.current = false
    }, 0)
    if (dropped && drag.fits) onMove?.(drag.entryId, drag.centre)
  }
  const select = onSelect
    ? (entryId: string) => {
        if (swallowClickRef.current) {
          swallowClickRef.current = false
          return
        }
        onSelect(entryId)
      }
    : undefined
  const nudge = (piece: PlacedPiece, event: KeyboardEvent) => {
    const direction = NUDGES[event.key]
    if (!direction || !onMove) return
    event.preventDefault()
    const step = event.shiftKey ? FINE_NUDGE_MM : NUDGE_MM
    const centre = { x: piece.pose.centre.x + direction.x * step, z: piece.pose.centre.z + direction.z * step }
    if (!canMoveTo || canMoveTo(piece.entry.entryId, centre)) onMove(piece.entry.entryId, centre)
  }

  return (
    <svg
      ref={svgRef}
      onPointerMove={drag ? followDrag : undefined}
      onPointerUp={drag ? (event) => endDrag(event, true) : undefined}
      onPointerCancel={drag ? (event) => endDrag(event, false) : undefined}
      className={className}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={interactive ? 'group' : description ? 'img' : undefined}
      aria-label={description || undefined}
      aria-hidden={description ? undefined : true}
      focusable="false"
    >
      {placed.map((piece, index) => {
        const movable = canDrag && movableEntryIds.has(piece.entry.entryId)
        const dragged = drag?.moved === true && drag.entryId === piece.entry.entryId ? drag : null
        return (
          <PlanUnit
            key={piece.entry.entryId}
            piece={dragged ? { ...piece, pose: { ...piece.pose, centre: dragged.centre } } : piece}
            number={index + 1}
            label={labelFor(piece.entry.pieceId)}
            fontSize={fontSize}
            interactive={interactive}
            selected={piece.entry.entryId === selectedEntryId}
            onSelect={select}
            drag={movable ? { dragging: dragged !== null, blocked: dragged?.fits === false, onStart: (event) => startDrag(piece, event), onKey: (event) => nudge(piece, event) } : undefined}
          />
        )
      })}
      {ghosts.map((ghost) => (
        <PlanGhostSpace key={ghost.key} ghost={ghost} fontSize={fontSize * 1.6} onAdd={onAdd} />
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
  /** Present for a unit that can be dragged about. */
  drag?: {
    dragging: boolean
    /** Being dragged over somewhere it cannot stand. */
    blocked: boolean
    onStart: (event: ReactPointerEvent<SVGGElement>) => void
    onKey: (event: KeyboardEvent) => void
  }
}

/**
 * Part of a ring as an SVG path, in the piece's own frame: between two radii,
 * round `centre` through each of `directions` in turn, a quarter turn at most
 * between neighbours - [from, to] for a curve, [left, far, right] for a half curve.
 */
function ringPath(centre: FloorVector, innerRadius: number, outerRadius: number, directions: readonly FloorVector[]): string {
  const first = directions[0]
  const second = directions[1]
  if (!first || !second) return ''
  // The SVG y axis is the layout's z, so a positive cross product is clockwise on screen.
  const sweep = first.x * second.z - first.z * second.x > 0 ? 1 : 0
  const at = (radius: number, direction: FloorVector) => `${centre.x + radius * direction.x} ${centre.z + radius * direction.z}`
  const onward = directions.slice(1)
  const back = [...directions].reverse().slice(1)
  return [
    `M ${at(outerRadius, first)}`,
    ...onward.map((direction) => `A ${outerRadius} ${outerRadius} 0 0 ${sweep} ${at(outerRadius, direction)}`),
    `L ${at(innerRadius, directions[directions.length - 1] ?? first)}`,
    ...back.map((direction) => `A ${innerRadius} ${innerRadius} 0 0 ${1 - sweep} ${at(innerRadius, direction)}`),
    'Z',
  ].join(' ')
}

/** A closed SVG path through floor points. */
function polygonPath(corners: readonly FloorVector[]): string {
  return `${corners.map((corner, index) => `${index === 0 ? 'M' : 'L'} ${corner.x} ${corner.z}`).join(' ')} Z`
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
            <path className="mcf-plan-unit" d={ringPath(centre, inner, width, [from, to])} />
            {shape.back === 'outside' ? <path className="mcf-plan-back" d={ringPath(centre, width - band, width, [from, to])} /> : null}
            {shape.back === 'inside' ? <path className="mcf-plan-back" d={ringPath(centre, inner, inner + band, [from, to])} /> : null}
          </>
        ),
        numberAt: { x: centre.x + seatRadius * middle.x, z: centre.z + seatRadius * middle.z },
      }
    }
    case 'half-curve': {
      const lay = curveLayOf(shape.back, piece.entry.flipped)
      const centre = halfCurveCentre(depth, lay)
      // From the left cut end round the far side of the ring to the right one (see chain-geometry's half curve faces).
      const far = lay === 'outside' ? { x: 0, z: -1 } : { x: 0, z: 1 }
      const directions = [{ x: -1, z: 0 }, far, { x: 1, z: 0 }]
      const outer = width / 2
      const inner = outer - shape.seatDepthMm
      const band = shape.seatDepthMm * BACK_SHARE
      const seatRadius = shape.back === 'outside' ? inner + (shape.seatDepthMm - band) / 2 : shape.back === 'inside' ? inner + band + (shape.seatDepthMm - band) / 2 : inner + shape.seatDepthMm / 2
      return {
        body: (
          <>
            <path className="mcf-plan-unit" d={ringPath(centre, inner, outer, directions)} />
            {shape.back === 'outside' ? <path className="mcf-plan-back" d={ringPath(centre, outer - band, outer, directions)} /> : null}
            {shape.back === 'inside' ? <path className="mcf-plan-back" d={ringPath(centre, inner, inner + band, directions)} /> : null}
          </>
        ),
        numberAt: { x: centre.x + seatRadius * far.x, z: centre.z + seatRadius * far.z },
      }
    }
    case 'segment': {
      const lay = curveLayOf(shape.back, piece.entry.flipped)
      const inset = segmentInset(depth, shape.angleDegrees)
      // Half the wedge's width `fromBack` millimetres forward of its back.
      const halfAcross = (fromBack: number) => width / 2 - inset * (lay === 'outside' ? fromBack / depth : 1 - fromBack / depth)
      const band = (fromBack: number, toBack: number, side: -1 | 1, thickness: number) => [
        { x: side * halfAcross(fromBack), z: -depth / 2 + fromBack },
        { x: side * (halfAcross(fromBack) - thickness), z: -depth / 2 + fromBack },
        { x: side * (halfAcross(toBack) - thickness), z: -depth / 2 + toBack },
        { x: side * halfAcross(toBack), z: -depth / 2 + toBack },
      ]
      const backs = [
        { x: -halfAcross(0), z: -depth / 2 },
        { x: halfAcross(0), z: -depth / 2 },
        { x: halfAcross(back), z: -depth / 2 + back },
        { x: -halfAcross(back), z: -depth / 2 + back },
      ]
      const armFrom = shape.back === 'none' ? 0 : back
      return {
        body: (
          <>
            <path className="mcf-plan-unit" d={polygonPath(segmentCorners(width, depth, shape.angleDegrees, lay))} />
            {shape.back === 'none' ? null : <path className="mcf-plan-back" d={polygonPath(backs)} />}
            {shape.closedLeft ? <path className="mcf-plan-arm" d={polygonPath(band(armFrom, depth, -1, arm))} /> : null}
            {shape.closedRight ? <path className="mcf-plan-arm" d={polygonPath(band(armFrom, depth, 1, arm))} /> : null}
          </>
        ),
        numberAt: { x: 0, z: shape.back === 'none' ? 0 : back / 2 },
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

function PlanUnit({ piece, number, label, fontSize, interactive, selected, onSelect, drag }: PlanUnitProps) {
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

  if (!interactive || !onSelect) return <g>{body}</g>
  const className = [
    'mcf-plan-hit',
    ...(drag ? ['mcf-plan-hit--movable'] : []),
    ...(drag?.dragging ? ['mcf-plan-hit--dragging'] : []),
    ...(drag?.blocked ? ['mcf-plan-hit--blocked'] : []),
  ].join(' ')
  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={drag ? `Unit ${number}, ${label}, standing on its own: arrow keys move it` : `Unit ${number}, ${label}`}
      onClick={select}
      onPointerDown={drag?.onStart}
      onKeyDown={(event) => {
        drag?.onKey(event)
        if (!event.defaultPrevented) activateOnKey(event, select)
      }}
    >
      {body}
    </g>
  )
}

/** True when an outline is just its footprint rectangle, square to the room. */
function isFootprintRectangle(outline: readonly FloorVector[], footprint: FloorRectangle): boolean {
  const near = (first: number, second: number) => Math.abs(first - second) < 0.01
  return (
    outline.length === 4 &&
    outline.every((corner) => (near(corner.x, footprint.minX) || near(corner.x, footprint.maxX)) && (near(corner.z, footprint.minZ) || near(corner.z, footprint.maxZ)))
  )
}

function PlanGhostSpace({ ghost, fontSize, onAdd }: { ghost: PlanGhost; fontSize: number; onAdd?: (key: SpaceKey) => void }) {
  const { footprint, outline } = ghost
  const add = () => onAdd?.(ghost.key)
  // Square to the room it is the rounded rectangle it always was; turned by a
  // wedge, or wedge-shaped itself, it is drawn as the unit would really sit.
  const square = isFootprintRectangle(outline, footprint)
  // On the shape itself: a turned wedge's box has its middle off to one side.
  const middle = outlineMiddle(outline)
  return (
    <g
      className="mcf-plan-hit"
      role="button"
      tabIndex={0}
      aria-label={ghost.label}
      onClick={add}
      onKeyDown={(event) => activateOnKey(event, add)}
    >
      {square ? (
        <rect
          className="mcf-plan-ghost"
          x={footprint.minX}
          y={footprint.minZ}
          width={footprint.maxX - footprint.minX}
          height={footprint.maxZ - footprint.minZ}
          rx={Math.min(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ) * 0.05}
        />
      ) : (
        <path className="mcf-plan-ghost" d={polygonPath(outline)} />
      )}
      <text
        className="mcf-plan-ghost-plus"
        x={middle.x}
        y={middle.z}
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
