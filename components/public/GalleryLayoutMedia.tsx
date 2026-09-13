'use client'

// The layout's place in the product gallery, through shop's `shop.gallery-media`
// point: a "Your layout" thumbnail at the head of the strip and the layout view on
// the stage. The photographs keep their thumbnails beside it, and clicking one
// shows that photograph exactly as it always has.
//
// The gallery owns which item is on the stage; this only asks. It puts the layout
// up when a layout is started (or edited) with the builder's tab open, and hands
// the stage back when the shopper switches to the individual tab - the contract
// requires handing back anything the strip stops offering.
import { useEffect, useRef } from 'react'
import type { ShopGalleryExtraStageProps, ShopGalleryExtraThumbsProps } from '@/modules/shop/lib/gallery-media'
import { registerStageHost, useLayoutStageState } from '@/modules/modular-configurator-for-shop/components/public/layout-stage-store'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { LayoutStageView } from '@/modules/modular-configurator-for-shop/components/public/LayoutStageView'

export const LAYOUT_ITEM_KEY = 'modular-layout'

/** What this module's gallery provider hands the page: which product's builder to follow. */
export interface GalleryLayoutPayload {
  slug: string
}

function readPayload(payload: unknown): GalleryLayoutPayload | null {
  if (!payload || typeof payload !== 'object' || !('slug' in payload)) return null
  const slug = (payload as { slug: unknown }).slug
  return typeof slug === 'string' && slug ? { slug } : null
}

export function GalleryLayoutThumbs({ payload, activeKey, onPick, thumbClass, thumbOnClass }: ShopGalleryExtraThumbsProps) {
  const slug = readPayload(payload)?.slug ?? ''
  const { snapshot } = useLayoutStageState(slug)
  const wanted = snapshot?.wanted ?? false
  const revision = snapshot?.revision ?? -1
  const onStage = activeKey === LAYOUT_ITEM_KEY

  // Tell the builder there is a gallery to show its view, so it does not draw
  // one of its own in the purchase column as well.
  useEffect(() => (slug ? registerStageHost(slug) : undefined), [slug])

  // Up when wanted, and again after every edit - a shopper who clicked a photo
  // and then changes the layout is shown what they changed. Down when not wanted.
  // Whether it is on the stage, and how to ask, are read through refs rather than
  // watched: re-asking whenever the shopper clicks a photograph would take the
  // stage straight back off them.
  const onStageRef = useRef(onStage)
  const onPickRef = useRef(onPick)
  useEffect(() => {
    onStageRef.current = onStage
    onPickRef.current = onPick
  })
  const lastRevision = useRef<number | null>(null)
  useEffect(() => {
    if (!wanted) {
      lastRevision.current = null
      if (onStageRef.current) onPickRef.current(null)
      return
    }
    if (lastRevision.current === revision) return
    lastRevision.current = revision
    if (!onStageRef.current) onPickRef.current(LAYOUT_ITEM_KEY)
  }, [wanted, revision])

  if (!snapshot || !wanted) return null
  return (
    <button
      type="button"
      role="tab"
      className={onStage ? thumbOnClass : thumbClass}
      aria-selected={onStage}
      aria-label="Show your layout in 3D"
      onClick={() => onPick(LAYOUT_ITEM_KEY)}
      data-cactus-unstyled=""
    >
      <LayoutPlan className="mcf-thumb-plan" placed={snapshot.placed} labelFor={snapshot.labelFor} description="" />
    </button>
  )
}

export function GalleryLayoutStage({ payload }: ShopGalleryExtraStageProps) {
  const slug = readPayload(payload)?.slug ?? ''
  const { snapshot } = useLayoutStageState(slug)
  if (!snapshot) return null
  return <LayoutStageView snapshot={snapshot} fill />
}
