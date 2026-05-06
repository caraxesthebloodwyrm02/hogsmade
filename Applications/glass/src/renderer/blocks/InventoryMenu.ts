import {
  isAssetCategory,
  isAssetRarity,
  type AssetMeta,
  type BlockType,
  type ThresholdState,
} from "../../../bridge/schema";

const VALID_THRESHOLD_STATES = new Set<ThresholdState>([
  "ground",
  "evaluating",
  "floor_rising",
  "voices_appearing",
  "voice_1_active",
  "voice_2_active",
  "voice_3_active",
  "elevated",
  "returning",
  "denied",
]);

export interface InventoryMenuCallbacks {
  onSpawn(
    type: BlockType,
    language: string,
    content: string,
    position: { x: number; y: number },
    asset?: AssetMeta,
  ): void;
}

export class InventoryMenu {
  private host: HTMLElement;
  private callbacks: InventoryMenuCallbacks;
  private menu: HTMLDivElement | null = null;
  private worldX = 0;
  private worldY = 0;

  constructor(host: HTMLElement, callbacks: InventoryMenuCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
  }

  async show(screenX: number, screenY: number, cameraX: number, cameraY: number): Promise<void> {
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
    s.maxHeight = "300px";
    s.overflowY = "auto";
    s.width = "280px";
    s.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4)";

    const title = document.createElement("div");
    title.textContent = "INVENTORY LEDGER";
    const ts = title.style;
    ts.padding = "4px 16px 8px";
    ts.color = "rgba(200, 184, 154, 0.5)";
    ts.fontSize = "10px";
    ts.letterSpacing = "0.1em";
    ts.borderBottom = "1px solid rgba(200, 184, 154, 0.1)";
    ts.marginBottom = "4px";
    this.menu.appendChild(title);

    let assets: AssetMeta[] = [];
    try {
      assets = await window.glass.listAssets();
    } catch (e) {
      console.warn("Failed to load inventory assets", e);
    }

    if (assets.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No semantic assets found.";
      empty.style.padding = "12px 16px";
      empty.style.color = "rgba(136, 146, 176, 0.6)";
      empty.style.fontStyle = "italic";
      this.menu.appendChild(empty);
    }

    // Sort by most recent
    assets.sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime());

    for (const item of assets) {
      const rarityColors: Record<string, string> = {
        common: "#6b8f71",
        uncommon: "#c49a3c",
        rare: "#d4a574",
        epic: "#e8c9a0",
        legendary: "#c4956a",
        mythic: "#a0524a",
      };

      const category = isAssetCategory(item.category) ? item.category : "fragment";
      const rarity = isAssetRarity(item.rarity) ? item.rarity : "common";
      const label = typeof item.label === "string" ? item.label : "Untitled Asset";
      const glyph = typeof item.glyph === "string" && item.glyph.length > 0 ? item.glyph : "■";
      const rColor = rarityColors[rarity];

      const row = document.createElement("div");
      const rowBody = document.createElement("div");
      rowBody.style.display = "flex";
      rowBody.style.justifyContent = "space-between";
      rowBody.style.alignItems = "baseline";
      rowBody.style.pointerEvents = "none";

      const labelEl = document.createElement("span");
      labelEl.style.color = rColor;
      labelEl.style.fontWeight = "500";
      labelEl.textContent = `${glyph} ${label}`;

      const categoryEl = document.createElement("span");
      categoryEl.style.color = "rgba(136, 146, 176, 0.6)";
      categoryEl.style.fontSize = "10px";
      categoryEl.textContent = category;

      rowBody.appendChild(labelEl);
      rowBody.appendChild(categoryEl);
      row.appendChild(rowBody);

      const rs = row.style;
      rs.padding = "8px 16px";
      rs.cursor = "pointer";

      row.addEventListener("mouseenter", () => {
        rs.background = "rgba(200, 184, 154, 0.1)";
      });
      row.addEventListener("mouseleave", () => {
        rs.background = "transparent";
      });

      row.addEventListener("click", (e) => {
        e.stopPropagation();

        const sourceCeremony = VALID_THRESHOLD_STATES.has(item.source_ceremony as ThresholdState)
          ? (item.source_ceremony as ThresholdState)
          : "ground";
        const assetMeta: AssetMeta = {
          category,
          rarity,
          label,
          glyph,
          acquired_at: item.acquired_at,
          source_ceremony: sourceCeremony,
          source_session: String(item.source_session ?? ""),
        };
        if (typeof item.ledger_id === "string") assetMeta.ledger_id = item.ledger_id;

        this.callbacks.onSpawn("asset", "text", "", { x: this.worldX, y: this.worldY }, assetMeta);
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
