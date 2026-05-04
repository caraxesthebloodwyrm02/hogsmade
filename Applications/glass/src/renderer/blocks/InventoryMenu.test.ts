import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryMenu } from "./InventoryMenu";

function mockElement() {
  const children: any[] = [];
  const listeners: Record<string, Function[]> = {};
  return {
    style: {} as Record<string, string>,
    textContent: "",
    innerHTML: "",
    appendChild(child: any) {
      children.push(child);
    },
    remove() {},
    addEventListener(event: string, handler: Function) {
      (listeners[event] ??= []).push(handler);
    },
    removeEventListener() {},
    _children: children,
    _listeners: listeners,
    _fireEvent(event: string, data: any = {}) {
      for (const h of listeners[event] ?? []) h(data);
    },
  };
}

let created: any[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      const el = mockElement();
      created.push(el);
      return el;
    },
  });

  vi.stubGlobal("window", {
    glass: {
      listAssets: vi.fn().mockResolvedValue([
        {
          ledger_id: "asset-123",
          category: "artifact",
          rarity: "epic",
          label: "Test Artifact",
          glyph: "✧",
          content: "Some content",
          created_at: "2026-05-04T10:00:00Z",
          source_ceremony: "elevated",
          source_session: "test-session",
        },
      ]),
    },
  });
});

describe("InventoryMenu", () => {
  it("starts not visible", () => {
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });
    expect(menu.isVisible()).toBe(false);
  });

  it("becomes visible after show() starts (synchronously sets menu div)", async () => {
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });
    const p = menu.show(100, 200, 10, 20);
    expect(menu.isVisible()).toBe(true);
    await p;
  });

  it("creates menu items on show()", async () => {
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });
    await menu.show(100, 200, 10, 20);
    const menuDiv = created[0];

    // First child is title, second child is the row
    expect(menuDiv._children).toHaveLength(2);
    expect(menuDiv._children[0].textContent).toBe("INVENTORY LEDGER");
    expect(menuDiv._children[1]._children[0]._children[0].textContent).toContain("Test Artifact");
  });

  it("renders inventory fields as text instead of HTML", async () => {
    (window as any).glass.listAssets.mockResolvedValueOnce([
      {
        ledger_id: "asset-xss",
        category: "artifact",
        rarity: "epic",
        label: "<img src=x onerror=alert(1)>",
        glyph: "<svg>",
        content: "Some content",
        created_at: "2026-05-04T10:00:00Z",
        source_ceremony: "elevated",
        source_session: "test-session",
      },
    ]);
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });

    await menu.show(100, 200, 10, 20);

    const row = created[2];
    const label = row._children[0]._children[0];
    expect(row.innerHTML).toBe("");
    expect(label.textContent).toBe("<svg> <img src=x onerror=alert(1)>");
  });

  it("calls onSpawn with correct asset when item clicked", async () => {
    const onSpawn = vi.fn();
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn });
    await menu.show(100, 200, 10, 20);

    const row = created[2]; // menu=0, title=1, row=2
    row._fireEvent("click", { stopPropagation: vi.fn() });

    expect(onSpawn).toHaveBeenCalledWith(
      "asset",
      "text",
      "Some content",
      { x: 110, y: 220 },
      {
        category: "artifact",
        rarity: "epic",
        label: "Test Artifact",
        glyph: "✧",
        acquired_at: "2026-05-04T10:00:00Z",
        source_ceremony: "elevated",
        source_session: "test-session",
        ledger_id: "asset-123",
      },
    );
  });

  it("normalizes invalid asset fields to safe defaults", async () => {
    (window as any).glass.listAssets.mockResolvedValueOnce([
      {
        ledger_id: 42,
        category: "unknown-category",
        rarity: "ultra",
        label: null,
        glyph: "",
        content: undefined,
        source_ceremony: "not-a-state",
        source_session: null,
      },
    ]);
    const onSpawn = vi.fn();
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn });
    await menu.show(100, 200, 10, 20);

    const row = created[2];
    row._fireEvent("click", { stopPropagation: vi.fn() });

    expect(onSpawn).toHaveBeenCalledWith(
      "asset",
      "text",
      "",
      { x: 110, y: 220 },
      expect.objectContaining({
        category: "fragment",
        rarity: "common",
        label: "Untitled Asset",
        glyph: "■",
        source_ceremony: "ground",
        source_session: "",
      }),
    );
  });

  it("hides after item click", async () => {
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });
    await menu.show(100, 200, 0, 0);
    const row = created[2];
    row._fireEvent("click", { stopPropagation: vi.fn() });
    expect(menu.isVisible()).toBe(false);
  });

  it("hide() removes menu", async () => {
    const host = mockElement() as any;
    const menu = new InventoryMenu(host, { onSpawn: vi.fn() });
    await menu.show(100, 200, 0, 0);
    expect(menu.isVisible()).toBe(true);
    menu.hide();
    expect(menu.isVisible()).toBe(false);
  });
});
