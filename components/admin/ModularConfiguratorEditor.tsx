'use client'

// The "Layout builder" panel on a product's edit screen: switch the builder on,
// say which option holds the units, describe how each unit joins and how big it
// is, and optionally write ready-made layouts. Saves through the module's own
// route and re-reads what was saved, so the screen always shows the stored set-up.
import { useEffect, useMemo, useState } from 'react'
import type { ConfiguratorAdminPayload } from '@/modules/modular-configurator-for-shop/lib/admin-payload'
import {
  DEFAULT_MAX_PIECES,
  MAX_PIECES_CEILING,
  VIEW_SUMMARY_CHOICES,
  presetWithoutUnit,
  type ConfiguratorConfig,
  type PieceConfig,
  type ViewSummaryChoice,
} from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { sameOptionName } from '@/modules/modular-configurator-for-shop/lib/piece-catalogue'
import { CONFIGURATOR_CSS } from '@/modules/modular-configurator-for-shop/components/public/configurator-css'
import { PieceSetupRow } from '@/modules/modular-configurator-for-shop/components/admin/PieceSetupRow'
import { PresetListEditor } from '@/modules/modular-configurator-for-shop/components/admin/PresetListEditor'
import {
  errorStyle,
  fieldStyle,
  hintStyle,
  labelStyle,
  numberFieldStyle,
  panelStyle,
  primaryButtonStyle,
  successStyle,
} from '@/modules/modular-configurator-for-shop/components/admin/admin-styles'

const API = '/api/m/modular-configurator-for-shop/admin/products'

const VIEW_SUMMARY_LABELS: Record<ViewSummaryChoice, string> = {
  always: 'Always',
  'with-sizes': 'Only while Sizes is on, and never on phones',
}

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; payload: ConfiguratorAdminPayload }

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  } catch {
    // Not JSON; the fallback says enough.
  }
  return fallback
}

function isAdminPayload(value: unknown): value is ConfiguratorAdminPayload {
  return Boolean(value && typeof value === 'object' && 'productId' in value && 'config' in value && 'options' in value)
}

export function ModularConfiguratorEditor({ productId }: { productId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [enabled, setEnabled] = useState(false)
  const [config, setConfig] = useState<ConfiguratorConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'saved'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/${encodeURIComponent(productId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, 'The layout builder set-up could not be loaded'))
        const body: unknown = await response.json()
        if (!isAdminPayload(body)) throw new Error('The layout builder set-up came back in a shape this screen does not recognise')
        return body
      })
      .then((payload) => {
        if (cancelled) return
        setLoad({ status: 'ready', payload })
        setEnabled(payload.enabled)
        setConfig(payload.config)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'unavailable', message: error instanceof Error ? error.message : 'Could not load' })
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  const payload = load.status === 'ready' ? load.payload : null
  const pieceOption = useMemo(
    () => (payload && config ? payload.options.find((option) => sameOptionName(option.name, config.pieceOptionName)) ?? null : null),
    [payload, config],
  )
  const labelBySlug = useMemo(() => new Map((pieceOption?.values ?? []).map((value) => [value.slug, value.label])), [pieceOption])

  if (load.status === 'loading') return <p style={hintStyle}>Loading the layout builder set-up…</p>
  if (load.status === 'unavailable') return <p style={hintStyle}>{load.message}</p>
  if (!payload || !config) return null

  const changeConfig = (next: ConfiguratorConfig) => {
    setConfig(next)
    setMessage(null)
  }

  const setPiece = (slug: string, piece: PieceConfig | null) => {
    const others = config.pieces.filter((candidate) => candidate.valueSlug !== slug)
    // Units keep the option's own order, whatever order they were ticked in.
    const order = new Map((pieceOption?.values ?? []).map((value, index) => [value.slug, index]))
    const pieces = piece ? [...others, piece].sort((a, b) => (order.get(a.valueSlug) ?? 0) - (order.get(b.valueSlug) ?? 0)) : others
    const presets = piece ? config.presets : config.presets.map((preset) => presetWithoutUnit(preset, slug))
    changeConfig({ ...config, pieces, presets })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`${API}/${encodeURIComponent(productId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, config }),
      })
      if (!response.ok) {
        setMessage({ kind: 'error', text: await readError(response, 'The set-up could not be saved') })
        return
      }
      const body: unknown = await response.json()
      if (isAdminPayload(body)) {
        setLoad({ status: 'ready', payload: body })
        setEnabled(body.enabled)
        setConfig(body.config)
      }
      setMessage({ kind: 'saved', text: 'Saved' })
    } catch {
      setMessage({ kind: 'error', text: 'The set-up could not be saved - check your connection and try again' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <style dangerouslySetInnerHTML={{ __html: CONFIGURATOR_CSS }} />
      <p style={hintStyle}>
        For a product made of units that join end to end and turn corners - a modular sofa, bench seating. Shoppers
        put units together in 3D on the product page and buy the whole layout in one go. The block &quot;Shop: Layout
        builder tabs (modular products)&quot; has to be in the product page layout for it to show.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setMessage(null) }} />
        Show the layout builder on this product
      </label>

      <div style={panelStyle}>
        <label style={{ display: 'grid', gap: '0.25rem', maxWidth: '20rem' }}>
          <span style={labelStyle}>Which option are the units?</span>
          <select
            style={fieldStyle}
            value={pieceOption?.name ?? ''}
            onChange={(event) => changeConfig({ ...config, pieceOptionName: event.target.value, pieces: [], presets: [] })}
          >
            <option value="">Choose an option…</option>
            {payload.options.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <p style={hintStyle}>Every other option (fabric, frame and so on) is chosen once for the whole layout, and can be changed unit by unit.</p>
      </div>

      {pieceOption ? (
        <div style={panelStyle}>
          <div>
            <span style={labelStyle}>The units</span>
            <p style={hintStyle}>
              Describe each unit as you see it standing in front of it - the way the photographs and the 3D view show it. A corner&apos;s &quot;second back&quot; is the backrest
              down one side - look at the corner from the front and say which side it is on. The 3D view fits each
              model to the width given here.
            </p>
          </div>
          <div>
            {pieceOption.values.map((value) => (
              <PieceSetupRow
                key={value.slug}
                value={value}
                piece={config.pieces.find((piece) => piece.valueSlug === value.slug) ?? null}
                onChange={(piece) => setPiece(value.slug, piece)}
              />
            ))}
          </div>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>Most units in one layout</span>
            <input
              style={numberFieldStyle}
              type="number"
              min={1}
              max={MAX_PIECES_CEILING}
              value={config.maxPieces}
              onChange={(event) => {
                const parsed = Math.round(Number(event.target.value))
                changeConfig({ ...config, maxPieces: Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, MAX_PIECES_CEILING) : DEFAULT_MAX_PIECES })
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>
              <input
                type="checkbox"
                checked={config.frontUnits}
                onChange={(event) => changeConfig({ ...config, frontUnits: event.target.checked })}
                style={{ marginRight: '0.5rem' }}
              />
              Units in front of other units
            </span>
            <p style={hintStyle}>
              Lets shoppers stand a unit with no back on the seat front of a unit with one - a cube pulled up in front of a chair. Leave it off
              unless the range is meant to be used that way: a range whose backless unit is a stool to stand beside the seats, not a cube to
              stand in front of them, should not offer it. Only has any effect where the range has both a straight unit with a back and one
              without.
            </p>
          </label>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>
              <input
                type="checkbox"
                checked={config.freeUnits}
                onChange={(event) => changeConfig({ ...config, freeUnits: event.target.checked })}
                style={{ marginRight: '0.5rem' }}
              />
              Units on their own
            </span>
            <p style={hintStyle}>
              Lets shoppers put a table, a stool or an armchair anywhere on the floor round their layout, as many as they like within the
              layout limit, and drag them about. Only units that make sense on their own are offered: a straight unit with no back, or one
              with arms both sides.
            </p>
          </label>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={labelStyle}>Layout summary over the view</span>
            <select
              style={fieldStyle}
              value={config.viewSummary}
              onChange={(event) => {
                const choice = VIEW_SUMMARY_CHOICES.find((candidate) => candidate === event.target.value)
                if (choice) changeConfig({ ...config, viewSummary: choice })
              }}
            >
              {VIEW_SUMMARY_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {VIEW_SUMMARY_LABELS[choice]}
                </option>
              ))}
            </select>
            <p style={hintStyle}>The line at the foot of the 3D view and plan that names the shape and gives its size.</p>
          </label>
        </div>
      ) : null}

      {pieceOption ? (
        <div style={panelStyle}>
          <span style={labelStyle}>Ready-made layouts</span>
          <PresetListEditor
            presets={config.presets}
            pieces={config.pieces}
            labelBySlug={labelBySlug}
            maxPieces={config.maxPieces}
            frontUnits={config.frontUnits}
            onChange={(presets) => changeConfig({ ...config, presets })}
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" style={primaryButtonStyle} disabled={saving || !pieceOption} onClick={save}>
          {saving ? 'Saving…' : 'Save layout builder'}
        </button>
        {message ? <p style={message.kind === 'error' ? errorStyle : successStyle}>{message.text}</p> : null}
      </div>
    </div>
  )
}
