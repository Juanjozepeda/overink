# overink

A pressure-sensitive vector ink layer you can mount on top of any editor. Write with an Apple Pencil over TipTap, ProseMirror, a plain `contentEditable`, or anything else that renders inside a box.

**[Live demo](https://overink.vercel.app)** · `npm i overink`

## Why

Most web drawing libraries own the whole surface. overink is deliberately a *layer*: it renders two transparent canvases above your existing content and stays out of the way. Handwriting and typing share the same page.

- **Vectors, not pixels.** Strokes are stored as points with pressure in plain JSON. They scale without blurring, weigh almost nothing, export crisply to SVG or PDF, and survive offline sync as a regular JSON field.
- **Real pen input.** Apple Pencil pressure is captured as-is; mouse strokes get velocity-based width via [perfect-freehand](https://github.com/steveruizok/perfect-freehand).
- **Palm rejection.** Only the pointer types you allow can draw (`pen` and `mouse` by default). Fingers keep scrolling the page natively.
- **Low latency.** `getCoalescedEvents()` captures every pen sample between frames, and the in-progress stroke paints on a dedicated "wet ink" canvas so committed strokes are never repainted per frame.
- **Tools.** Pen, highlighter, stroke eraser, undo/redo, and plain / ruled / grid paper backgrounds.
- **Framework-agnostic core.** The engine is plain TypeScript with zero dependencies beyond perfect-freehand. React bindings ship in `overink/react`; React itself is an optional peer dependency.

## Quick start (React)

```tsx
'use client'

import { useState } from 'react'
import { InkLayer, PaperBackground, createInkDocument } from 'overink/react'

export function Page() {
  const [doc, setDoc] = useState(() => createInkDocument({ background: 'lines' }))

  return (
    <div style={{ position: 'relative' }}>
      <PaperBackground kind={doc.background} />
      <MyEditor />
      <InkLayer value={doc} onChange={setDoc} tool="pen" color="#7c3aed" size={4} />
    </div>
  )
}
```

The host container just needs `position: relative`. The layer fills it, draws above the editor, and passes every event through when `tool="none"`.

## Quick start (vanilla)

```ts
import { InkEngine, createInkDocument } from 'overink'

const engine = new InkEngine(document.querySelector('#page'), {
  document: createInkDocument(),
  tool: 'pen',
  color: '#1d1d28',
  onChange: doc => save(doc),
})

engine.setTool('highlighter')
engine.undo()
engine.destroy()
```

## Data format

One page of ink is one JSON document:

```json
{
  "version": 1,
  "width": 794,
  "height": 1123,
  "background": "lines",
  "strokes": [
    {
      "id": "7d9c…",
      "tool": "pen",
      "color": "#7c3aed",
      "size": 4,
      "points": [112.5, 208.1, 0.62, 114.9, 209.3, 0.71]
    }
  ]
}
```

Design decisions behind it:

- `points` is a flat array of `[x, y, pressure]` triplets. It weighs roughly a third of an equivalent array of objects, which matters when documents travel through IndexedDB and network sync on every save.
- Coordinates live in a **logical space** anchored to `width` (794 = A4 at 96 dpi by default). The layer scales everything by `containerWidth / width`, so ink zooms with the page and is independent of `devicePixelRatio`.
- Raw input points are the source of truth, never the rendered outline. Rendering (smoothing, thinning, caps) is derived at draw time, so the same JSON can be re-rendered later by a native app (for example with PencilKit) without format changes.
- Erasing removes strokes from the array; there are no eraser strokes. The highlighter stores only `tool` and `color`; opacity and blending are rendering concerns.
- `version` exists so the format can migrate without guesswork.

## API

### `<InkLayer />` (from `overink/react`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `InkDocument` | | Controlled document. Pass the object from `onChange` back unchanged. |
| `defaultValue` | `InkDocument` | `createInkDocument()` | Initial document for uncontrolled usage. |
| `onChange` | `(doc: InkDocument) => void` | | Fires when a stroke is committed, erased, undone, redone, or cleared. Never per point. |
| `tool` | `'pen' \| 'highlighter' \| 'eraser' \| 'none'` | `'pen'` | `'none'` sets `pointer-events: none` on the canvas so every click and keystroke reaches the editor below. |
| `color` | `string` | `'#1d1d28'` | Stroke color. |
| `size` | `number` | `4` | Stroke diameter in logical units. |
| `pointers` | `('pen' \| 'mouse' \| 'touch')[]` | `['pen', 'mouse']` | Pointer types allowed to draw. Fingers scroll unless `'touch'` is included. |
| `readOnly` | `boolean` | `false` | Render strokes but ignore input. |
| `eraserRadius` | `number` | `12` | Eraser reach in CSS pixels. |

A ref exposes `undo()`, `redo()`, `clear()`, `canUndo()`, `canRedo()`, and `getDocument()`.

### `<PaperBackground />`

Ruled or grid paper as pure CSS. Mount it *under* your editor (first child of the same container) so lines sit behind the text. Props: `kind`, `spacing`, `lineColor`.

### `InkEngine` (from `overink`)

The core class behind `InkLayer`. Constructor takes the container element and options (same names as the React props, plus `document`). Methods: `setDocument`, `getDocument`, `setTool`, `setColor`, `setSize`, `setPointers`, `setReadOnly`, `setBackground`, `undo`, `redo`, `clear`, `destroy`, and the `canUndo` / `canRedo` getters.

### `toSVG(doc)`

Renders a document to a standalone SVG string. Useful for crisp PDF export: overlay the SVG on your page render instead of rasterizing a canvas.

## How the overlay works

```
┌ position: relative ────────────┐
│  <PaperBackground/>   z: back  │
│  <YourEditor/>                 │
│  <InkLayer/>          z: front │
│    ├─ base canvas  (committed) │
│    └─ wet canvas   (live)      │
└────────────────────────────────┘
```

The wet canvas is the only surface repainted while you draw, using a `desynchronized` 2D context and coalesced pointer samples per animation frame. On pointer up the stroke is committed to the base canvas and emitted through `onChange`. A `ResizeObserver` keeps both canvases sized to the container as your editor grows.

## Development

This repo is an npm workspace: the package lives in [`packages/overink`](packages/overink), the demo in [`playground`](playground).

```bash
npm install
npm run dev      # builds the package, then starts the playground on :3000
npm run build    # builds package + playground
```

## License

MIT © Juan José Zepeda
