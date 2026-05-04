import type { SemanticSearchResult } from "../../../bridge/schema";

export interface SimilarityPaneCallbacks {
  search(query: string): Promise<SemanticSearchResult[]>;
  onOpenChange(open: boolean): void;
  onSelect?(result: SemanticSearchResult): void;
}

export class SimilarityPane {
  private host: HTMLDivElement;
  private callbacks: SimilarityPaneCallbacks;
  private input: HTMLInputElement;
  private results: HTMLDivElement;
  private open = false;
  private searchNonce = 0;

  constructor(host: HTMLDivElement, callbacks: SimilarityPaneCallbacks) {
    this.host = host;
    this.callbacks = callbacks;

    this.input = document.createElement("input");
    this.results = document.createElement("div");

    this.configureHost();
    this.build();
  }

  isOpen(): boolean {
    return this.open;
  }

  async show(initialQuery = ""): Promise<void> {
    this.open = true;
    this.host.style.display = "block";
    this.host.style.transform = "translateX(0)";
    this.callbacks.onOpenChange(true);

    if (initialQuery) {
      this.input.value = initialQuery;
    }

    this.input.focus();
    if (this.input.value.trim()) {
      await this.runSearch(this.input.value);
      return;
    }
    this.renderMessage("Type to search the live field and inventory ledger.");
  }

  hide(): void {
    this.open = false;
    this.host.style.transform = "translateX(100%)";
    this.host.style.display = "none";
    this.callbacks.onOpenChange(false);
  }

  async toggle(initialQuery = ""): Promise<void> {
    if (this.open) {
      this.hide();
      return;
    }
    await this.show(initialQuery);
  }

  private configureHost(): void {
    const s = this.host.style;
    s.display = "none";
    s.padding = "20px 18px 24px";
    s.fontFamily = "'IBM Plex Mono', 'Fira Code', monospace";
    s.color = "#e8eef4";
  }

  private build(): void {
    const title = document.createElement("div");
    title.textContent = "LOCAL SEMANTIC SEARCH";
    title.style.fontSize = "11px";
    title.style.letterSpacing = "0.14em";
    title.style.color = "rgba(200, 184, 154, 0.6)";
    title.style.marginBottom = "12px";

    this.input.type = "text";
    this.input.placeholder = "search field blocks and ledger...";
    const inputStyle = this.input.style;
    inputStyle.width = "100%";
    inputStyle.height = "36px";
    inputStyle.marginBottom = "14px";
    inputStyle.padding = "0 12px";
    inputStyle.borderRadius = "4px";
    inputStyle.border = "1px solid rgba(200, 184, 154, 0.15)";
    inputStyle.background = "rgba(14, 14, 18, 0.9)";
    inputStyle.color = "#e8eef4";
    inputStyle.outline = "none";

    this.results.style.display = "flex";
    this.results.style.flexDirection = "column";
    this.results.style.gap = "8px";

    this.input.addEventListener("input", () => {
      void this.runSearch(this.input.value);
    });

    this.host.appendChild(title);
    this.host.appendChild(this.input);
    this.host.appendChild(this.results);
  }

  private async runSearch(query: string): Promise<void> {
    const currentNonce = ++this.searchNonce;
    const trimmed = query.trim();
    if (!trimmed) {
      this.renderMessage("Type to search the live field and inventory ledger.");
      return;
    }

    this.renderMessage("Searching...");
    const results = await this.callbacks.search(trimmed);
    if (currentNonce !== this.searchNonce) return;

    if (results.length === 0) {
      this.renderMessage(`No matches for \"${trimmed}\".`);
      return;
    }

    this.results.replaceChildren(...results.map((result) => this.renderResult(result)));
  }

  private renderMessage(text: string): void {
    const empty = document.createElement("div");
    empty.textContent = text;
    empty.style.padding = "14px 12px";
    empty.style.border = "1px dashed rgba(200, 184, 154, 0.14)";
    empty.style.color = "rgba(136, 146, 176, 0.82)";
    empty.style.borderRadius = "4px";
    this.results.replaceChildren(empty);
  }

  private renderResult(result: SemanticSearchResult): HTMLDivElement {
    const row = document.createElement("div");
    const meta = document.createElement("div");
    const title = document.createElement("div");
    const snippet = document.createElement("div");

    row.style.padding = "12px";
    row.style.border = "1px solid rgba(200, 184, 154, 0.12)";
    row.style.borderRadius = "4px";
    row.style.background = "rgba(14, 14, 18, 0.7)";
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      this.callbacks.onSelect?.(result);
    });
    meta.textContent = `${result.source.toUpperCase()} · score ${result.score.toFixed(1)}`;
    meta.style.fontSize = "10px";
    meta.style.letterSpacing = "0.08em";
    meta.style.color = "rgba(200, 184, 154, 0.58)";
    meta.style.marginBottom = "6px";

    title.textContent = result.title;
    title.style.fontSize = "13px";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";

    snippet.textContent = result.snippet || "No preview available.";
    snippet.style.fontSize = "12px";
    snippet.style.lineHeight = "1.5";
    snippet.style.color = "rgba(232, 238, 244, 0.82)";

    row.appendChild(meta);
    row.appendChild(title);
    row.appendChild(snippet);
    return row;
  }
}
