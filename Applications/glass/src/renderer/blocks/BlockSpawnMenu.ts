import type { BlockType } from "../../../bridge/schema";

export interface SpawnMenuCallbacks {
  onSpawn(
    type: BlockType,
    language: string,
    content: string,
    position: { x: number; y: number },
  ): void;
}

interface MenuItem {
  label: string;
  type: BlockType;
  language: string;
}

const ITEMS: MenuItem[] = [
  { label: "New Code Block", type: "code", language: "typescript" },
  { label: "New Note Block", type: "note", language: "text" },
];

export class BlockSpawnMenu {
  private host: HTMLElement;
  private callbacks: SpawnMenuCallbacks;
  private menu: HTMLDivElement | null = null;
  private worldX = 0;
  private worldY = 0;

  constructor(host: HTMLElement, callbacks: SpawnMenuCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
  }

  show(screenX: number, screenY: number, cameraX: number, cameraY: number): void {
    this.hide();
    this.worldX = screenX + cameraX;
    this.worldY = screenY + cameraY;

    this.menu = document.createElement("div");
    const s = this.menu.style;
    s.position = "fixed";
    s.left = `${screenX}px`;
    s.top = `${screenY}px`;
    s.background = "rgba(20, 20, 26, 0.95)";
    s.border = "1px solid rgba(200, 184, 154, 0.15)";
    s.borderRadius = "4px";
    s.padding = "4px 0";
    s.zIndex = "200";
    s.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    s.fontSize = "12px";
    s.pointerEvents = "auto";

    for (const item of ITEMS) {
      const row = document.createElement("div");
      row.textContent = item.label;
      const rs = row.style;
      rs.padding = "6px 16px";
      rs.color = "rgba(232, 201, 160, 0.85)";
      rs.cursor = "pointer";
      rs.whiteSpace = "nowrap";

      row.addEventListener("mouseenter", () => {
        rs.background = "rgba(200, 184, 154, 0.1)";
      });
      row.addEventListener("mouseleave", () => {
        rs.background = "transparent";
      });
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onSpawn(item.type, item.language, "", { x: this.worldX, y: this.worldY });
        this.hide();
      });

      this.menu.appendChild(row);
    }

    this.host.appendChild(this.menu);
  }

  hide(): void {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
  }

  isVisible(): boolean {
    return this.menu !== null;
  }
}
