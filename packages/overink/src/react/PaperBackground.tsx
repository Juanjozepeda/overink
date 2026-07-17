import type { CSSProperties } from 'react'
import type { PaperKind } from '../types'

export interface PaperBackgroundProps {
  kind: PaperKind
  /** Distance between lines in CSS pixels. */
  spacing?: number
  lineColor?: string
  className?: string
  style?: CSSProperties
}

/**
 * Ruled or grid paper. Mount it under your editor (first child of the same
 * positioned container) so the lines sit behind the text, not over it.
 */
export function PaperBackground({
  kind,
  spacing = 32,
  lineColor = 'rgba(15, 23, 42, 0.1)',
  className,
  style,
}: PaperBackgroundProps) {
  const layer = `${lineColor} 0 1px, transparent 1px ${spacing}px`
  const backgroundImage =
    kind === 'lines'
      ? `repeating-linear-gradient(to bottom, ${layer})`
      : kind === 'grid'
        ? `repeating-linear-gradient(to bottom, ${layer}), repeating-linear-gradient(to right, ${layer})`
        : undefined
  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage, ...style }}
    />
  )
}
