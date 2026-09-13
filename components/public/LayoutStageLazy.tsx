'use client'

// The 3D stage behind a lazy edge, so three.js and the 3D views module's loaders
// load only when a shopper opens the builder - never on a product page that
// merely shows the card, and never on any other page. Client-only as well: there
// is no WebGL on the server, and nothing about the stage is worth rendering there.
import dynamic from 'next/dynamic'
import type { LayoutStageProps } from '@/modules/modular-configurator-for-shop/components/public/LayoutStage'

export const LayoutStageLazy = dynamic<LayoutStageProps>(
  () => import('@/modules/modular-configurator-for-shop/components/public/LayoutStage').then((module) => module.LayoutStage),
  {
    ssr: false,
    loading: () => <div className="mcf-stage-fallback">Setting out the 3D view…</div>,
  },
)
