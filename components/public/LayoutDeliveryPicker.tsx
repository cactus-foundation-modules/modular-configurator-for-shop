'use client'

// The layout's delivery choice, drawn with shop's own per-line picker - the same
// component the basket and the product page's delivery box use - so the service
// card and the "Switch to" chips look exactly as they do on the individual tab.
// Beneath it, what the chosen service comes to across the whole layout, since the
// charge is per item.
import { CartLineControlView } from '@/modules/shop/components/public/CartLineControlView'
import { CART_LINE_CSS } from '@/modules/shop/components/public/cart-line-css'
import { formatMoney } from '@/modules/shop/lib/money'
import type { LayoutDelivery } from '@/modules/modular-configurator-for-shop/lib/layout-delivery'
import { itemCountLabel } from '@/modules/modular-configurator-for-shop/lib/layout-describe'

interface LayoutDeliveryPickerProps {
  delivery: LayoutDelivery
  /** Items across every layout being bought. */
  itemCount: number
  /** How many of the layout, so the total covers them all. */
  layoutQuantity: number
  currencySymbol: string
  onChange: (value: string) => void
}

export function LayoutDeliveryPicker({ delivery, itemCount, layoutQuantity, currencySymbol, onChange }: LayoutDeliveryPickerProps) {
  const total = (delivery.totalByValue.get(delivery.control.value) ?? 0) * layoutQuantity
  return (
    <div className="mcf-delivery">
      {/* Shop's basket stylesheet is where this picker's look lives; imported whole
          rather than copied, so it cannot drift from the basket's. */}
      <style dangerouslySetInnerHTML={{ __html: CART_LINE_CSS }} />
      <CartLineControlView control={delivery.control} groupName="mcf-layout-delivery" onChange={onChange} />
      {total > 0 ? (
        <p className="mcf-delivery-total">
          Delivery for your layout: <strong>{formatMoney(total, currencySymbol)}</strong> ({itemCountLabel(itemCount)})
        </p>
      ) : null}
    </div>
  )
}
