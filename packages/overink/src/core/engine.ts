import type { InkDocument, InkStroke, InkTool, PaperKind, PointerKind, StrokeTool } from '../types'
import { createInkDocument } from '../document'
import { HIGHLIGHTER_OPACITY, outlineToPathData, strokeOutline } from './outline'
import { eraseStrokesAt } from './hit'
import { History } from './history'
import { newId } from './id'

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
  private lastErase: [number, number] | null = null
  private eraserCursor: [number, number] | null = null
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
    this.wet.addEventListener('pointerleave', this.onPointerLeave)
    this.wet.addEventListener('touchstart', this.onTouch, { passive: false })
    this.wet.addEventListener('touchmove', this.onTouch, { passive: false })

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
    // The eraser hides the native cursor: the ring on the wet canvas replaces it.
    this.wet.style.cursor = !active ? 'default' : this.tool === 'eraser' ? 'none' : 'crosshair'
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

  private onTouch = (e: TouchEvent): void => {
    if (this.readOnly || this.tool === 'none') return
    // touch-action: none already blocks pans when touch drawing is enabled.
    if (this.pointers.has('touch')) return
    if (!this.pointers.has('pen')) return
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i] as Touch & { touchType?: 'stylus' | 'direct' }
      if (touch.touchType === 'stylus') {
        // iOS Safari otherwise claims the Pencil drag as a scroll pan and
        // fires pointercancel mid-stroke. Fingers stay scrollable.
        e.preventDefault()
        return
      }
    }
  }

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointer) return
    if (this.eraserCursor) {
      this.eraserCursor = null
      this.scheduleWetFrame()
    }
  }

  private updateEraserCursor(e: PointerEvent): void {
    const rect = this.wet.getBoundingClientRect()
    this.eraserCursor = [(e.clientX - rect.left) / this.scale, (e.clientY - rect.top) / this.scale]
    this.scheduleWetFrame()
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
      this.lastErase = null
      this.updateEraserCursor(e)
      this.eraseAt(e)
      return
    }
    this.livePoints = []
    this.pushPoint(e, this.wet.getBoundingClientRect())
    this.scheduleWetFrame()
  }

  private onPointerMove = (e: PointerEvent): void => {
    // Hover: the eraser ring follows the pointer even before pressing.
    if (this.tool === 'eraser' && !this.readOnly && this.accepts(e)) {
      this.updateEraserCursor(e)
    }
    if (e.pointerId !== this.activePointer) return
    e.preventDefault()
    if (this.erasing) {
      this.eraseAt(e)
      return
    }
    const rect = this.wet.getBoundingClientRect()
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const samples = coalesced.length > 0 ? coalesced : [e]
    for (const sample of samples) {
      // Pointer capture keeps streaming events past the page edge; ink stops
      // at the boundary and the stroke ends there.
      if (
        sample.clientX < rect.left ||
        sample.clientX > rect.right ||
        sample.clientY < rect.top ||
        sample.clientY > rect.bottom
      ) {
        this.activePointer = null
        try {
          this.wet.releasePointerCapture(e.pointerId)
        } catch {
          // Nothing captured for synthetic events.
        }
        this.commitLiveStroke()
        return
      }
      this.pushPoint(sample, rect)
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
      this.lastErase = null
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
    if (this.erasing) {
      this.erasing = false
      this.lastErase = null
      if (this.erasedSomething) {
        this.erasedSomething = false
        this.emitChange()
      }
      return
    }
    // Commit whatever was drawn: a cancelled pointer must never eat ink.
    this.commitLiveStroke()
  }

  private eraseAt(e: PointerEvent): void {
    const rect = this.wet.getBoundingClientRect()
    const x = (e.clientX - rect.left) / this.scale
    const y = (e.clientY - rect.top) / this.scale
    const radius = this.eraserRadius / this.scale

    // Fast swipes can jump many pixels between events; erase along the
    // travelled segment so no ink is skipped.
    let strokes: InkStroke[] | null = null
    let current = this.doc.strokes
    const from = this.lastErase
    this.lastErase = [x, y]
    if (from) {
      const dist = Math.hypot(x - from[0], y - from[1])
      const steps = Math.floor(dist / Math.max(radius, 1))
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1)
        const next = eraseStrokesAt(current, from[0] + (x - from[0]) * t, from[1] + (y - from[1]) * t, radius)
        if (next) {
          current = next
          strokes = next
        }
      }
    }
    const next = eraseStrokesAt(current, x, y, radius)
    if (next) strokes = next

    if (!strokes) return
    if (!this.erasedSomething) {
      this.history.record(this.doc.strokes)
      this.erasedSomething = true
    }
    this.doc = { ...this.doc, strokes }
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
    this.clearWet()
    const ctx = this.wetCtx
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0)
    if (this.livePoints.length > 0) {
      this.drawStroke(ctx, this.liveStroke(), false)
    }
    if (this.tool === 'eraser' && this.eraserCursor) {
      this.drawEraserCursor(ctx)
    }
  }

  private drawEraserCursor(ctx: CanvasRenderingContext2D): void {
    const [x, y] = this.eraserCursor as [number, number]
    const radius = this.eraserRadius / this.scale
    const hairline = 1.5 / this.scale
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(124, 124, 140, 0.15)'
    ctx.fill()
    ctx.lineWidth = hairline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, radius + hairline, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(40, 40, 55, 0.75)'
    ctx.stroke()
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
    const stroke: InkStroke = { ...this.liveStroke(), id: newId() }
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
    if (tool !== 'eraser' && this.eraserCursor) {
      this.eraserCursor = null
      this.scheduleWetFrame()
    }
    this.applyInteractivity()
  }

  setEraserRadius(radius: number): void {
    this.eraserRadius = radius
    if (this.eraserCursor) this.scheduleWetFrame()
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
    this.wet.removeEventListener('pointerleave', this.onPointerLeave)
    this.wet.removeEventListener('touchstart', this.onTouch)
    this.wet.removeEventListener('touchmove', this.onTouch)
    this.base.remove()
    this.wet.remove()
  }
}
