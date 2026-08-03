'use client'

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'

/**
 * Form primitives. Inputs use radius sm (4) and never carry a cut corner.
 * Every field renders label, hint and error from one wrapper so the error
 * state is impossible to forget.
 */

const CONTROL = {
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  padding: '11px 13px',
  font: "400 14px/1.2 var(--fx-font-sans)",
  width: '100%',
  minHeight: 'var(--fx-tap-min)',
} as const

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label
        htmlFor={htmlFor}
        style={{ font: "500 13px/1 var(--fx-font-sans)", color: 'var(--fx-text-primary)' }}
      >
        {label}
        {required ? <span style={{ color: 'var(--fx-danger)' }}> *</span> : null}
      </label>
      {children}
      {/* State is never colour-only: the error replaces the hint and is announced. */}
      {error ? (
        <div
          role="alert"
          style={{ font: "400 12px/1.4 var(--fx-font-sans)", color: 'var(--fx-danger)' }}
        >
          {error}
        </div>
      ) : hint ? (
        <div style={{ font: "400 12px/1.4 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function TextInput({
  label,
  hint,
  error,
  mono,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Identifiers, LC numbers and quantities are always mono. */
  mono?: boolean
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} htmlFor={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        style={{
          ...CONTROL,
          borderColor: error ? 'var(--fx-danger)' : 'var(--fx-border-default)',
          fontFamily: mono ? 'var(--fx-font-mono)' : undefined,
        }}
        {...rest}
      />
    </Field>
  )
}

export function TextArea({
  label,
  hint,
  error,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} htmlFor={id}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        rows={rest.rows ?? 4}
        style={{
          ...CONTROL,
          lineHeight: 1.55,
          resize: 'vertical',
          borderColor: error ? 'var(--fx-danger)' : 'var(--fx-border-default)',
        }}
        {...rest}
      />
    </Field>
  )
}

export function Select({
  label,
  hint,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} htmlFor={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        style={{ ...CONTROL, borderColor: error ? 'var(--fx-danger)' : 'var(--fx-border-default)' }}
        {...rest}
      >
        {children}
      </select>
    </Field>
  )
}

export function SearchField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="search"
      style={{ ...CONTROL, background: 'var(--fx-bg-sunken)', border: '1px solid transparent' }}
      {...props}
    />
  )
}

/** Checked state uses an amber fill, but it is under 24px so it does not
    consume the view's amber moment. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: "400 14px/1 var(--fx-font-sans)",
        color: disabled ? 'var(--fx-text-disabled)' : 'var(--fx-text-primary)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 17,
          height: 17,
          margin: 0,
          accentColor: 'var(--fx-accent)',
          cursor: 'inherit',
        }}
      />
      {label}
    </label>
  )
}

export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string
  value: string
  checked: boolean
  onChange: (v: string) => void
  label: ReactNode
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        cursor: 'pointer',
        font: "400 14px/1 var(--fx-font-sans)",
        color: 'var(--fx-text-primary)',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        style={{ width: 17, height: 17, margin: 0, accentColor: 'var(--fx-accent)' }}
      />
      {label}
    </label>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 23,
        borderRadius: 'var(--fx-radius-full)',
        padding: 3,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        background: checked ? 'var(--fx-accent)' : 'var(--fx-border-default)',
        transition: 'background var(--fx-dur-state)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 17,
          height: 17,
          borderRadius: 'var(--fx-radius-full)',
          background: '#FFFFFF',
          boxShadow: '0 1px 2px rgb(24 29 41 / .3)',
        }}
      />
    </button>
  )
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: "400 12px/1 var(--fx-font-mono)",
          color: 'var(--fx-text-tertiary)',
        }}
      >
        <span>{label}</span>
        <span data-numeric>{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--fx-accent)' }}
      />
    </div>
  )
}
