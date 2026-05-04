import type { BlockOrigin } from "../../../bridge/schema";
import * as monaco from "monaco-editor";

export interface CodeBlockOptions {
  id: string;
  language: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: BlockOrigin;
}

const SPAWN_DURATION = 600;

const GLASS_THEME = "glass-dark";
let themeRegistered = false;

function ensureTheme(): void {
  if (themeRegistered) return;
  monaco.editor.defineTheme(GLASS_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "e8c9a0", background: "0e0e12" },
      { token: "comment", foreground: "4a3f35", fontStyle: "italic" },
      { token: "keyword", foreground: "c4956a" },
      { token: "string", foreground: "6b8f71" },
      { token: "number", foreground: "c49a3c" },
      { token: "type", foreground: "d4a574" },
    ],
    colors: {
      "editor.background": "#0e0e12ea",
      "editor.foreground": "#e8c9a0",
      "editor.lineHighlightBackground": "#1a171410",
      "editorCursor.foreground": "#c4956a",
      "editor.selectionBackground": "#3d332840",
      "editorLineNumber.foreground": "#4a3f3560",
      "editorGutter.background": "#0e0e1200",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#4a3f3530",
      "scrollbarSlider.hoverBackground": "#4a3f3550",
    },
  });
  themeRegistered = true;
}

export class CodeBlock {
  readonly id: string;
  readonly origin: BlockOrigin;
  x: number;
  y: number;
  content: string;
  language: string;

  private container: HTMLDivElement;
  private gripElement: HTMLDivElement;
  private width: number;
  private height: number;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;

  constructor(opts: CodeBlockOptions, container: HTMLDivElement) {
    this.id = opts.id;
    this.origin = opts.origin;
    this.x = opts.x;
    this.y = opts.y;
    this.content = opts.content;
    this.language = opts.language;
    this.width = opts.width;
    this.height = opts.height;
    this.container = container;
    this.gripElement = document.createElement("div");

    this.applyStyle();
    this.mountGrip();
    this.mountEditor();
  }

  getGripElement(): HTMLDivElement {
    return this.gripElement;
  }

  private mountGrip(): void {
    const g = this.gripElement;
    g.style.width = "100%";
    g.style.height = "16px";
    g.style.cursor = "grab";
    g.style.borderBottom = "1px solid rgba(200,184,154,0.08)";
    g.style.flexShrink = "0";
    g.style.pointerEvents = "auto";
    this.container.appendChild(g);
  }

  private mountEditor(): void {
    ensureTheme();

    const editorHost = document.createElement("div");
    editorHost.style.width = "100%";
    editorHost.style.height = "100%";
    this.container.appendChild(editorHost);

    this.editor = monaco.editor.create(editorHost, {
      value: this.content,
      language: this.language,
      theme: GLASS_THEME,
      minimap: { enabled: false },
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 8,
      lineNumbersMinChars: 0,
      renderLineHighlight: "none",
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: { vertical: "hidden", horizontal: "auto", useShadows: false },
      padding: { top: 8, bottom: 8 },
      fontSize: 12,
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      readOnly: this.origin === "agent",
      domReadOnly: this.origin === "agent",
      contextmenu: false,
      automaticLayout: true,
    });

    this.container.style.pointerEvents = "auto";

    if (this.origin === "user") {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      this.editor.onDidChangeModelContent(() => {
        const model = this.editor!.getModel();
        if (!model) return;
        const newContent = model.getValue();
        this.content = newContent;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          (
            window as Window & { glass?: { patchBlock?: (id: string, c: string) => void } }
          ).glass?.patchBlock?.(this.id, newContent);
        }, 500);
      });
    }
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
    if (this.editor) {
      const model = this.editor.getModel();
      if (model && model.getValue() !== content) {
        model.setValue(content);
      }
    }
  }

  getContent(): string {
    if (this.editor) {
      const model = this.editor.getModel();
      if (model) return model.getValue();
    }
    return this.content;
  }

  spawnOpacity(age: number): number {
    if (age >= SPAWN_DURATION) return 1;
    return Math.min(1, age / SPAWN_DURATION);
  }

  updateOpacity(age: number): void {
    this.container.style.opacity = String(this.spawnOpacity(age));
  }

  dispose(): void {
    this.editor?.dispose();
    this.editor = null;
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
    s.background = "rgba(14, 14, 18, 0.92)";
    s.border = "1px solid rgba(200, 184, 154, 0.12)";
    s.borderRadius = "4px";
    s.overflow = "hidden";
    s.transition = "opacity 0.1s ease";
  }
}
