import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssetBlock, type AssetBlockOptions } from "./AssetBlock";

type MockElement = HTMLDivElement & {
  children: MockElement[];
};

function mockElement(): MockElement {
  const el = {
    style: {} as Record<string, string>,
    children: [] as MockElement[],
    textContent: "",
    appendChild: vi.fn((child: MockElement) => {
      el.children.push(child);
      return child;
    }),
    remove: vi.fn(),
    addEventListener: vi.fn(),
  } as unknown as MockElement;
  return el;
}

describe("AssetBlock", () => {
  let container: MockElement;
  let created: MockElement[];

  const opts: AssetBlockOptions = {
    id: "asset-1",
    content: "A durable semantic marker",
    x: 100,
    y: 200,
    width: 220,
    height: 156,
    origin: "agent",
    asset: {
      category: "relic",
      rarity: "mythic",
      label: "Rift Anchor",
      glyph: "*",
      acquired_at: "2026-01-01T00:00:00Z",
      source_ceremony: "elevated",
      source_session: "session-1",
    },
  };

  beforeEach(() => {
    container = mockElement();
    created = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = mockElement();
        created.push(el);
        return el;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders asset metadata into lightweight DOM nodes", () => {
    const block = new AssetBlock(opts, container);
    expect(block.id).toBe("asset-1");
    expect(container.style.left).toBe("100px");
    expect(container.style.borderColor).toBe("#a0524a");
    expect(created.some((el) => el.textContent === "Rift Anchor")).toBe(true);
    expect(created.some((el) => el.textContent === "MYTHIC / RELIC")).toBe(true);
  });

  it("updates position, content, opacity, and metadata", () => {
    const block = new AssetBlock(opts, container);
    block.setPosition(150, 250);
    block.setContent("Updated marker");
    block.setAsset({ ...opts.asset, rarity: "rare", label: "Mapped Anchor" });
    block.updateOpacity(300);

    expect(container.style.left).toBe("150px");
    expect(container.style.top).toBe("250px");
    expect(container.style.opacity).toBe("0.5");
    expect(container.style.borderColor).toBe("#d4a574");
    expect(created.some((el) => el.textContent === "Mapped Anchor")).toBe(true);
    expect(created.some((el) => el.textContent === "Updated marker")).toBe(true);
  });

  it("removes its container on dispose", () => {
    const block = new AssetBlock(opts, container);
    block.dispose();
    expect(container.remove).toHaveBeenCalled();
  });
});
