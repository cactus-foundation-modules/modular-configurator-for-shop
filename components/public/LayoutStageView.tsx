'use client'

// The layout's view: the 3D model or the plan from above, with the 3D / Plan /
// Sizes switches and a one-line summary. Drawn from a published snapshot, so the
// same view serves in the product gallery's stage (its normal home) and inline in
// the builder tab on a page whose layout has no gallery to host it.
//
// It owns only how it is looked at. Everything it shows, and everything a tap on
// it does, belongs to the builder that published the snapshot.
import { useMemo, useState } from 'react'
import type { LayoutStageSnapshot } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { LayoutStageLazy } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageLazy'

type ViewChoice = '3d' | 'plan'

interface LayoutStageViewProps {
  snapshot: LayoutStageSnapshot
  /** Fills a host's stage box (the gallery) rather than sizing itself (inline). */
  fill: boolean
}

export function LayoutStageView({ snapshot, fill }: LayoutStageViewProps) {
  const [viewChoice, setViewChoice] = useState<ViewChoice>('3d')
  const [showDimensions, setShowDimensions] = useState(true)
  const [unitsLoading, setUnitsLoading] = useState(0)
  const sceneGhosts = useMemo(() => snapshot.ghosts.map(({ end, footprint }) => ({ end, footprint })), [snapshot.ghosts])

  return (
    <div className={fill ? 'mcf-stage mcf-stage--fill' : 'mcf-stage'} data-cactus-unstyled="">
      {/* Both views stay mounted, so switching back to 3D does not rebuild the scene. */}
      <div className="mcf-stage-view" hidden={viewChoice !== '3d'}>
        <LayoutStageLazy
          parentProductId={snapshot.parentProductId}
          look={snapshot.look}
          placed={snapshot.placed}
          pieceById={snapshot.pieceById}
          childIdByEntry={snapshot.childIdByEntry}
          ghosts={sceneGhosts}
          selectedEntryId={snapshot.selectedEntryId}
          showDimensions={showDimensions}
          widthText={snapshot.widthText}
          depthText={snapshot.depthText}
          onSelectUnit={snapshot.onSelectUnit}
          onPickGhost={snapshot.onPickGhost}
          onRemoveUnit={snapshot.onRemoveUnit}
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
          selectedEntryId={snapshot.selectedEntryId}
          ghosts={snapshot.ghosts}
          showDimensions={showDimensions}
          onSelect={(entryId) => snapshot.onSelectUnit(entryId === snapshot.selectedEntryId ? null : entryId)}
          onAdd={snapshot.onPickGhost}
        />
      </div>
      <div className="mcf-stage-tools">
        <button type="button" className="mcf-chip" aria-pressed={viewChoice === '3d'} onClick={() => setViewChoice('3d')}>
          3D
        </button>
        <button type="button" className="mcf-chip" aria-pressed={viewChoice === 'plan'} onClick={() => setViewChoice('plan')}>
          Plan
        </button>
        <button type="button" className="mcf-chip" aria-pressed={showDimensions} onClick={() => setShowDimensions((value) => !value)}>
          Sizes
        </button>
      </div>
      <p className="mcf-stage-caption" aria-live="polite">
        {unitsLoading > 0 && viewChoice === '3d' ? 'Bringing the units in…' : snapshot.summaryText}
      </p>
    </div>
  )
}
