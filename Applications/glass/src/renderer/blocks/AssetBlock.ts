import type { AssetMeta, BlockOrigin, ThresholdState } from "../../../bridge/schema";

export interface AssetBlockOptions {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: BlockOrigin;
  asset: AssetMeta;
}

const SPAWN_DURATION = 600;

const RARITY_COLORS: Record<AssetMeta["rarity"], string> = {
  common: "#6b8f71",
  uncommon: "#c49a3c",
  rare: "#d4a574",
  epic: "#e8c9a0",
  legendary: "#c4956a",
  mythic: "#a0524a",
};

// Z-index by rarity — legendary and mythic surface above the default depth planes.
// For common..epic, falls through to origin-based z (agent=1, user=2).
const RARITY_Z: Partial<Record<AssetMeta["rarity"], number>> = {
  legendary: 3,
  mythic: 4,
};

// Ceremony shadow overlay stacked on top of the rarity glow.
// Rarity border-color is owned by renderAsset() and not changed here.
const CEREMONY_SHADOW: Record<ThresholdState, string | null> = {
  ground: null,
  evaluating: null,
  floor_rising: "0 0 8px rgba(196,149,106,0.10)",
  voices_appearing: "0 0 10px rgba(196,149,106,0.15)",
  voice_1_active: "0 0 10px rgba(196,149,106,0.18)",
  voice_2_active: "0 0 12px rgba(196,149,106,0.20)",
  voice_3_active: "0 0 12px rgba(196,149,106,0.22)",
  elevated: "0 0 16px rgba(196,149,106,0.28)",
  returning: null,
  denied: "0 0 12px rgba(160,82,74,0.24)",
};

export class AssetBlock {
  readonly id: string;
  readonly origin: BlockOrigin;
  x: number;
  y: number;
  content: string;

  private container: HTMLDivElement;
  private gripElement: HTMLDivElement;
  private width: number;
  private height: number;
  private asset: AssetMeta;
  private glyphElement: HTMLDivElement;
  private labelElement: HTMLDivElement;
  private metaElement: HTMLDivElement;
  private contentElement: HTMLDivElement;
  private _cachedThresholdState: ThresholdState | null = null;

  constructor(opts: AssetBlockOptions, container: HTMLDivElement) {
    this.id = opts.id;
    this.origin = opts.origin;
    this.x = opts.x;
    this.y = opts.y;
    this.content = opts.content;
    this.width = opts.width;
    this.height = opts.height;
    this.asset = opts.asset;
    this.container = container;
    this.gripElement = document.createElement("div");
    this.glyphElement = document.createElement("div");
    this.labelElement = document.createElement("div");
    this.metaElement = document.createElement("div");
    this.contentElement = document.createElement("div");

    this.applyStyle();
    this.mountGrip();
    this.mountBody();
    this.renderAsset();
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
    this.contentElement.textContent = content;
  }

  setAsset(asset: AssetMeta): void {
    this.asset = asset;
    this.renderAsset();
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
    // Stack ceremony glow on top of the rarity shadow — rarity border-color stays unchanged.
    const rarityColor = RARITY_COLORS[this.asset.rarity];
    const overlay = CEREMONY_SHADOW[state];
    this.container.style.boxShadow = overlay
      ? `0 0 18px ${rarityColor}40, ${overlay}`
      : `0 0 18px ${rarityColor}40`;
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
    s.background = "rgba(26, 23, 20, 0.92)";
    s.border = "1px solid rgba(200, 184, 154, 0.2)";
    s.borderRadius = "10px";
    s.overflow = "hidden";
    s.transition = "opacity 0.1s ease, box-shadow 0.6s ease, border-color 0.6s ease";
    s.pointerEvents = "auto";
    s.display = "flex";
    s.flexDirection = "column";
    // Z-index: legendary=3 (Gold), mythic=4 (Mythic) override depth planes;
    // otherwise origin-driven: user=2 (Silver), agent=1 (Amber).
    s.zIndex = String(RARITY_Z[this.asset.rarity] ?? (this.origin === "user" ? 2 : 1));
  }

  private mountGrip(): void {
    const g = this.gripElement;
    g.style.width = "100%";
    g.style.height = "18px";
    g.style.cursor = "grab";
    g.style.borderBottom = "1px solid rgba(232, 201, 160, 0.12)";
    g.style.flexShrink = "0";
    g.style.pointerEvents = "auto";
    this.container.appendChild(g);
  }

  private mountBody(): void {
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.alignItems = "center";
    body.style.justifyContent = "center";
    body.style.height = "100%";
    body.style.padding = "10px 12px 12px";
    body.style.gap = "4px";
    body.style.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    body.style.textAlign = "center";

    this.glyphElement.style.fontSize = "34px";
    this.glyphElement.style.lineHeight = "1";
    this.labelElement.style.fontSize = "13px";
    this.labelElement.style.fontWeight = "700";
    this.metaElement.style.fontSize = "10px";
    this.metaElement.style.letterSpacing = "0.08em";
    this.metaElement.style.opacity = "0.82";
    this.contentElement.style.fontSize = "11px";
    this.contentElement.style.maxHeight = "34px";
    this.contentElement.style.overflow = "hidden";
    this.contentElement.style.opacity = "0.74";

    body.appendChild(this.glyphElement);
    body.appendChild(this.labelElement);
    body.appendChild(this.metaElement);
    body.appendChild(this.contentElement);
    this.container.appendChild(body);
  }

  private renderAsset(): void {
    const color = RARITY_COLORS[this.asset.rarity];
    this.container.style.borderColor = color;
    this.container.style.boxShadow = `0 0 18px ${color}40`;
    this.glyphElement.style.color = color;
    this.labelElement.style.color = "#e8c9a0";
    this.metaElement.style.color = color;
    this.contentElement.style.color = "#c8b89a";

    this.glyphElement.textContent = this.asset.glyph ?? "O";
    this.labelElement.textContent = this.asset.label;
    this.metaElement.textContent = `${this.asset.rarity.toUpperCase()} / ${this.asset.category.toUpperCase()}`;
    this.contentElement.textContent = this.content;
  }
}
