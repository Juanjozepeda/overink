# overink

A pressure-sensitive vector ink layer you can mount on top of any editor. Apple Pencil pressure, palm rejection, low-latency drawing, and strokes stored as portable JSON instead of pixels.

**[Live demo](https://overink.vercel.app)** · **[Full documentation](https://github.com/Juanjozepeda/overink)**

```bash
npm i overink
```

```tsx
'use client'

import { useState } from 'react'
import { InkLayer, createInkDocument } from 'overink/react'

export function Page() {
  const [doc, setDoc] = useState(() => createInkDocument())

  return (
    <div style={{ position: 'relative' }}>
      <MyEditor />
      <InkLayer value={doc} onChange={setDoc} tool="pen" color="#7c3aed" size={4} />
    </div>
  )
}
```

- Tools: pen, highlighter, stroke eraser, undo/redo, paper backgrounds.
- Only the pointer types you allow can draw; fingers keep scrolling.
- Framework-agnostic `InkEngine` core in the root export; React bindings in `overink/react`.
- `toSVG(doc)` renders any document to a crisp standalone SVG.

MIT © Juan José Zepeda
