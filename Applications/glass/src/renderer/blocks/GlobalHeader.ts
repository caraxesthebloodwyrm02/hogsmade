import { THRESHOLD_STATES, type ThresholdState } from "../../../bridge/schema";

const CEREMONY_LABELS: Record<ThresholdState, string> = {
  ground: "Ground",
  evaluating: "Evaluate",
  floor_rising: "Floor Rising",
  voices_appearing: "Voices Appear",
  voice_1_active: "Voice I — Velocity",
  voice_2_active: "Voice II — Guard",
  voice_3_active: "Voice III — Lens",
  elevated: "Elevated",
  returning: "Return",
  denied: "Deny",
};

interface GlobalHeaderCallbacks {
  onRecenter?: () => void;
  onSeed?: () => void;
}

export class GlobalHeader {
  private host: HTMLElement;
  private menu: HTMLDivElement | null = null;
  private menuOpen = false;
  private callbacks?: GlobalHeaderCallbacks;

  constructor(host: HTMLElement, callbacks?: GlobalHeaderCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.host.innerHTML = "";

    const bar = document.createElement("div");
    bar.id = "global-header-bar";
    const s = bar.style;
    s.display = "flex";
    s.alignItems = "center";
    s.justifyContent = "space-between";
    s.width = "100%";
    s.height = "100%";
    s.padding = "0 12px";
    s.pointerEvents = "auto";

    const brand = document.createElement("span");
    brand.textContent = "glass";
    brand.style.color = "rgba(200, 184, 154, 0.45)";
    brand.style.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    brand.style.fontSize = "11px";
    brand.style.letterSpacing = "0.15em";
    brand.style.textTransform = "lowercase";
    brand.style.userSelect = "none";

    const recenterBtn = document.createElement("button");
    recenterBtn.textContent = "⊙";
    recenterBtn.title = "Return to origin (Home)";
    recenterBtn.style.background = "none";
    recenterBtn.style.border = "1px solid rgba(200, 184, 154, 0.18)";
    recenterBtn.style.borderRadius = "3px";
    recenterBtn.style.color = "rgba(200, 184, 154, 0.75)";
    recenterBtn.style.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    recenterBtn.style.fontSize = "13px";
    recenterBtn.style.padding = "3px 8px";
    recenterBtn.style.cursor = "pointer";
    recenterBtn.style.userSelect = "none";
    recenterBtn.style.lineHeight = "1";

    recenterBtn.addEventListener("mouseenter", () => {
      recenterBtn.style.background = "rgba(200, 184, 154, 0.08)";
    });
    recenterBtn.addEventListener("mouseleave", () => {
      recenterBtn.style.background = "none";
    });
    recenterBtn.addEventListener("click", () => {
      this.callbacks?.onRecenter?.();
    });

    const touchBaseBtn = document.createElement("button");
    touchBaseBtn.textContent = "Seed";
    touchBaseBtn.title =
      "Seed: center of gravity — recenter and open discussion (Ctrl/Cmd+Shift+Home)";
    touchBaseBtn.style.background = "none";
    touchBaseBtn.style.border = "1px solid rgba(200, 184, 154, 0.18)";
    touchBaseBtn.style.borderRadius = "3px";
    touchBaseBtn.style.color = "rgba(200, 184, 154, 0.75)";
    touchBaseBtn.style.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    touchBaseBtn.style.fontSize = "11px";
    touchBaseBtn.style.padding = "3px 10px";
    touchBaseBtn.style.cursor = "pointer";
    touchBaseBtn.style.userSelect = "none";

    touchBaseBtn.addEventListener("mouseenter", () => {
      touchBaseBtn.style.background = "rgba(200, 184, 154, 0.08)";
    });
    touchBaseBtn.addEventListener("mouseleave", () => {
      touchBaseBtn.style.background = "none";
    });
    touchBaseBtn.addEventListener("click", () => {
      this.callbacks?.onSeed?.();
    });

    const rightCluster = document.createElement("div");
    rightCluster.style.display = "flex";
    rightCluster.style.alignItems = "center";
    rightCluster.style.gap = "6px";

    const ceremonyBtn = document.createElement("button");
    ceremonyBtn.textContent = "Ceremony ▾";
    ceremonyBtn.style.background = "none";
    ceremonyBtn.style.border = "1px solid rgba(200, 184, 154, 0.18)";
    ceremonyBtn.style.borderRadius = "3px";
    ceremonyBtn.style.color = "rgba(200, 184, 154, 0.75)";
    ceremonyBtn.style.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    ceremonyBtn.style.fontSize = "11px";
    ceremonyBtn.style.padding = "3px 10px";
    ceremonyBtn.style.cursor = "pointer";
    ceremonyBtn.style.userSelect = "none";

    ceremonyBtn.addEventListener("mouseenter", () => {
      ceremonyBtn.style.background = "rgba(200, 184, 154, 0.08)";
    });
    ceremonyBtn.addEventListener("mouseleave", () => {
      if (!this.menuOpen) {
        ceremonyBtn.style.background = "none";
      }
    });

    ceremonyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.menuOpen) {
        this.hideMenu();
      } else {
        this.showMenu(ceremonyBtn);
      }
    });

    rightCluster.appendChild(recenterBtn);
    rightCluster.appendChild(touchBaseBtn);
    rightCluster.appendChild(ceremonyBtn);

    bar.appendChild(brand);
    bar.appendChild(rightCluster);
    this.host.appendChild(bar);
  }

  private showMenu(anchor: HTMLElement): void {
    this.menuOpen = true;
    anchor.style.background = "rgba(200, 184, 154, 0.08)";

    const rect = anchor.getBoundingClientRect();

    this.menu = document.createElement("div");
    const s = this.menu.style;
    s.position = "fixed";
    s.top = `${rect.bottom + 4}px`;
    s.right = `${window.innerWidth - rect.right}px`;
    s.background = "rgba(20, 20, 26, 0.96)";
    s.border = "1px solid rgba(200, 184, 154, 0.15)";
    s.borderRadius = "4px";
    s.padding = "4px 0";
    s.zIndex = "300";
    s.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    s.fontSize = "12px";
    s.pointerEvents = "auto";
    s.minWidth = "200px";
    s.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.5)";

    for (const state of THRESHOLD_STATES) {
      const row = document.createElement("div");
      row.textContent = CEREMONY_LABELS[state];
      const rs = row.style;
      rs.padding = "5px 14px";
      rs.color = "rgba(232, 201, 160, 0.78)";
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
        window.glass.triggerCeremony(state);
        this.hideMenu();
      });

      this.menu.appendChild(row);
    }

    document.body.appendChild(this.menu);

    const close = (e: MouseEvent) => {
      if (this.menu && !this.menu.contains(e.target as Node)) {
        this.hideMenu();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  }

  private hideMenu(): void {
    this.menuOpen = false;
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
  }
}
