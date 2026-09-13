// Inline style atoms for the set-up screen, in the manner of the other shop
// companions' product editor sections: theme tokens only, so the panel follows
// the admin's light and dark schemes.
import type { CSSProperties } from 'react'

export const fieldStyle: CSSProperties = {
  padding: '0.375rem 0.5rem',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: '0.8125rem',
}

export const numberFieldStyle: CSSProperties = { ...fieldStyle, width: '6rem', fontVariantNumeric: 'tabular-nums' }

export const labelStyle: CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }

export const hintStyle: CSSProperties = { margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }

export const buttonStyle: CSSProperties = { ...fieldStyle, cursor: 'pointer', fontWeight: 600 }

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: 'var(--color-on-primary)',
}

export const panelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  padding: '0.875rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg-subtle)',
}

export const errorStyle: CSSProperties = { margin: 0, fontSize: '0.8125rem', color: 'var(--color-error)' }

export const successStyle: CSSProperties = { margin: 0, fontSize: '0.8125rem', color: 'var(--color-success)' }
