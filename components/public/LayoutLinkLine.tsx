// The markup of the "create your own layout" line, shared by the page editor's
// sample and the storefront island so the two can never differ. No hooks and no
// 'use client': it renders wherever it is imported from.
const LAYOUT_LINK_CSS = `.mcf-layout-link{margin:10px 0 0;color:var(--color-text-muted)}
.mcf-layout-link a{color:var(--color-primary);text-decoration:underline;text-underline-offset:2px}
.mcf-layout-link a:hover{text-decoration-thickness:2px}`

interface LayoutLinkLineProps {
  leadText: string
  linkText: string
  newTab: boolean
  href: string
}

export function LayoutLinkLine({ leadText, linkText, newTab, href }: LayoutLinkLineProps) {
  const lead = leadText.trim()
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LAYOUT_LINK_CSS }} />
      <p className="mcf-layout-link">
        {lead ? `${lead} ` : null}
        <a href={href} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>
          {linkText}
        </a>
      </p>
    </>
  )
}
