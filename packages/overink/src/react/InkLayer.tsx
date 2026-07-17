import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from 'react'
import { InkEngine } from '../core/engine'
import { createInkDocument } from '../document'
import type { InkDocument, InkTool, PointerKind } from '../types'

export interface InkLayerProps {
  /** Controlled document. Pass the object received from onChange back unchanged. */
  value?: InkDocument
  /** Initial document for uncontrolled usage. */
  defaultValue?: InkDocument
  onChange?: (doc: InkDocument) => void
  tool?: InkTool
  color?: string
  size?: number
  /** Pointer types allowed to draw. Fingers scroll unless 'touch' is included. */
  pointers?: PointerKind[]
  readOnly?: boolean
  /** Eraser reach in CSS pixels. */
  eraserRadius?: number
  className?: string
  style?: CSSProperties
}

export interface InkLayerHandle {
  undo(): void
  redo(): void
  clear(): void
  canUndo(): boolean
  canRedo(): boolean
  getDocument(): InkDocument | null
}

export const InkLayer = forwardRef<InkLayerHandle, InkLayerProps>(function InkLayer(props, ref) {
  const {
    value,
    defaultValue,
    onChange,
    tool = 'pen',
    color = '#1d1d28',
    size = 4,
    pointers,
    readOnly = false,
    eraserRadius,
    className,
    style,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<InkEngine | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const engine = new InkEngine(container, {
      document: value ?? defaultValue ?? createInkDocument(),
      tool,
      color,
      size,
      pointers,
      readOnly,
      eraserRadius,
      onChange: doc => onChangeRef.current?.(doc),
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // The engine mounts once; prop updates flow through the setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (value) engineRef.current?.setDocument(value)
  }, [value])
  useEffect(() => {
    engineRef.current?.setTool(tool)
  }, [tool])
  useEffect(() => {
    engineRef.current?.setColor(color)
  }, [color])
  useEffect(() => {
    engineRef.current?.setSize(size)
  }, [size])
  useEffect(() => {
    if (pointers) engineRef.current?.setPointers(pointers)
  }, [pointers])
  useEffect(() => {
    if (eraserRadius !== undefined) engineRef.current?.setEraserRadius(eraserRadius)
  }, [eraserRadius])
  useEffect(() => {
    engineRef.current?.setReadOnly(readOnly)
  }, [readOnly])

  useImperativeHandle(ref, () => ({
    undo: () => engineRef.current?.undo(),
    redo: () => engineRef.current?.redo(),
    clear: () => engineRef.current?.clear(),
    canUndo: () => engineRef.current?.canUndo ?? false,
    canRedo: () => engineRef.current?.canRedo ?? false,
    getDocument: () => engineRef.current?.getDocument() ?? null,
  }))

  return (
    <div
      ref={containerRef}
      className={className}
      data-overink=""
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', ...style }}
    />
  )
})
