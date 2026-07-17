import type { InkDocument } from './types'
import { HIGHLIGHTER_OPACITY, outlineToPathData, strokeOutline } from './core/outline'

/** Renders the document to a standalone SVG string. Handy for crisp PDF export. */
export function toSVG(doc: InkDocument): string {
  const paths = doc.strokes
    .map(stroke => {
      const outline = strokeOutline(stroke)
      if (outline.length === 0) return ''
      const opacity = stroke.tool === 'highlighter' ? ` fill-opacity="${HIGHLIGHTER_OPACITY}"` : ''
      return `<path d="${outlineToPathData(outline)}" fill="${stroke.color}"${opacity}/>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" ` +
    `width="${doc.width}" height="${doc.height}">${paths}</svg>`
  )
}
