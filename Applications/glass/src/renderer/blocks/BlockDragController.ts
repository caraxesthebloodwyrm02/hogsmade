export interface DragCallbacks {
  onDragEnd(id: string, x: number, y: number): void;
}

interface DragState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startBlockX: number;
  startBlockY: number;
}

export class BlockDragController {
  private drag: DragState | null = null;
  private callbacks: DragCallbacks;

  constructor(callbacks: DragCallbacks) {
    this.callbacks = callbacks;
  }

  startDrag(id: string, mouseX: number, mouseY: number, blockX: number, blockY: number): void {
    this.drag = {
      id,
      startMouseX: mouseX,
      startMouseY: mouseY,
      startBlockX: blockX,
      startBlockY: blockY,
    };
  }

  moveDrag(mouseX: number, mouseY: number): { id: string; x: number; y: number } | null {
    if (!this.drag) return null;
    const dx = mouseX - this.drag.startMouseX;
    const dy = mouseY - this.drag.startMouseY;
    return { id: this.drag.id, x: this.drag.startBlockX + dx, y: this.drag.startBlockY + dy };
  }

  endDrag(): { id: string; x: number; y: number } | null {
    if (!this.drag) return null;
    const result = { id: this.drag.id, x: this.drag.startBlockX, y: this.drag.startBlockY };
    this.drag = null;
    return result;
  }

  endDragAt(mouseX: number, mouseY: number): { id: string; x: number; y: number } | null {
    if (!this.drag) return null;
    const dx = mouseX - this.drag.startMouseX;
    const dy = mouseY - this.drag.startMouseY;
    const result = {
      id: this.drag.id,
      x: this.drag.startBlockX + dx,
      y: this.drag.startBlockY + dy,
    };
    this.drag = null;
    return result;
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  activeBlockId(): string | null {
    return this.drag?.id ?? null;
  }
}
