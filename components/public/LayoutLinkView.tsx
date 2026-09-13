'use client'

// The "create your own layout" line under a product's short description.
//
// The address follows the shopper: it joins the page's own variation selection
// (the store the option controls use, keyed by the product's slug), so picking
// "10 Seater" or a fabric here changes where the link goes - the matching
// starting layout, and those choices already made on the builder's page.
//
// The server cannot know those choices, so the first HTML (and the render that
// hydrates it) carries the plain address; the shopper's own takes over the
// moment the island is live. Reading the selection during hydration instead
// would put a different href in the browser than in the HTML, and React does
// not repair a mismatched attribute.
import { useSyncExternalStore } from 'react'
import { useVariationSelection } from '@/modules/shop-variations/lib/use-variation-selection'
import {
  carriedChoices,
  layoutLinkHref,
  pickStartingLayout,
  type ChosenValue,
  type LayoutLinkBlockData,
} from '@/modules/modular-configurator-for-shop/lib/layout-link'
import { LayoutLinkLine } from '@/modules/modular-configurator-for-shop/components/public/LayoutLinkLine'

const subscribeToNothing = () => () => {}

export function LayoutLinkView({ data }: { data: LayoutLinkBlockData }) {
  const live = useSyncExternalStore(subscribeToNothing, () => true, () => false)
  const selection = useVariationSelection(live ? data.slug : null)
  const payload = selection.payload

  // A handful of options and a dozen starting layouts at most: cheap enough to
  // work out afresh on every render, which also keeps it in step with every pick.
  const chosen = (payload?.options ?? []).flatMap((option): ChosenValue[] => {
    const value = option.values.find((candidate) => candidate.id === selection.optionValues[option.id])
    return value ? [{ optionName: option.name, valueSlug: value.slug }] : []
  })
  const href = layoutLinkHref(data.targetHref, pickStartingLayout(data.startingLayouts, chosen), carriedChoices(chosen, data.targetOptions))

  return <LayoutLinkLine leadText={data.leadText} linkText={data.linkText} newTab={data.newTab} href={href} />
}
