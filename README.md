# overink

[![overink playground](docs/overink.png)](https://overink.vercel.app)

I wanted handwriting in a note-taking app I'm building, and every canvas library I tried wanted to own the whole page. overink doesn't. It's a thin ink layer you drop on top of an editor you already have. Handwriting on one layer, typing on the one below, same page.

Write with an Apple Pencil over TipTap, ProseMirror, a plain `contentEditable`, whatever renders inside a box.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Live demo](https://img.shields.io/badge/demo-overink.vercel.app-7c3aed.svg)](https://overink.vercel.app)

**[Try the demo](https://overink.vercel.app)**

```bash
npm i overink
```

## Why I built it

I'm building Scriva, a school notes app, and it needed Apple Pencil support that felt right on an iPad without shipping a native app. The handwriting layer turned out to have nothing to do with Scriva's accounts or its AI, so I pulled it into its own package and opened it up. What's left is just the ink.

One thing shaped the format: the drawing has to survive offline sync and, one day, move to a native app without a rewrite. So strokes are data, not pixels.

## What you get

- Every stroke is a list of points with pressure, saved as plain JSON. It scales without blurring, weighs almost nothing, exports to a crisp SVG, and rides through IndexedDB and network sync as one more field.
- Apple Pencil pressure goes in untouched. Mouse and touch strokes get their width from velocity via [perfect-freehand](https://github.com/steveruizok/perfect-freehand), tuned to read like a gel pen instead of a crayon.
- You choose which pointer types draw, pen and mouse by default, and fingers keep scrolling. On iPad the Pencil keeps drawing even when Safari wants to treat the drag as a scroll and bail on you.
- `getCoalescedEvents()` grabs every Pencil sample between frames, and the live stroke paints on its own canvas so the committed ink never repaints while you write.
- Pen, highlighter, and an eraser that rubs ink out where it passes and splits the stroke around the gap, the way GoodNotes does it. Undo, redo, and plain, ruled, or grid paper.
- The engine is plain TypeScript and depends on nothing but perfect-freehand. React bindings live in `overink/react`, with React as an optional peer dependency, so a Vue or Svelte wrapper is a small job.

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

Give the container `position: relative` and the layer fills it. It draws above the editor, and when you set `tool="none"` it lets every click and keystroke fall through to whatever sits underneath.

## Quick start (vanilla)

No React? The engine stands on its own.

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

## The data format

One page of ink is one JSON document.

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

A few decisions I'd defend:

- `points` is a flat array of `[x, y, pressure]` triplets, not an array of objects. It comes out around a third of the size, which you feel once a document hits IndexedDB and the network on every save.
- Coordinates live in a logical space anchored to `width` (794 is A4 at 96 dpi by default). The layer scales everything by `containerWidth / width`, so ink zooms with the page and ignores `devicePixelRatio`.
- The raw input points are the source of truth. Smoothing, thinning, and caps get computed at draw time, so the same JSON can render later in a native app (with PencilKit, say) and the format never changes.
- Erasing deletes strokes from the array. There are no eraser strokes to store. The highlighter keeps only its `tool` and `color`; opacity is a rendering detail.
- `version` is there so I can change the format later without guessing what I'm looking at.

## API

### `<InkLayer />` from `overink/react`

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `InkDocument` | | Controlled document. Hand back the object from `onChange` unchanged. |
| `defaultValue` | `InkDocument` | `createInkDocument()` | Starting document when you go uncontrolled. |
| `onChange` | `(doc: InkDocument) => void` | | Fires when a stroke is committed, erased, undone, redone, or cleared. Never per point. |
| `tool` | `'pen' \| 'highlighter' \| 'eraser' \| 'none'` | `'pen'` | `'none'` drops `pointer-events` on the canvas so clicks and keystrokes reach the editor below. |
| `color` | `string` | `'#1d1d28'` | Stroke color. |
| `size` | `number` | `4` | Stroke diameter in logical units. |
| `pointers` | `('pen' \| 'mouse' \| 'touch')[]` | `['pen', 'mouse']` | Which pointer types draw. Leave `'touch'` out and fingers scroll instead. |
| `readOnly` | `boolean` | `false` | Show the ink, ignore input. |
| `eraserRadius` | `number` | `12` | Eraser reach in CSS pixels. |

The ref hands you `undo()`, `redo()`, `clear()`, `canUndo()`, `canRedo()`, and `getDocument()`.

### `<PaperBackground />`

Ruled or grid paper as pure CSS. Mount it under your editor (first child of the same container) so the lines sit behind the text. Props: `kind`, `spacing`, `lineColor`.

### `InkEngine` from `overink`

The class doing the work behind `InkLayer`. Its constructor takes the container element and the same options as the React props, plus `document`. Methods: `setDocument`, `getDocument`, `setTool`, `setColor`, `setSize`, `setPointers`, `setReadOnly`, `setBackground`, `setEraserRadius`, `undo`, `redo`, `clear`, `destroy`, and the `canUndo` / `canRedo` getters.

### `toSVG(doc)`

Turns a document into a standalone SVG string. Good for PDF export: lay the SVG over your page render instead of rasterizing a canvas.

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

The wet canvas is the only surface that repaints while you draw, on a `desynchronized` 2D context with coalesced pointer samples once per frame. Lift the pen and the stroke commits to the base canvas and fires through `onChange`. A `ResizeObserver` keeps both canvases matched to the container as the editor grows.

## Running it locally

The repo is an npm workspace. The package sits in [`packages/overink`](packages/overink), the demo in [`playground`](playground).

```bash
npm install
npm run dev      # builds the package, then runs the playground on :3000
npm run build    # builds both
```

## License

MIT. Built by Juan José Zepeda.
