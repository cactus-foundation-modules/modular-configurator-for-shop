'use client'

// The React island around the builder's 3D scene. It owns the canvas and the
// scene's lifetime, and forwards what should be on stage; the scene itself (see
// lib/three/layout-scene.ts) decides how to animate there.
//
// Loaded only through LayoutStageLazy, so three.js reaches a shopper's browser
// only once they start building a layout.
import { useEffect, useRef, useState } from 'react'
import { layoutBounds, type PlacedPiece } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { SpaceKey } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import { LayoutScene, type SceneGhost } from '@/modules/modular-configurator-for-shop/lib/three/layout-scene'
import { buildUnitModel } from '@/modules/modular-configurator-for-shop/lib/three/unit-model'
import type { StorefrontPiece, StorefrontViewerLook } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import { prefersReducedMotion, resolveThemeColour } from '@/modules/modular-configurator-for-shop/components/public/theme-colour'

export interface LayoutStageProps {
  parentProductId: string
  look: StorefrontViewerLook
  placed: readonly PlacedPiece[]
  pieceById: ReadonlyMap<string, StorefrontPiece>
  /** The variation each unit is, by entry id; null while an option is unchosen. */
  childIdByEntry: ReadonlyMap<string, string | null>
  ghosts: readonly SceneGhost[]
  selectedEntryId: string | null
  showDimensions: boolean
  widthText: string
  depthText: string
  onSelectUnit: (entryId: string | null) => void
  onPickGhost: (key: SpaceKey) => void
  onRemoveUnit: (entryId: string) => void
  onLoadingChange: (unitsLoading: number) => void
}

type StageStatus = 'starting' | 'ready' | 'unavailable' | 'lost'

export function LayoutStage(props: LayoutStageProps) {
  const {
    parentProductId,
    look,
    placed,
    pieceById,
    childIdByEntry,
    ghosts,
    selectedEntryId,
    showDimensions,
    widthText,
    depthText,
  } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthLabelRef = useRef<HTMLSpanElement>(null)
  const depthLabelRef = useRef<HTMLSpanElement>(null)
  const sceneRef = useRef<LayoutScene | null>(null)
  const [status, setStatus] = useState<StageStatus>('starting')
  // Bumped to stand a fresh canvas and scene up after the browser took the
  // WebGL context away - a lost context cannot be asked back.
  const [generation, setGeneration] = useState(0)

  // The latest callbacks, read by the scene without it being rebuilt for each.
  const callbacksRef = useRef(props)
  useEffect(() => {
    callbacksRef.current = props
  })

  const placeholderColourRef = useRef('')

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const widthLabel = widthLabelRef.current
    const depthLabel = depthLabelRef.current
    if (!canvas || !wrap || !widthLabel || !depthLabel) return
    let cancelled = false
    let created: LayoutScene | null = null
    placeholderColourRef.current = resolveThemeColour(wrap, '--color-border-strong', '--color-border')
    LayoutScene.create(
      canvas,
      look,
      {
        accent: resolveThemeColour(wrap, '--color-primary'),
        danger: resolveThemeColour(wrap, '--color-danger', '--color-primary'),
        dangerMark: resolveThemeColour(wrap, '--color-text-inverse', '--color-text'),
        reducedMotion: prefersReducedMotion(),
      },
      {
        onSelectUnit: (entryId) => callbacksRef.current.onSelectUnit(entryId),
        onPickGhost: (key) => callbacksRef.current.onPickGhost(key),
        onRemoveUnit: (entryId) => callbacksRef.current.onRemoveUnit(entryId),
        onLoadingChange: (count) => callbacksRef.current.onLoadingChange(count),
        onContextLost: () => setStatus('lost'),
      },
      { width: widthLabel, depth: depthLabel },
    )
      .then((scene) => {
        if (cancelled) {
          scene.dispose()
          return
        }
        created = scene
        sceneRef.current = scene
        const { width, height } = wrap.getBoundingClientRect()
        scene.resize(width, height)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) sceneRef.current?.resize(box.width, box.height)
    })
    observer.observe(wrap)

    return () => {
      cancelled = true
      observer.disconnect()
      created?.dispose()
      sceneRef.current = null
    }
  }, [generation, look])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || status !== 'ready') return
    scene.setUnits(
      placed.map((piece) => {
        const storefrontPiece = pieceById.get(piece.entry.pieceId)
        const childProductId = childIdByEntry.get(piece.entry.entryId) ?? null
        return {
          entryId: piece.entry.entryId,
          pose: piece.pose,
          footprint: piece.footprint,
          sourceKey: `${piece.entry.pieceId}|${childProductId ?? 'unchosen'}|${piece.entry.flipped ? 'flipped' : 'usual'}`,
          build: () => {
            if (!storefrontPiece) return Promise.reject(new Error(`Unknown unit ${piece.entry.pieceId}`))
            return buildUnitModel({
              parentProductId,
              childProductId,
              piece: storefrontPiece,
              flipped: piece.entry.flipped === true,
              placeholderColour: placeholderColourRef.current,
            })
          },
        }
      }),
      layoutBounds(placed),
    )
  }, [status, placed, pieceById, childIdByEntry, parentProductId])

  useEffect(() => {
    if (status === 'ready') sceneRef.current?.setGhosts(ghosts)
  }, [status, ghosts])

  useEffect(() => {
    if (status === 'ready') sceneRef.current?.setSelected(selectedEntryId)
  }, [status, selectedEntryId])

  useEffect(() => {
    if (status === 'ready') sceneRef.current?.setDimensionsVisible(showDimensions)
  }, [status, showDimensions, placed])

  if (status === 'unavailable') {
    return (
      <div className="mcf-stage-fallback">
        This device cannot show the 3D view. Plan, above, does everything the 3D view does.
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas key={generation} ref={canvasRef} className="mcf-stage-canvas" aria-hidden="true" />
      <span ref={widthLabelRef} className="mcf-dimension" hidden>
        {widthText}
      </span>
      <span ref={depthLabelRef} className="mcf-dimension" hidden>
        {depthText}
      </span>
      {status === 'lost' ? (
        <div className="mcf-stage-fallback" style={{ position: 'absolute', inset: 0 }}>
          <div>
            <p className="mcf-status">The 3D view was paused by your browser.</p>
            <button
              type="button"
              className="mcf-button mcf-button--quiet"
              onClick={() => {
                setStatus('starting')
                setGeneration((value) => value + 1)
              }}
            >
              Show it again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
