import type { InkStroke } from '../types'
import { newId } from './id'

function segmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  let t = 0
  if (lenSq > 0) {
    t = ((px - ax) * abx + (py - ay) * aby) / lenSq
    t = Math.max(0, Math.min(1, t))
  }
  const dx = px - (ax + t * abx)
  const dy = py - (ay + t * aby)
  return dx * dx + dy * dy
}

/**
 * Partial erase: removes the parts of every stroke within `radius` of (x, y)
 * and splits the survivors into separate strokes, GoodNotes-style. All units
 * are logical. Returns the new strokes array, or null when nothing was hit.
 */
export function eraseStrokesAt(
  strokes: InkStroke[],
  x: number,
  y: number,
  radius: number,
): InkStroke[] | null {
  let changed = false
  const result: InkStroke[] = []

  for (const stroke of strokes) {
    const reach = radius + stroke.size / 2
    const reachSq = reach * reach
    const pts = stroke.points
    const count = Math.floor(pts.length / 3)

    let anyHit = false
    const pointHit: boolean[] = new Array(count)
    for (let i = 0; i < count; i++) {
      const dx = x - pts[i * 3]
      const dy = y - pts[i * 3 + 1]
      pointHit[i] = dx * dx + dy * dy <= reachSq
      if (pointHit[i]) anyHit = true
    }

    // Fast strokes leave sparse samples: the eraser can cross a segment
    // without touching either endpoint, so segments get their own check.
    const segmentHit: boolean[] = new Array(Math.max(0, count - 1))
    for (let i = 0; i < count - 1; i++) {
      segmentHit[i] =
        !pointHit[i] &&
        !pointHit[i + 1] &&
        segmentDistanceSq(x, y, pts[i * 3], pts[i * 3 + 1], pts[(i + 1) * 3], pts[(i + 1) * 3 + 1]) <=
          reachSq
      if (segmentHit[i]) anyHit = true
    }

    if (!anyHit) {
      result.push(stroke)
      continue
    }

    changed = true
    let run: number[] = []
    const flush = () => {
      if (run.length >= 6) result.push({ ...stroke, id: newId(), points: run })
      run = []
    }
    for (let i = 0; i < count; i++) {
      if (pointHit[i]) {
        flush()
        continue
      }
      run.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
      if (i < count - 1 && segmentHit[i]) flush()
    }
    flush()
  }

  return changed ? result : null
}
