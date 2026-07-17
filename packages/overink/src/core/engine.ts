import type { InkDocument, InkStroke, InkTool, PaperKind, PointerKind, StrokeTool } from '../types'
import { createInkDocument } from '../document'
import { HIGHLIGHTER_OPACITY, outlineToPathData, strokeOutline } from './outline'
import { strokesHitByEraser } from './hit'
import { History } from './history'

export interface InkEngineOptions {
  document?: InkDocument
  tool?: InkTool
  color?: string
  size?: number
  pointers?: PointerKind[]
  readOnly?: boolean
  /** Eraser reach in CSS pixels. */
  eraserRadius?: number
  onChange?: (doc: InkDocument) => void
}

const LIVE_STROKE_ID = '__live__'

function newStrokeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Framework-agnostic ink surface. Mounts two stacked canvases inside a
 * positioned container: a base canvas with committed strokes and a "wet"
 * canvas that only ever repaints the stroke currently being drawn.
 */
export class InkEngine {
  private container: HTMLElement
  private base: HTMLCanvasElement
  private wet: HTMLCanvasElement
  private baseCtx: CanvasRenderingContext2D
  private wetCtx: CanvasRenderingContext2D
  private resizeObserver: ResizeObserver
  private history = new History()

  private doc: InkDocument
  private tool: InkTool
  private color: string
  private size: number
  private pointers: Set<PointerKind>
  private readOnly: boolean
  private eraserRadius: number
  private onChange?: (doc: InkDocument) => void

  private scale = 1
  private dpr = 1
  private cssWidth = 0
  private cssHeight = 0

  private activePointer: number | null = null
  private livePoints: number[] = []
  private erasing = false
  private erasedSomething = false
  private frame: number | null = null
  private destroyed = false

  constructor(container: HTMLElement, options: InkEngineOptions = {}) {
    this.container = container
    this.doc = options.document ?? createInkDocument()
    this.tool = options.tool ?? 'pen'
    this.color = options.color ?? '#1d1d28'
    this.size = options.size ?? 4
    this.pointers = new Set(options.pointers ?? ['pen', 'mouse'])
    this.readOnly = options.readOnly ?? false
    this.eraserRadius = options.eraserRadius ?? 12
    this.onChange = options.onChange

    this.base = this.createCanvas('1')
    this.wet = this.createCanvas('2')
    this.baseCtx = this.base.getContext('2d') as CanvasRenderingContext2D
    this.wetCtx = this.wet.getContext('2d', {
      desynchronized: true,
    }) as CanvasRenderingContext2D

    container.appendChild(this.base)
    container.appendChild(this.wet)

    this.wet.addEventListener('pointerdown', this.onPointerDown)
    this.wet.addEventListener('pointermove', this.onPointerMove)
    this.wet.addEventListener('pointerup', this.onPointerUp)
    this.wet.addEventListener('pointercancel', this.onPointerCancel)

    this.applyInteractivity()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  private createCanvas(zIndex: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = zIndex
    canvas.style.userSelect = 'none'
    canvas.style.webkitUserSelect = 'none'
    return canvas
  }

  private applyInteractivity(): void {
    const active = !this.readOnly && this.tool !== 'none'
    this.base.style.pointerEvents = 'none'
    this.wet.style.pointerEvents = active ? 'auto' : 'none'
    // Fingers keep scrolling the page natively unless touch is a drawing pointer.
    this.wet.style.touchAction = this.pointers.has('touch') ? 'none' : 'pan-x pan-y'
    this.wet.style.cursor = !active ? 'default' : this.tool === 'eraser' ? 'cell' : 'crosshair'
  }

  private resize(): void {
    if (this.destroyed) return
    const rect = this.container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    this.cssWidth = rect.width
    this.cssHeight = rect.height
    this.dpr = window.devicePixelRatio || 1
    this.scale = rect.width / this.doc.width
    for (const canvas of [this.base, this.wet]) {
      canvas.width = Math.round(rect.width * this.dpr)
      canvas.height = Math.round(rect.height * this.dpr)
    }
    this.repaint()
  }

  private repaint(): void {
    const ctx = this.baseCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.base.width, this.base.height)
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0)
    for (const stroke of this.doc.strokes) this.drawStroke(ctx, stroke)
  }

  private drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, last = true): void {
    const outline = strokeOutline(stroke, { last })
    if (outline.length === 0) return
    const path = new Path2D(outlineToPathData(outline))
    ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
    ctx.fillStyle = stroke.color
    ctx.fill(path)
    ctx.globalAlpha = 1
  }

  private accepts(e: PointerEvent): boolean {
    return this.pointers.has(e.pointerType as PointerKind)
  }

  private pushPoint(e: PointerEvent, rect: DOMRect): void {
    const x = (e.clientX - rect.left) / this.scale
    const y = (e.clientY - rect.top) / this.scale
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    this.livePoints.push(x, y, pressure)
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.readOnly || this.tool === 'none') return
    if (!this.accepts(e)) return
    if (this.activePointer !== null) return
    e.preventDefault()
    this.activePointer = e.pointerId
    try {
      this.wet.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events have no active pointer to capture.
    }
    if (this.tool === 'eraser') {
      this.erasing = true
      this.erasedSomething = false
      this.eraseAt(e)
      return
    }
    this.livePoints = []
    this.pushPoint(e, this.wet.getBoundingClientRect())
    this.scheduleWetFrame()
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return
    e.preventDefault()
    if (this.erasing) {
      this.eraseAt(e)
      return
    }
    const rect = this.wet.getBoundingClientRect()
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    if (coalesced.length > 0) {
      for (const sample of coalesced) this.pushPoint(sample, rect)
    } else {
      this.pushPoint(e, rect)
    }
    this.scheduleWetFrame()
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return
    this.activePointer = null
    try {
      this.wet.releasePointerCapture(e.pointerId)
    } catch {
      // Nothing captured for synthetic events.
    }
    if (this.erasing) {
      this.erasing = false
      if (this.erasedSomething) {
        this.erasedSomething = false
        this.emitChange()
      }
      return
    }
    this.commitLiveStroke()
  }

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return
    this.activePointer = null
    this.livePoints = []
    this.erasing = false
    this.clearWet()
    if (this.erasedSomething) {
      this.erasedSomething = false
      this.emitChange()
    }
  }

  private eraseAt(e: PointerEvent): void {
    const rect = this.wet.getBoundingClientRect()
    const x = (e.clientX - rect.left) / this.scale
    const y = (e.clientY - rect.top) / this.scale
    const hit = strokesHitByEraser(this.doc.strokes, x, y, this.eraserRadius / this.scale)
    if (hit.size === 0) return
    if (!this.erasedSomething) {
      this.history.record(this.doc.strokes)
      this.erasedSomething = true
    }
    this.doc = { ...this.doc, strokes: this.doc.strokes.filter(s => !hit.has(s.id)) }
    this.repaint()
  }

  private scheduleWetFrame(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.paintWet()
    })
  }

  private clearWet(): void {
    this.wetCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.wetCtx.clearRect(0, 0, this.wet.width, this.wet.height)
  }

  private paintWet(): void {
    if (this.livePoints.length === 0) return
    this.clearWet()
    this.wetCtx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0)
    this.drawStroke(this.wetCtx, this.liveStroke(), false)
  }

  private liveStroke(): InkStroke {
    const tool: StrokeTool = this.tool === 'highlighter' ? 'highlighter' : 'pen'
    return {
      id: LIVE_STROKE_ID,
      tool,
      color: this.color,
      size: this.size,
      points: this.livePoints,
    }
  }

  private commitLiveStroke(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame)
      this.frame = null
    }
    this.clearWet()
    if (this.livePoints.length < 3) {
      this.livePoints = []
      return
    }
    const stroke: InkStroke = { ...this.liveStroke(), id: newStrokeId() }
    this.livePoints = []
    this.history.record(this.doc.strokes)
    this.doc = {
      ...this.doc,
      height: Math.max(this.doc.height, Math.round(this.cssHeight / this.scale)),
      strokes: [...this.doc.strokes, stroke],
    }
    this.drawStroke(this.baseCtx, stroke)
    this.emitChange()
  }

  private emitChange(): void {
    this.onChange?.(this.doc)
  }

  getDocument(): InkDocument {
    return this.doc
  }

  setDocument(doc: InkDocument): void {
    if (doc === this.doc) return
    this.doc = doc
    this.history.clear()
    if (this.cssWidth > 0) this.scale = this.cssWidth / doc.width
    this.repaint()
  }

  setTool(tool: InkTool): void {
    this.tool = tool
    this.applyInteractivity()
  }

  setColor(color: string): void {
    this.color = color
  }

  setSize(size: number): void {
    this.size = size
  }

  setPointers(pointers: PointerKind[]): void {
    this.pointers = new Set(pointers)
    this.applyInteractivity()
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly
    this.applyInteractivity()
  }

  setBackground(background: PaperKind): void {
    if (background === this.doc.background) return
    this.doc = { ...this.doc, background }
    this.emitChange()
  }

  setOnChange(onChange: ((doc: InkDocument) => void) | undefined): void {
    this.onChange = onChange
  }

  undo(): void {
    const strokes = this.history.undo(this.doc.strokes)
    if (!strokes) return
    this.doc = { ...this.doc, strokes }
    this.repaint()
    this.emitChange()
  }

  redo(): void {
    const strokes = this.history.redo(this.doc.strokes)
    if (!strokes) return
    this.doc = { ...this.doc, strokes }
    this.repaint()
    this.emitChange()
  }

  clear(): void {
    if (this.doc.strokes.length === 0) return
    this.history.record(this.doc.strokes)
    this.doc = { ...this.doc, strokes: [] }
    this.repaint()
    this.emitChange()
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  destroy(): void {
    this.destroyed = true
    this.resizeObserver.disconnect()
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.wet.removeEventListener('pointerdown', this.onPointerDown)
    this.wet.removeEventListener('pointermove', this.onPointerMove)
    this.wet.removeEventListener('pointerup', this.onPointerUp)
    this.wet.removeEventListener('pointercancel', this.onPointerCancel)
    this.base.remove()
    this.wet.remove()
  }
}
