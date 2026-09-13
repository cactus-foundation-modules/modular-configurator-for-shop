'use client'

// A dropdown whose choices carry their swatch - the fabric's picture or the
// frame's colour - beside the name, which a native <select> cannot show.
//
// Pattern: the ARIA "select-only combobox". A button shows the chosen option;
// it opens a listbox beneath it. Arrow keys, Home and End move through the
// options, Enter or Space picks, Escape and a click elsewhere close without
// picking, and typing a letter jumps to the next option starting with it. Focus
// stays on the button throughout; the active option is announced through
// aria-activedescendant, as the pattern prescribes.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { swatchStyle } from '@/modules/modular-configurator-for-shop/components/public/swatch-style'

export interface SwatchSelectOption {
  /** '' is a legitimate value (e.g. "same as the layout"). */
  value: string
  label: string
  swatch: string | null
}

interface SwatchSelectProps {
  labelId: string
  options: readonly SwatchSelectOption[]
  value: string
  onChange: (value: string) => void
}

function Swatch({ swatch }: { swatch: string | null }) {
  return <span className="mcf-sselect-swatch" style={swatch ? swatchStyle(swatch) : undefined} aria-hidden="true" />
}

export function SwatchSelect({ labelId, options, value, onChange }: SwatchSelectProps) {
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = options[selectedIndex]
  // An option with no pictures at all (sizes, say) gets no empty circles either.
  const showSwatches = options.some((option) => option.swatch)

  // A click anywhere outside closes the list without picking.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Keep the active option in sight as the keys move through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }
  const pick = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (open) setActiveIndex((index) => Math.min(last, index + 1))
        else openAt(selectedIndex)
        return
      case 'ArrowUp':
        event.preventDefault()
        if (open) setActiveIndex((index) => Math.max(0, index - 1))
        else openAt(selectedIndex)
        return
      case 'Home':
        if (!open) return
        event.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        if (!open) return
        event.preventDefault()
        setActiveIndex(last)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) pick(activeIndex)
        else openAt(selectedIndex)
        return
      case 'Escape':
        if (!open) return
        event.preventDefault()
        setOpen(false)
        return
      case 'Tab':
        if (open) setOpen(false)
        return
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const letter = event.key.toLowerCase()
          const from = open ? activeIndex : selectedIndex
          const order = [...options.keys()].map((offset) => (from + 1 + offset) % options.length)
          const match = order.find((index) => options[index]?.label.toLowerCase().startsWith(letter))
          if (match !== undefined) {
            if (open) setActiveIndex(match)
            else openAt(match)
          }
        }
    }
  }

  const listId = `${baseId}-list`
  return (
    <div className="mcf-sselect" ref={rootRef}>
      <button
        type="button"
        role="combobox"
        className="mcf-sselect-button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${baseId}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={onKeyDown}
      >
        {showSwatches ? <Swatch swatch={selected?.swatch ?? null} /> : null}
        <span className="mcf-sselect-label">{selected?.label ?? ''}</span>
        <span className="mcf-sselect-caret" aria-hidden="true" />
      </button>
      <ul id={listId} ref={listRef} role="listbox" aria-labelledby={labelId} className="mcf-sselect-list" hidden={!open}>
        {options.map((option, index) => (
          <li
            key={option.value || 'inherit'}
            id={`${baseId}-option-${index}`}
            role="option"
            data-index={index}
            aria-selected={index === selectedIndex}
            data-active={index === activeIndex}
            className="mcf-sselect-option"
            onPointerEnter={() => setActiveIndex(index)}
            onClick={() => pick(index)}
          >
            {showSwatches ? <Swatch swatch={option.swatch} /> : null}
            <span className="mcf-sselect-label">{option.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
