import type { InkStroke } from '../types'

const MAX_HISTORY = 100

/**
 * Snapshot history over the strokes array. Stroke objects are immutable,
 * so each snapshot only costs one array of references.
 */
export class History {
  private undoStack: InkStroke[][] = []
  private redoStack: InkStroke[][] = []

  record(previous: InkStroke[]): void {
    this.undoStack.push(previous)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack = []
  }

  undo(current: InkStroke[]): InkStroke[] | null {
    const previous = this.undoStack.pop()
    if (!previous) return null
    this.redoStack.push(current)
    return previous
  }

  redo(current: InkStroke[]): InkStroke[] | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push(current)
    return next
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
