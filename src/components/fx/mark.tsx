'use client'

import { useEffect, useState } from 'react'

/**
 * The MARBIM mark — the first signature element, and the product's ONLY
 * loading affordance. Generic circular spinners are not part of the system.
 *
 * The mark is the official X-mark asset split into its eight strokes, animated
 * as a unit with transform and opacity only. Colour is never animated, and the
 * stroke files themselves are never redrawn or recoloured at runtime: the ink
 * set (i-*) serves light surfaces, the white set (w-*) serves dark ones, and
 * CSS picks between them from the nearest data-theme scope.
 */

export const MARK_STATES = [
  'rest',
  'awake',
  'listening',
  'thinking',
  'streaming',
  'resolved',
  'blocked',
] as const

export type MarkState = (typeof MARK_STATES)[number]

/** Sanctioned sizes. The mark is never rendered below 20px. */
export type MarkSize = 20 | 24 | 32 | 48 | 96

/**
 * Each stroke's outward unit vector from the mark's centre, ordered along the
 * 34° travel axis. The keyframes in theme.css read these as --dx / --dy, which
 * is what makes every stroke spread and converge along its own axis rather
 * than a shared one.
 */
const SLASHES = [
  { dx: -0.896, dy: 0.444 },
  { dx: -0.271, dy: 0.963 },
  { dx: -0.97, dy: -0.243 },
  { dx: 0.415, dy: 0.91 },
  { dx: -0.512, dy: -0.859 },
  { dx: 0.936, dy: 0.352 },
  { dx: 0.282, dy: -0.96 },
  { dx: 0.908, dy: -0.419 },
] as const

/** Per-stroke animation shorthand. `i` is the stroke index, which drives the stagger. */
const ANIMATION: Record<MarkState, (i: number) => string> = {
  // All eight strokes in registration, static.
  rest: () => 'none',
  // Each stroke pushes 6% out along its own axis, 30ms apart, and holds.
  awake: (i) => `fx-spread 220ms var(--fx-ease-enter) ${i * 30}ms 1 forwards`,
  // A slow travelling breath — phase-offset so the swell crosses the mark.
  listening: (i) => `fx-breathe 2.4s ease-in-out ${-i * 150}ms infinite`,
  // Strokes orbit the centre ±13°, staggered 90ms, opacity dipping per stroke.
  thinking: (i) => `fx-orbit 1.4s ease-in-out ${-i * 90}ms infinite`,
  // Strokes travel their 34° axis in sequence — a shimmer crossing the mark.
  streaming: (i) => `fx-travel .8s ease-in-out ${-i * 90}ms infinite`,
  // Converge from outside with a single 15% overshoot, then settle.
  resolved: (i) => `fx-converge 440ms var(--fx-ease-enter) ${i * 35}ms 1 forwards`,
  // Blocked does not animate. The mark desaturates and holds.
  blocked: () => 'none',
}

export interface MarbimMarkProps {
  state?: MarkState
  size?: MarkSize
  /** Accessible label. Pass null for decorative marks sitting beside their own text. */
  label?: string | null
  className?: string
}

export function MarbimMark({
  state = 'rest',
  size = 32,
  label = 'MARBIM',
  className,
}: MarbimMarkProps) {
  const blocked = state === 'blocked'

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      data-mark-state={state}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        // Blocked desaturates to a held, muted mark rather than animating.
        filter: blocked ? 'grayscale(1)' : undefined,
        opacity: blocked ? 0.5 : undefined,
      }}
    >
      {SLASHES.map((s, i) => {
        const style = {
          position: 'absolute' as const,
          inset: 0,
          width: '100%',
          height: '100%',
          transformOrigin: 'center',
          willChange: 'transform, opacity',
          animation: ANIMATION[state](i),
          ['--dx' as string]: s.dx,
          ['--dy' as string]: s.dy,
        }
        return (
          <span key={i}>
            {/* Both sets ship; theme.css reveals the one matching the nearest scope.
                Plain <img> on purpose: these are eight ~700-byte layers stacked at
                fixed size and animated by CSS. next/image would wrap each in a
                positioned span and lazy-load them, which breaks the registration
                the whole mark depends on, and there is nothing to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brand/mark/i-${i + 1}.png`} alt="" className="fx-mark-ink" style={style} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brand/mark/w-${i + 1}.png`} alt="" className="fx-mark-white" style={style} />
          </span>
        )
      })}
    </span>
  )
}

/**
 * The mark used as a spinner. Drives itself through thinking → streaming so a
 * pending screen reads as working rather than stalled.
 */
export function MarbimSpinner({
  size = 32,
  label = 'Loading',
}: {
  size?: MarkSize
  label?: string
}) {
  const [state, setState] = useState<MarkState>('thinking')

  useEffect(() => {
    const t = setTimeout(() => setState('streaming'), 2400)
    return () => clearTimeout(t)
  }, [])

  return <MarbimMark state={state} size={size} label={label} />
}

/**
 * Settles a resolved mark back to rest.
 *
 * The overshoot lands at 440ms, so the mark holds briefly and then returns to
 * Rest on its own — timing the calling screen should not have to own. Every
 * other state is passed straight through, because only the caller knows whether
 * a request is in flight.
 */
export function useMarkLifecycle(phase: MarkState): MarkState {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (phase !== 'resolved') return
    const t = setTimeout(() => setSettled(true), 900)
    return () => {
      clearTimeout(t)
      setSettled(false)
    }
  }, [phase])

  return phase === 'resolved' && settled ? 'rest' : phase
}
