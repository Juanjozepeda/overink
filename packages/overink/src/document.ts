import type { InkDocument, PaperKind } from './types'

/** A4 portrait at 96 dpi. */
export const DEFAULT_PAGE_WIDTH = 794
export const DEFAULT_PAGE_HEIGHT = 1123

export interface CreateInkDocumentOptions {
  width?: number
  height?: number
  background?: PaperKind
}

export function createInkDocument(options: CreateInkDocumentOptions = {}): InkDocument {
  return {
    version: 1,
    width: options.width ?? DEFAULT_PAGE_WIDTH,
    height: options.height ?? DEFAULT_PAGE_HEIGHT,
    background: options.background ?? 'plain',
    strokes: [],
  }
}
