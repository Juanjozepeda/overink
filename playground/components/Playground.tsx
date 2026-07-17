'use client'

import { useMemo, useRef, useState } from 'react'
import {
  InkLayer,
  PaperBackground,
  createInkDocument,
  toSVG,
  type InkDocument,
  type InkLayerHandle,
  type InkTool,
  type PaperKind,
  type PointerKind,
} from 'overink/react'

const INK_COLORS = ['#1d1d28', '#7c3aed', '#2563eb', '#dc2626', '#0d9488', '#f59e0b']

const TOOLS: { id: InkTool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'highlighter', label: 'Highlighter' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'none', label: 'Type' },
]

const PAPERS: { id: PaperKind; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'lines', label: 'Lines' },
  { id: 'grid', label: 'Grid' },
]

export function Playground() {
  const inkRef = useRef<InkLayerHandle>(null)
  const [doc, setDoc] = useState<InkDocument>(() => createInkDocument({ background: 'lines' }))
  const [tool, setTool] = useState<InkTool>('pen')
  const [color, setColor] = useState(INK_COLORS[1])
  const [sizes, setSizes] = useState({ pen: 4, highlighter: 16 })
  const [fingerDraws, setFingerDraws] = useState(false)

  const strokeTool = tool === 'highlighter' ? 'highlighter' : 'pen'
  const size = sizes[strokeTool]
  const pointers = useMemo<PointerKind[]>(
    () => (fingerDraws ? ['pen', 'mouse', 'touch'] : ['pen', 'mouse']),
    [fingerDraws],
  )

  const stats = useMemo(() => {
    const points = doc.strokes.reduce((n, s) => n + s.points.length / 3, 0)
    const bytes = JSON.stringify(doc).length
    return { strokes: doc.strokes.length, points: Math.round(points), kb: (bytes / 1024).toFixed(1) }
  }, [doc])

  const preview = useMemo(
    () =>
      JSON.stringify(
        doc,
        (key, value) =>
          key === 'points' && Array.isArray(value)
            ? `[${value.length / 3} × (x, y, pressure)]`
            : value,
        2,
      ),
    [doc],
  )

  const setBackground = (background: PaperKind) => {
    setDoc(current => ({ ...current, background }))
  }

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(doc))
  }

  const downloadSvg = () => {
    const blob = new Blob([toSVG(doc)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'overink.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  const canUndo = inkRef.current?.canUndo() ?? false
  const canRedo = inkRef.current?.canRedo() ?? false

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#7c3aed" />
            <path d="M9 23c3-9 8-13 14-14-1 6-5 11-14 14z" fill="#fff" />
          </svg>
          <span>overink</span>
        </div>
        <p className="tagline">
          A pressure-sensitive vector ink layer you can mount on top of any editor.
        </p>
        <div className="topbar-actions">
          <code className="install">npm i overink</code>
          <a href="https://github.com/Juanjozepeda/overink" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      <section className="toolbar" aria-label="Ink tools">
        <div className="group" role="group" aria-label="Tool">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? 'chip active' : 'chip'}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="group" role="group" aria-label="Color">
          {INK_COLORS.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`Ink color ${c}`}
              className={color === c ? 'swatch active' : 'swatch'}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <label className="group slider">
          <span>Size</span>
          <input
            type="range"
            min={2}
            max={24}
            value={size}
            onChange={e => setSizes({ ...sizes, [strokeTool]: Number(e.target.value) })}
          />
          <span className="mono">{size}</span>
        </label>

        <div className="group" role="group" aria-label="Paper">
          {PAPERS.map(p => (
            <button
              key={p.id}
              type="button"
              className={doc.background === p.id ? 'chip active' : 'chip'}
              onClick={() => setBackground(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="group" role="group" aria-label="History">
          <button type="button" className="chip" disabled={!canUndo} onClick={() => inkRef.current?.undo()}>
            Undo
          </button>
          <button type="button" className="chip" disabled={!canRedo} onClick={() => inkRef.current?.redo()}>
            Redo
          </button>
          <button
            type="button"
            className="chip"
            disabled={doc.strokes.length === 0}
            onClick={() => inkRef.current?.clear()}
          >
            Clear
          </button>
        </div>

        <label className="group check">
          <input
            type="checkbox"
            checked={fingerDraws}
            onChange={e => setFingerDraws(e.target.checked)}
          />
          <span>Finger draws</span>
        </label>
      </section>

      <section className="stage">
        <div className="paper-wrap">
          <div className="paper">
            <PaperBackground kind={doc.background} spacing={32} />
            <div className="editor" contentEditable suppressContentEditableWarning spellCheck={false}>
              <h2>Class notes: wave optics</h2>
              <p>
                This text lives in a plain contentEditable region. The ink you draw sits on a
                canvas layered above it, so handwriting and typing share the same page. Switch to
                the Type tool and the canvas lets every click through.
              </p>
              <p>
                On an iPad, the Apple Pencil draws with real pressure while your palm and fingers
                scroll the page. On a desktop, draw with the mouse.
              </p>
            </div>
            <InkLayer
              ref={inkRef}
              value={doc}
              onChange={setDoc}
              tool={tool}
              color={color}
              size={size}
              pointers={pointers}
            />
          </div>
          <p className="hint">
            Best on iPad with Apple Pencil: pressure and palm rejection are live. Strokes are
            stored as vectors, never pixels.
          </p>
        </div>

        <aside className="inspector">
          <h2>Live document</h2>
          <dl className="stats">
            <div>
              <dt>Strokes</dt>
              <dd className="mono">{stats.strokes}</dd>
            </div>
            <div>
              <dt>Points</dt>
              <dd className="mono">{stats.points}</dd>
            </div>
            <div>
              <dt>JSON size</dt>
              <dd className="mono">{stats.kb} KB</dd>
            </div>
          </dl>
          <pre className="json">{preview}</pre>
          <div className="inspector-actions">
            <button type="button" className="chip" onClick={copyJson}>
              Copy full JSON
            </button>
            <button
              type="button"
              className="chip"
              disabled={doc.strokes.length === 0}
              onClick={downloadSvg}
            >
              Download SVG
            </button>
          </div>
        </aside>
      </section>

      <footer className="footer">
        <span>MIT license</span>
        <span>Smoothing by perfect-freehand</span>
        <a href="https://github.com/Juanjozepeda/overink" target="_blank" rel="noreferrer">
          Star it on GitHub
        </a>
      </footer>
    </main>
  )
}
