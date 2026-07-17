export type {
  InkDocument,
  InkStroke,
  InkTool,
  PaperKind,
  PointerKind,
  StrokeTool,
} from './types'
export {
  createInkDocument,
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  type CreateInkDocumentOptions,
} from './document'
export { InkEngine, type InkEngineOptions } from './core/engine'
export { eraseStrokesAt } from './core/hit'
export { toSVG } from './svg'
