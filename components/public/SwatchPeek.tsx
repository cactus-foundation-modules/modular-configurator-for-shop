'use client'

// The hover look at a layout swatch: a bigger block of the colour or the whole
// picture, with the value's name under it and, for a choice the layout cannot
// have, the reason. The same chip the individual items tab pops over its own
// swatches, so the two tabs read alike.
//
// Hover only. The name also rides the button's hidden label, so it is never
// hover-only for a keyboard or screen reader shopper. A phone has no hover, and a
// tap on one would pop a 200px panel over half the screen, so the site's mobile
// breakpoint hides the chip entirely (see peekMobileCss).
//
// The listeners sit on a wrapper rather than the button: a disabled button fires
// no mouse events, and the unavailable choices are the ones whose reason is most
// worth reading.
import { useState, type ReactNode } from 'react'
import { swatchStyle } from '@/modules/modular-configurator-for-shop/components/public/swatch-style'

interface SwatchPeekProps {
  swatch: string | null
  label: string
  reason: string | null
  children: ReactNode
}

export function SwatchPeek({ swatch, label, reason, children }: SwatchPeekProps) {
  const [open, setOpen] = useState(false)
  return (
    <span className="mcf-peek-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open ? (
        <span role="tooltip" className="mcf-peek">
          {swatch ? (
            <span
              className={swatch.startsWith('#') ? 'mcf-peek-colour' : 'mcf-peek-picture'}
              style={swatchStyle(swatch)}
              aria-hidden="true"
            />
          ) : null}
          <span className="mcf-peek-name">
            <span className={reason ? 'mcf-peek-struck' : undefined}>{label}</span>
            {reason ? <span className="mcf-peek-reason">{reason}</span> : null}
          </span>
        </span>
      ) : null}
    </span>
  )
}

/** Hides the chip at the site's mobile width, where a tap is the only "hover" there is. */
export function peekMobileCss(mobileBreakpoint: number): string {
  return `@media (max-width:${mobileBreakpoint}px){.mcf-peek{display:none!important}}`
}
