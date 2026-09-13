'use client'

// The "Link to a layout builder" part of a product's Layout builder panel: for a
// product that is not itself built from units - a ready-made set, say - a line
// under its short description sending shoppers to a product that has the
// builder, opened on a starting layout that can depend on what they picked here.
// Saves through the module's own route and re-reads what was saved.
import { useEffect, useState } from 'react'
import type { LayoutLinkAdminPayload, LinkBuilderProduct, LinkOption } from '@/modules/modular-configurator-for-shop/lib/layout-link-admin-payload'
import { definitionsBySlug } from '@/modules/modular-configurator-for-shop/lib/layout-link'
import {
  DEFAULT_LEAD_TEXT,
  DEFAULT_LINK_TEXT,
  MAX_STARTING_LAYOUTS,
  type LayoutLink,
  type StartingLayout,
} from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import { PresetPreview } from '@/modules/modular-configurator-for-shop/components/admin/PresetListEditor'
import {
  buttonStyle,
  errorStyle,
  fieldStyle,
  hintStyle,
  labelStyle,
  panelStyle,
  primaryButtonStyle,
  successStyle,
} from '@/modules/modular-configurator-for-shop/components/admin/admin-styles'

const API = '/api/m/modular-configurator-for-shop/admin/products'

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; payload: LayoutLinkAdminPayload }

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  } catch {
    // Not JSON; the fallback says enough.
  }
  return fallback
}

function isLinkPayload(value: unknown): value is LayoutLinkAdminPayload {
  return Boolean(value && typeof value === 'object' && 'productId' in value && 'builders' in value && 'ownOptions' in value)
}

/** A condition as one <select> value: "" for none, else the option and value indexes. */
function conditionValue(layout: StartingLayout, options: readonly LinkOption[]): string {
  if (!layout.when) return ''
  const optionIndex = options.findIndex((option) => option.name.trim().toLowerCase() === layout.when?.optionName.trim().toLowerCase())
  const valueIndex = options[optionIndex]?.values.findIndex((value) => value.slug === layout.when?.valueSlug) ?? -1
  return optionIndex >= 0 && valueIndex >= 0 ? `${optionIndex}:${valueIndex}` : ''
}

function conditionFrom(selectValue: string, options: readonly LinkOption[]): StartingLayout['when'] {
  const [optionIndex, valueIndex] = selectValue.split(':').map(Number)
  const option = optionIndex === undefined ? undefined : options[optionIndex]
  const value = option && valueIndex !== undefined ? option.values[valueIndex] : undefined
  return option && value ? { optionName: option.name, valueSlug: value.slug } : null
}

export function LayoutLinkEditor({ productId }: { productId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [link, setLink] = useState<LayoutLink | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/${encodeURIComponent(productId)}/layout-link`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, 'The layout builder link could not be loaded'))
        const body: unknown = await response.json()
        if (!isLinkPayload(body)) throw new Error('The layout builder link came back in a shape this screen does not recognise')
        return body
      })
      .then((payload) => {
        if (cancelled) return
        setLoad({ status: 'ready', payload })
        setLink(payload.link)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'unavailable', message: error instanceof Error ? error.message : 'Could not load' })
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (load.status === 'loading') return <p style={hintStyle}>Loading the layout builder link…</p>
  if (load.status === 'unavailable') return <p style={hintStyle}>{load.message}</p>
  const { payload } = load

  const changeLink = (next: LayoutLink | null) => {
    setLink(next)
    setMessage(null)
  }

  const chooseTarget = (targetProductId: string) => {
    if (!targetProductId) return changeLink(null)
    if (link?.targetProductId === targetProductId) return
    // Another product's units are not these, so its starting layouts go with it.
    changeLink({
      targetProductId,
      leadText: link?.leadText ?? DEFAULT_LEAD_TEXT,
      linkText: link?.linkText ?? DEFAULT_LINK_TEXT,
      newTab: link?.newTab ?? false,
      startingLayouts: [],
    })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API}/${encodeURIComponent(productId)}/layout-link`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      })
      if (!response.ok) {
        setMessage({ kind: 'error', text: await readError(response, 'The link could not be saved') })
        return
      }
      const body: unknown = await response.json()
      if (isLinkPayload(body)) {
        setLoad({ status: 'ready', payload: body })
        setLink(body.link)
      }
      setMessage({ kind: 'saved', text: link ? 'Saved' : 'Link taken off' })
    } catch {
      setMessage({ kind: 'error', text: 'The link could not be saved - check your connection and try again' })
    } finally {
      setSaving(false)
    }
  }

  const target = link ? payload.builders.find((builder) => builder.productId === link.targetProductId) ?? null : null

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <p style={hintStyle}>
        For a product that sends shoppers to a layout builder on another product - a ready-made set pointing at the
        range it is made from. A line goes under the short description, and the link can open the builder already laid
        out. The block &quot;Shop: Build your own layout link (modular products)&quot; has to be in the product page layout
        for it to show.
      </p>

      <div style={panelStyle}>
        <label style={{ display: 'grid', gap: '0.25rem', maxWidth: '28rem' }}>
          <span style={labelStyle}>Link to the layout builder on</span>
          <select style={fieldStyle} value={link?.targetProductId ?? ''} onChange={(event) => chooseTarget(event.target.value)}>
            <option value="">No link</option>
            {payload.builders.map((builder) => (
              <option key={builder.productId} value={builder.productId}>
                {builder.name}
              </option>
            ))}
            {link && !target ? <option value={link.targetProductId}>A product whose builder is switched off</option> : null}
          </select>
        </label>
        {payload.builders.length === 0 ? (
          <p style={hintStyle}>No other product has its layout builder switched on yet, so there is nothing to link to.</p>
        ) : null}

        {link ? (
          <>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={labelStyle}>Words before the link (blank for none)</span>
              <input style={fieldStyle} value={link.leadText} maxLength={200} onChange={(event) => changeLink({ ...link, leadText: event.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={labelStyle}>The link</span>
              <input style={fieldStyle} value={link.linkText} maxLength={200} onChange={(event) => changeLink({ ...link, linkText: event.target.value })} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <input type="checkbox" checked={link.newTab} onChange={(event) => changeLink({ ...link, newTab: event.target.checked })} />
              Open it in a new tab
            </label>
          </>
        ) : null}
      </div>

      {link && target ? (
        <div style={panelStyle}>
          <div>
            <span style={labelStyle}>Starting layouts</span>
            <p style={hintStyle}>
              The layout the builder opens on. Give one for &quot;whatever is chosen&quot;, and others for particular
              choices on this product - a 10 seater opening on ten seats. With none that fits, the link opens the
              builder&apos;s product page as it is. Choices the builder also offers (a fabric, a back height) are
              carried across either way.
            </p>
          </div>
          {link.startingLayouts.map((layout, index) => (
            <StartingLayoutRow
              key={index}
              layout={layout}
              ownOptions={payload.ownOptions}
              target={target}
              onChange={(next) =>
                changeLink({ ...link, startingLayouts: next ? link.startingLayouts.map((candidate, at) => (at === index ? next : candidate)) : link.startingLayouts.filter((_, at) => at !== index) })
              }
            />
          ))}
          {link.startingLayouts.length < MAX_STARTING_LAYOUTS ? (
            <div>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => changeLink({ ...link, startingLayouts: [...link.startingLayouts, { when: null, valueSlugs: [] }] })}
              >
                Add a starting layout
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" style={primaryButtonStyle} disabled={saving || (link === null && payload.link === null)} onClick={save}>
          {saving ? 'Saving…' : 'Save link'}
        </button>
        {message ? <p style={message.kind === 'error' ? errorStyle : successStyle}>{message.text}</p> : null}
      </div>
    </div>
  )
}

function StartingLayoutRow({ layout, ownOptions, target, onChange }: {
  layout: StartingLayout
  ownOptions: readonly LinkOption[]
  target: LinkBuilderProduct
  onChange: (next: StartingLayout | null) => void
}) {
  const labelBySlug = new Map(target.units.map((unit) => [unit.slug, unit.label]))
  const labelFor = (slug: string) => labelBySlug.get(slug) ?? slug
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 10rem)', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <div style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={labelStyle}>Used when</span>
          <select style={fieldStyle} value={conditionValue(layout, ownOptions)} onChange={(event) => onChange({ ...layout, when: conditionFrom(event.target.value, ownOptions) })}>
            <option value="">Whatever is chosen</option>
            {ownOptions.map((option, optionIndex) => (
              <optgroup key={option.name} label={option.name}>
                {option.values.map((value, valueIndex) => (
                  <option key={value.slug} value={`${optionIndex}:${valueIndex}`}>
                    {option.name}: {value.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <span style={labelStyle}>Units, in the order they join</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {layout.valueSlugs.map((slug, position) => (
            <button
              key={`${slug}-${position}`}
              type="button"
              style={buttonStyle}
              aria-label={`Take ${labelFor(slug)} out of this layout`}
              onClick={() => onChange({ ...layout, valueSlugs: layout.valueSlugs.filter((_, at) => at !== position) })}
            >
              {position + 1}. {labelFor(slug)} ×
            </button>
          ))}
          <select
            style={fieldStyle}
            value=""
            aria-label="Add a unit to the end"
            onChange={(event) => {
              if (event.target.value) onChange({ ...layout, valueSlugs: [...layout.valueSlugs, event.target.value] })
            }}
          >
            <option value="">Add a unit…</option>
            {target.units.map((unit) => (
              <option key={unit.slug} value={unit.slug}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button type="button" style={buttonStyle} onClick={() => onChange(null)}>
            Remove this layout
          </button>
        </div>
      </div>
      {layout.valueSlugs.length > 0 ? (
        <PresetPreview slugs={layout.valueSlugs} definitions={definitionsBySlug(target.config)} labelBySlug={labelBySlug} maxPieces={target.config.maxPieces} />
      ) : (
        <p style={hintStyle}>Add units to see it.</p>
      )}
    </div>
  )
}
