import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { NoteBlock, type NoteBlockOptions } from "./NoteBlock";

const mockContainer = (): HTMLDivElement => {
  const el = {
    style: {} as Record<string, string>,
    classList: { add: vi.fn(), remove: vi.fn() },
    remove: vi.fn(),
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 200,
      right: 300,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    }),
  } as unknown as HTMLDivElement;
  return el;
};

vi.stubGlobal("document", {
  createElement: () => ({ style: {} }),
  head: { appendChild: vi.fn() },
  getElementById: vi.fn(),
});

describe("NoteBlock", () => {
  let container: HTMLDivElement;
  const opts: NoteBlockOptions = {
    id: "n1",
    content: "Note content",
    x: 100,
    y: 200,
    width: 300,
    height: 200,
    origin: "agent",
  };

  beforeEach(() => {
    container = mockContainer();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("document", {
      createElement: () => ({ style: {} }),
      head: { appendChild: vi.fn() },
      getElementById: vi.fn(),
    });
  });

  it("stores initial properties", () => {
    const nb = new NoteBlock(opts, container);
    expect(nb.id).toBe("n1");
    expect(nb.x).toBe(100);
    expect(nb.y).toBe(200);
    expect(nb.origin).toBe("agent");
  });

  it("setPosition updates coordinates and style", () => {
    const nb = new NoteBlock(opts, container);
    nb.setPosition(150, 250);
    expect(nb.x).toBe(150);
    expect(nb.y).toBe(250);
    expect(container.style.left).toBe("150px");
    expect(container.style.top).toBe("250px");
  });

  it("setContent updates stored content", () => {
    const nb = new NoteBlock(opts, container);
    nb.setContent("New note content");
    expect(nb.content).toBe("New note content");
  });

  it("setContent returns early when unchanged", () => {
    const nb = new NoteBlock(opts, container);
    nb.setContent(opts.content);
    expect(nb.content).toBe(opts.content);
  });

  it("dispose removes the container element", () => {
    const nb = new NoteBlock(opts, container);
    nb.dispose();
    expect(container.remove).toHaveBeenCalled();
  });

  it("calculates spawn opacity based on age", () => {
    const nb = new NoteBlock(opts, container);
    expect(nb.spawnOpacity(0)).toBeCloseTo(0, 1);
    expect(nb.spawnOpacity(500)).toBeGreaterThan(0);
    expect(nb.spawnOpacity(500)).toBeLessThanOrEqual(1);
    expect(nb.spawnOpacity(2000)).toBeCloseTo(1, 1);
  });

  it("updateOpacity writes style opacity", () => {
    const nb = new NoteBlock(opts, container);
    nb.updateOpacity(300);
    expect(container.style.opacity).toBeDefined();
  });
});
