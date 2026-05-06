import type { BlockOrigin, ThresholdState } from "../../../bridge/schema";

export interface NoteBlockOptions {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: BlockOrigin;
}

const SPAWN_DURATION = 600;

// Color temperature shifts per ceremony state — NoteBlock variant (warmer base).
type ColorTemp = { border: string; shadow: string };
const NOTE_COLOR_TEMP: Record<ThresholdState, ColorTemp> = {
  ground: { border: "rgba(232,201,160,0.25)", shadow: "0 4px 16px rgba(0,0,0,0.4)" },
  evaluating: { border: "rgba(232,201,160,0.30)", shadow: "0 4px 16px rgba(0,0,0,0.4)" },
  floor_rising: {
    border: "rgba(196,149,106,0.35)",
    shadow: "0 0 8px rgba(196,149,106,0.10), 0 4px 16px rgba(0,0,0,0.4)",
  },
  voices_appearing: {
    border: "rgba(196,149,106,0.42)",
    shadow: "0 0 10px rgba(196,149,106,0.14), 0 4px 16px rgba(0,0,0,0.4)",
  },
  voice_1_active: {
    border: "rgba(196,149,106,0.46)",
    shadow: "0 0 10px rgba(196,149,106,0.16), 0 4px 16px rgba(0,0,0,0.4)",
  },
  voice_2_active: {
    border: "rgba(196,149,106,0.50)",
    shadow: "0 0 12px rgba(196,149,106,0.18), 0 4px 16px rgba(0,0,0,0.4)",
  },
  voice_3_active: {
    border: "rgba(196,149,106,0.54)",
    shadow: "0 0 12px rgba(196,149,106,0.20), 0 4px 16px rgba(0,0,0,0.4)",
  },
  elevated: {
    border: "rgba(196,149,106,0.68)",
    shadow: "0 0 16px rgba(196,149,106,0.28), 0 4px 16px rgba(0,0,0,0.4)",
  },
  returning: { border: "rgba(232,201,160,0.25)", shadow: "0 4px 16px rgba(0,0,0,0.4)" },
  denied: {
    border: "rgba(160,82,74,0.48)",
    shadow: "0 0 12px rgba(160,82,74,0.24), 0 4px 16px rgba(0,0,0,0.4)",
  },
};

export class NoteBlock {
  readonly id: string;
  readonly origin: BlockOrigin;
  x: number;
  y: number;
  content: string;

  private container: HTMLDivElement;
  private gripElement: HTMLDivElement;
  private width: number;
  private height: number;
  private contentElement: HTMLDivElement;
  private _cachedThresholdState: ThresholdState | null = null;

  constructor(opts: NoteBlockOptions, container: HTMLDivElement) {
    this.id = opts.id;
    this.origin = opts.origin;
    this.x = opts.x;
    this.y = opts.y;
    this.content = opts.content;
    this.width = opts.width;
    this.height = opts.height;
    this.container = container;

    this.gripElement = document.createElement("div");
    this.contentElement = document.createElement("div");

    this.applyStyle();
    this.mountGrip();
    this.mountDeleteButton();
    this.mountBody();
    this.renderMarkdown();
  }

  getGripElement(): HTMLDivElement {
    return this.gripElement;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y}px`;
  }

  setContent(content: string): void {
    if (content === this.content) return;
    this.content = content;
    this.renderMarkdown();
  }

  spawnOpacity(age: number): number {
    if (age >= SPAWN_DURATION) return 1;
    return Math.min(1, age / SPAWN_DURATION);
  }

  updateOpacity(age: number, levitationMod = 1): void {
    this.container.style.opacity = String(this.spawnOpacity(age) * levitationMod);
  }

  setThresholdState(state: ThresholdState): void {
    if (state === this._cachedThresholdState) return;
    this._cachedThresholdState = state;
    const ct = NOTE_COLOR_TEMP[state];
    this.container.style.borderColor = ct.border;
    this.container.style.boxShadow = ct.shadow;
  }

  dispose(): void {
    this.container.remove();
  }

  private applyStyle(): void {
    const s = this.container.style;
    s.position = "absolute";
    s.left = `${this.x}px`;
    s.top = `${this.y}px`;
    s.width = `${this.width}px`;
    s.height = `${this.height}px`;
    s.opacity = "0";
    s.background = "rgba(14, 14, 18, 0.95)";
    s.border = "1px solid rgba(232, 201, 160, 0.25)";
    s.borderRadius = "6px";
    s.overflow = "hidden";
    s.transition = "opacity 0.1s ease, border-color 0.6s ease, box-shadow 0.6s ease";
    s.pointerEvents = "auto";
    s.display = "flex";
    s.flexDirection = "column";
    s.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.4)";
    s.zIndex = String(this.origin === "user" ? 2 : 1);
  }

  private mountGrip(): void {
    const g = this.gripElement;
    g.style.width = "100%";
    g.style.height = "16px";
    g.style.cursor = "grab";
    g.style.background = "rgba(232, 201, 160, 0.05)";
    g.style.borderBottom = "1px solid rgba(232, 201, 160, 0.12)";
    g.style.flexShrink = "0";
    g.style.pointerEvents = "auto";
    this.container.appendChild(g);
  }

  private mountDeleteButton(): void {
    if (this.origin !== "user") return;

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.style.position = "absolute";
    btn.style.top = "2px";
    btn.style.right = "4px";
    btn.style.width = "20px";
    btn.style.height = "20px";
    btn.style.padding = "0";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.color = "rgba(232, 201, 160, 0.5)";
    btn.style.fontSize = "18px";
    btn.style.lineHeight = "1";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "10";
    btn.style.transition = "color 0.15s";

    btn.addEventListener?.("mouseenter", () => {
      btn.style.color = "rgba(232, 201, 160, 1)";
    });
    btn.addEventListener?.("mouseleave", () => {
      btn.style.color = "rgba(232, 201, 160, 0.5)";
    });
    btn.addEventListener?.("click", (e) => {
      e.stopPropagation();
      window.glass.deleteBlock(this.id);
    });

    this.container.appendChild(btn);
  }

  private mountBody(): void {
    const body = this.contentElement;
    body.style.flexGrow = "1";
    body.style.overflowY = "auto";
    body.style.padding = "14px 18px";
    body.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    body.style.fontSize = "13px";
    body.style.lineHeight = "1.5";
    body.style.color = "#e8c9a0"; // GRID amber/gold accent
    body.style.userSelect = "text"; // Allow text selection
    body.style.cursor = "text";

    // Basic scrollbar styling for webkit
    const styleId = "noteblock-scrollbar-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .noteblock-content::-webkit-scrollbar {
          width: 6px;
        }
        .noteblock-content::-webkit-scrollbar-track {
          background: transparent;
        }
        .noteblock-content::-webkit-scrollbar-thumb {
          background: rgba(232, 201, 160, 0.2);
          border-radius: 3px;
        }
        .noteblock-content::-webkit-scrollbar-thumb:hover {
          background: rgba(232, 201, 160, 0.4);
        }
        .noteblock-content h1 { font-size: 18px; margin: 0 0 10px; color: #f2e2c4; font-weight: 600; }
        .noteblock-content h2 { font-size: 16px; margin: 16px 0 8px; color: #f2e2c4; font-weight: 600; }
        .noteblock-content h3 { font-size: 14px; margin: 14px 0 6px; color: #f2e2c4; font-weight: 600; }
        .noteblock-content p { margin: 0 0 10px; }
        .noteblock-content p:last-child { margin-bottom: 0; }
        .noteblock-content ul { margin: 0 0 10px; padding-left: 20px; }
        .noteblock-content li { margin-bottom: 4px; }
        .noteblock-content code {
          font-family: 'IBM Plex Mono', 'Fira Code', monospace;
          background: rgba(0, 0, 0, 0.4);
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 0.95em;
          color: #c4956a;
        }
        .noteblock-content strong { color: #f2e2c4; font-weight: 600; }
        .noteblock-content em { color: #d4a574; }
        .noteblock-content blockquote {
          border-left: 3px solid rgba(232, 201, 160, 0.4);
          margin: 0 0 10px;
          padding: 2px 12px;
          color: #c8b89a;
          background: rgba(232, 201, 160, 0.05);
        }
      `;
      document.head.appendChild(style);
    }

    body.className = "noteblock-content";
    this.container.appendChild(body);
  }

  private renderMarkdown(): void {
    let html = this.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Headings
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold, Italic
    html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

    // Code
    html = html.replace(/`(.*?)`/gim, "<code>$1</code>");

    // Blockquote
    html = html.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");

    const paragraphs = html.split(/\n{2,}/).map((p) => {
      if (p.startsWith("<h") || p.startsWith("<blockquote")) {
        return p;
      }
      if (/^[\-\*] .+/m.test(p)) {
        const listItems = p.split("\n").map((line) => {
          if (/^[\-\*] (.+)/.test(line)) {
            return line.replace(/^[\-\*] (.+)/, "<li>$1</li>");
          }
          return line;
        });
        return `<ul>${listItems.join("")}</ul>`;
      }
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
    });

    const safe = paragraphs.join("").replace(/<script[\s\S]*?<\/script>/gi, "");
    this.contentElement.innerHTML = safe;
  }
}
