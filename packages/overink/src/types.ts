export type StrokeTool = 'pen' | 'highlighter'

export type InkTool = StrokeTool | 'eraser' | 'none'

export type PaperKind = 'plain' | 'lines' | 'grid'

export type PointerKind = 'pen' | 'mouse' | 'touch'

export interface InkStroke {
  id: string
  tool: StrokeTool
  color: string
  /** Stroke diameter in logical page units. */
  size: number
  /** Flat triplets [x, y, pressure, x, y, pressure, ...] in logical page coordinates. */
  points: number[]
}

export interface InkDocument {
  version: 1
  /** Width of the logical coordinate space. Rendering scales it to the container width. */
  width: number
  height: number
  background: PaperKind
  strokes: InkStroke[]
}
