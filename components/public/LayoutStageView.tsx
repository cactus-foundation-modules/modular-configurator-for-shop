'use client'

// The layout's view: the 3D model or the plan from above, with the 3D / Plan /
// Sizes switches, a full-screen button and a one-line summary. Drawn from a
// published snapshot, so the same view serves in the product gallery's stage (its
// normal home) and inline in the builder tab on a page whose layout has no gallery
// to host it.
//
// It owns only how it is looked at. Everything it shows, and everything a tap on
// it does, belongs to the builder that published the snapshot. Full screen is for
// looking only: no spaces to add to, no remove badges, and a tap chooses nothing -
// the editing stays with the builder beside the smaller view. It is the same view
// moved, not a second one (see `host`).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { LayoutStageLazy } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageLazy'

type ViewChoice = '3d' | 'plan'

interface LayoutStageViewProps {
  snapshot: LayoutStageSnapshot
  /** Fills a host's stage box (the gallery) rather than sizing itself (inline). */
  fill: boolean
}

const NO_GHOSTS: LayoutStageSnapshot['ghosts'] = []
const NOTHING_MOVABLE: ReadonlySet<string> = new Set()

export function LayoutStageView({ snapshot, fill }: LayoutStageViewProps) {
  const [viewChoice, setViewChoice] = useState<ViewChoice>('3d')
  const [showDimensions, setShowDimensions] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [spacerHeight, setSpacerHeight] = useState<number | null>(null)
  const cornerRef = useRef<HTMLButtonElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Full screen is the SAME view, moved: one 3D scene, so the models are not
  // loaded twice and the angle the shopper turned to carries across both ways.
  //
  // The frame renders through a portal into `host`, a node whose identity never
  // changes, and the layout effect below moves that node between the page and the
  // full-screen backdrop by hand. Rendering the frame into one place or the other
  // in React would unmount it and mount a fresh, never-drawn-into canvas; moving
  // the DOM node keeps the canvas, its WebGL context and the scene exactly as they
  // were (the product 3D viewer's full screen works the same way). Made after
  // mount, so the server render and the first client render agree.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = document.createElement('div')
    element.className = 'mcf-stage-host'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the portal's node is made once after mount so the server render and the first client render agree
    setHost(element)
    return () => element.remove()
  }, [])

  useLayoutEffect(() => {
    if (!host) return
    const parent = expanded ? backdropRef.current : slotRef.current
    if (parent && host.parentNode !== parent) parent.appendChild(host)
  }, [host, expanded])

  const open = () => {
    // Inline, the page would close up over the gap the view leaves; a spacer holds it.
    if (!fill) setSpacerHeight(host?.firstElementChild?.getBoundingClientRect().height ?? null)
    setExpanded(true)
  }
  const close = useCallback(() => {
    setExpanded(false)
    setSpacerHeight(null)
  }, [])

  // The one corner button changes between full screen and close, and is moved
  // with the view, which drops focus - so hand focus back to it each way.
  const focusedForRef = useRef(expanded)
  useEffect(() => {
    if (focusedForRef.current === expanded) return
    focusedForRef.current = expanded
    cornerRef.current?.focus()
  }, [expanded])

  // While full screen: Escape closes, and the page underneath does not scroll.
  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded, close])

  const frame = (
    <StageFrame
      snapshot={snapshot}
      className={expanded ? 'mcf-stage mcf-stage--expanded' : fill ? 'mcf-stage mcf-stage--fill' : 'mcf-stage'}
      viewChoice={viewChoice}
      onViewChoice={setViewChoice}
      showDimensions={showDimensions}
      onToggleDimensions={() => setShowDimensions((value) => !value)}
      editable={!expanded}
      dialogLabel={expanded ? 'Your layout, full screen' : undefined}
      corner={
        <button
          ref={cornerRef}
          type="button"
          className="mcf-stage-round"
          aria-label={expanded ? 'Close full screen' : 'View full screen'}
          onClick={expanded ? close : open}
        >
          {expanded ? <CloseIcon /> : <ExpandIcon />}
        </button>
      }
    />
  )

  return (
    <>
      {/* Empty to React on purpose: the host is appended here, and into the
          backdrop, by hand. */}
      <div ref={slotRef} className="mcf-stage-slot" />
      {spacerHeight !== null ? <div aria-hidden="true" style={{ height: spacerHeight }} /> : null}
      {expanded && typeof document !== 'undefined'
        ? createPortal(
            // Above every storefront widget, live chat included (it pins itself at 2147482000).
            <div ref={backdropRef} className="mcf-expand-backdrop" />,
            document.body,
          )
        : null}
      {host ? createPortal(frame, host) : null}
    </>
  )
}

interface StageFrameProps {
  snapshot: LayoutStageSnapshot
  className: string
  viewChoice: ViewChoice
  onViewChoice: (choice: ViewChoice) => void
  showDimensions: boolean
  onToggleDimensions: () => void
  /** False for the full-screen view: nothing to add to, remove or select. */
  editable: boolean
  /** The round button after the switches: full screen, or its close. */
  corner: ReactNode
  /** Makes the frame a labelled modal dialog. */
  dialogLabel?: string
}

function StageFrame({ snapshot, className, viewChoice, onViewChoice, showDimensions, onToggleDimensions, editable, corner, dialogLabel }: StageFrameProps) {
  const [unitsLoading, setUnitsLoading] = useState(0)
  const ghosts = editable ? snapshot.ghosts : NO_GHOSTS
  const sceneGhosts = useMemo(() => ghosts.map(({ key, footprint, outline }) => ({ key, footprint, outline })), [ghosts])
  const selectedEntryId = editable ? snapshot.selectedEntryId : null
  // Full screen is for looking: nothing there is dragged about.
  const movableEntryIds = editable ? snapshot.movableEntryIds : NOTHING_MOVABLE
  // "Bringing the units in…" always shows while models load. The summary follows
  // the set-up: where it is kept to Sizes, it goes with Sizes and stays off phones
  // (hide-mobile is core's utility, on the site's own phone breakpoint).
  const loadingText = unitsLoading > 0 && viewChoice === '3d' ? 'Bringing the units in…' : null
  const summaryShown = !snapshot.summaryWithSizesOnly || showDimensions
  const captionText = loadingText ?? (summaryShown ? snapshot.summaryText : null)
  const captionClass = loadingText === null && snapshot.summaryWithSizesOnly ? 'mcf-stage-caption hide-mobile' : 'mcf-stage-caption'

  return (
    <div
      className={className}
      data-cactus-unstyled=""
      {...(dialogLabel ? { role: 'dialog', 'aria-modal': true, 'aria-label': dialogLabel } : {})}
    >
      {/* Both views stay mounted, so switching back to 3D does not rebuild the scene. */}
      <div className="mcf-stage-view" hidden={viewChoice !== '3d'}>
        <LayoutStageLazy
          parentProductId={snapshot.parentProductId}
          look={snapshot.look}
          placed={snapshot.placed}
          pieceById={snapshot.pieceById}
          childIdByEntry={snapshot.childIdByEntry}
          ghosts={sceneGhosts}
          selectedEntryId={selectedEntryId}
          showDimensions={showDimensions}
          editable={editable}
          widthText={snapshot.widthText}
          depthText={snapshot.depthText}
          onSelectUnit={snapshot.onSelectUnit}
          onPickGhost={snapshot.onPickGhost}
          onRemoveUnit={snapshot.onRemoveUnit}
          movableEntryIds={movableEntryIds}
          canMoveUnitTo={snapshot.canMoveUnitTo}
          onMoveUnit={snapshot.onMoveUnit}
          onLoadingChange={setUnitsLoading}
        />
      </div>
      <div className="mcf-stage-view mcf-stage-plan" hidden={viewChoice !== 'plan'}>
        <LayoutPlan
          className="mcf-plan"
          placed={snapshot.placed}
          labelFor={snapshot.labelFor}
          description={snapshot.isEmpty ? 'Empty layout plan' : `Plan of your layout: ${snapshot.arrangementText}`}
          interactive
          selectedEntryId={selectedEntryId}
          ghosts={ghosts}
          showDimensions={showDimensions}
          onSelect={editable ? (entryId) => snapshot.onSelectUnit(entryId === snapshot.selectedEntryId ? null : entryId) : undefined}
          onAdd={editable ? snapshot.onPickGhost : undefined}
          movableEntryIds={movableEntryIds}
          canMoveTo={snapshot.canMoveUnitTo}
          onMove={editable ? snapshot.onMoveUnit : undefined}
        />
      </div>
      <div className="mcf-stage-tools">
        <button type="button" className="mcf-chip" aria-pressed={viewChoice === '3d'} onClick={() => onViewChoice('3d')}>
          3D
        </button>
        <button type="button" className="mcf-chip" aria-pressed={viewChoice === 'plan'} onClick={() => onViewChoice('plan')}>
          Plan
        </button>
        <button type="button" className="mcf-chip" aria-pressed={showDimensions} onClick={onToggleDimensions}>
          Sizes
        </button>
        {corner}
      </div>
      <p className={captionClass} aria-live="polite" hidden={captionText === null}>
        {captionText}
      </p>
    </div>
  )
}

// The same glyphs as the product 3D viewer's full-screen button and its close.
function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
