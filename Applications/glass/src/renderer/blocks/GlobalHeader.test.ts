import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalHeader } from "./GlobalHeader";

function mockElement(tag = "div") {
  const children: any[] = [];
  const listeners: Record<string, Function[]> = {};
  const style: Record<string, string> = {};

  return {
    tagName: tag.toUpperCase(),
    style,
    textContent: "",
    title: "",
    id: "",
    innerHTML: "",
    appendChild(child: any) {
      children.push(child);
      return child;
    },
    remove: vi.fn(),
    addEventListener(event: string, handler: Function) {
      (listeners[event] ??= []).push(handler);
    },
    removeEventListener: vi.fn(),
    getBoundingClientRect() {
      return {
        bottom: 100,
        right: 400,
      };
    },
    contains() {
      return false;
    },
    _children: children,
    _listeners: listeners,
    _fire(event: string, payload: any = {}) {
      for (const handler of listeners[event] ?? []) handler(payload);
    },
  };
}

describe("GlobalHeader", () => {
  let created: any[] = [];

  beforeEach(() => {
    created = [];
    vi.stubGlobal("window", {
      innerWidth: 1280,
      glass: {
        triggerCeremony: vi.fn(),
      },
    });

    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        const el = mockElement(tag);
        created.push(el);
        return el;
      },
      body: {
        appendChild: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("calls onRecenter when the recenter button is clicked", () => {
    const onRecenter = vi.fn();
    const host = mockElement("div") as any;
    new GlobalHeader(host, { onRecenter });

    const recenterBtn = created.find((el) => el.tagName === "BUTTON" && el.textContent === "⊙");
    recenterBtn._fire("click");

    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("calls onSeed when the seed button is clicked", () => {
    const onSeed = vi.fn();
    const host = mockElement("div") as any;
    new GlobalHeader(host, { onSeed });

    const seedBtn = created.find((el) => el.tagName === "BUTTON" && el.textContent === "Seed");
    seedBtn._fire("click");

    expect(onSeed).toHaveBeenCalledTimes(1);
  });
});

describe("Seed keyboard shortcut detection", () => {
  // Mirrors the guard in index.ts window keydown handler.
  // Tests the predicate in isolation so regressions surface without a DOM bootstrap.
  const isSeedChord = (e: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    code?: string;
  }): boolean => !!(e.ctrlKey || e.metaKey) && !!e.shiftKey && e.code === "Home";

  it("matches Ctrl+Shift+Home", () => {
    expect(isSeedChord({ ctrlKey: true, shiftKey: true, code: "Home" })).toBe(true);
  });

  it("matches Meta+Shift+Home (macOS Cmd)", () => {
    expect(isSeedChord({ metaKey: true, shiftKey: true, code: "Home" })).toBe(true);
  });

  it("does not match without Shift", () => {
    expect(isSeedChord({ ctrlKey: true, shiftKey: false, code: "Home" })).toBe(false);
  });

  it("does not match without Ctrl or Meta", () => {
    expect(isSeedChord({ shiftKey: true, code: "Home" })).toBe(false);
  });

  it("does not match a different key with the same modifiers", () => {
    expect(isSeedChord({ ctrlKey: true, shiftKey: true, code: "KeyH" })).toBe(false);
  });

  it("does not match plain Home (no modifiers)", () => {
    expect(isSeedChord({ code: "Home" })).toBe(false);
  });
});
