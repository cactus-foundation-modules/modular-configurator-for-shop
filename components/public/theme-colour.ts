'use client'

/**
 * The computed colour of a theme token, as the browser resolves it for this
 * element - so a WebGL scene, which cannot read CSS, still draws in the site's
 * own colours and follows its light or dark scheme. A throwaway probe is styled
 * with the token and read back, which resolves nested var() fallbacks the same
 * way the page does.
 */
export function resolveThemeColour(host: HTMLElement, token: string, fallbackToken = '--color-text'): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token}, var(${fallbackToken}))`
  probe.style.display = 'none'
  host.appendChild(probe)
  const colour = getComputedStyle(probe).color
  probe.remove()
  return colour
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
