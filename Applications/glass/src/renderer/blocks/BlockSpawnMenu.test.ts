import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlockSpawnMenu } from "./BlockSpawnMenu";

function mockElement() {
  const children: any[] = [];
  const listeners: Record<string, Function[]> = {};
  return {
    style: {} as Record<string, string>,
    textContent: "",
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
});

describe("BlockSpawnMenu", () => {
  it("starts not visible", () => {
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn: vi.fn() });
    expect(menu.isVisible()).toBe(false);
  });

  it("becomes visible after show()", () => {
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn: vi.fn() });
    menu.show(100, 200, 10, 20);
    expect(menu.isVisible()).toBe(true);
  });

  it("creates menu items on show()", () => {
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn: vi.fn() });
    menu.show(100, 200, 10, 20);
    const menuDiv = created[0];
    expect(menuDiv._children).toHaveLength(2);
    expect(menuDiv._children[0].textContent).toBe("New Code Block");
    expect(menuDiv._children[1].textContent).toBe("New Note Block");
  });

  it("calls onSpawn with correct type when item clicked", () => {
    const onSpawn = vi.fn();
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn });
    menu.show(100, 200, 10, 20);
    const codeItem = created[1]; // first item div
    codeItem._fireEvent("click", { stopPropagation: vi.fn() });
    expect(onSpawn).toHaveBeenCalledWith("code", "typescript", "", { x: 110, y: 220 });
  });

  it("hides after item click", () => {
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn: vi.fn() });
    menu.show(100, 200, 0, 0);
    const codeItem = created[1];
    codeItem._fireEvent("click", { stopPropagation: vi.fn() });
    expect(menu.isVisible()).toBe(false);
  });

  it("hide() removes menu", () => {
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn: vi.fn() });
    menu.show(100, 200, 0, 0);
    expect(menu.isVisible()).toBe(true);
    menu.hide();
    expect(menu.isVisible()).toBe(false);
  });

  it("computes world position from screen + camera", () => {
    const onSpawn = vi.fn();
    const host = mockElement() as any;
    const menu = new BlockSpawnMenu(host, { onSpawn });
    menu.show(50, 100, 300, 400);
    const noteItem = created[2]; // second item div
    noteItem._fireEvent("click", { stopPropagation: vi.fn() });
    expect(onSpawn).toHaveBeenCalledWith("note", "text", "", { x: 350, y: 500 });
  });
});
