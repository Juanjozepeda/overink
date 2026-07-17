import type { InkStroke } from '../types'

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

/** Ids of strokes whose path passes within `radius` of (x, y), all in logical units. */
export function strokesHitByEraser(
  strokes: InkStroke[],
  x: number,
  y: number,
  radius: number,
): Set<string> {
  const hit = new Set<string>()
  for (const stroke of strokes) {
    const reach = radius + stroke.size / 2
    const reachSq = reach * reach
    const pts = stroke.points
    if (pts.length >= 3 && pts.length < 6) {
      const dx = x - pts[0]
      const dy = y - pts[1]
      if (dx * dx + dy * dy <= reachSq) hit.add(stroke.id)
      continue
    }
    for (let i = 0; i + 5 < pts.length; i += 3) {
      if (segmentDistanceSq(x, y, pts[i], pts[i + 1], pts[i + 3], pts[i + 4]) <= reachSq) {
        hit.add(stroke.id)
        break
      }
    }
  }
  return hit
}
