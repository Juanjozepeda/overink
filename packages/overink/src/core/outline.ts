import { getStroke } from 'perfect-freehand'
import type { InkStroke } from '../types'

export const HIGHLIGHTER_OPACITY = 0.35

const NEUTRAL_PRESSURE = 0.5

function toTriplets(points: number[]): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i + 2 < points.length; i += 3) {
    out.push([points[i], points[i + 1], points[i + 2]])
  }
  return out
}

export function strokeOutline(stroke: InkStroke, options: { last?: boolean } = {}): number[][] {
  const points = toTriplets(stroke.points)
  if (points.length === 0) return []
  // Mouse and touch strokes store a flat 0.5 pressure; let perfect-freehand
  // derive width from velocity for those. Real pen pressure is used as-is.
  const uniformPressure = points.every(p => p[2] === NEUTRAL_PRESSURE)
  if (stroke.tool === 'highlighter') {
    return getStroke(points, {
      size: stroke.size,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
      last: options.last ?? true,
    })
  }
  return getStroke(points, {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: uniformPressure,
    last: options.last ?? true,
  })
}

export function outlineToPathData(outline: number[][]): string {
  const len = outline.length
  if (len === 0) return ''
  if (len < 4) {
    let d = `M${outline[0][0].toFixed(2)},${outline[0][1].toFixed(2)}`
    for (let i = 1; i < len; i++) d += `L${outline[i][0].toFixed(2)},${outline[i][1].toFixed(2)}`
    return d + 'Z'
  }
  const avg = (a: number, b: number) => (a + b) / 2
  let a = outline[0]
  let b = outline[1]
  const c = outline[2]
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(
    b[0],
    c[0],
  ).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`
  for (let i = 2, max = len - 1; i < max; i++) {
    a = outline[i]
    b = outline[i + 1]
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `
  }
  return d + 'Z'
}
