import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const modelState = { value: "" };
const modelMock = {
  getValue: vi.fn(() => modelState.value),
  setValue: vi.fn((next: string) => {
    modelState.value = next;
  }),
};
const onDidChangeHandlers: Array<() => void> = [];
const editorMock = {
  getModel: vi.fn(() => modelMock),
  onDidChangeModelContent: vi.fn((cb: () => void) => {
    onDidChangeHandlers.push(cb);
    return { dispose: vi.fn() };
  }),
  dispose: vi.fn(),
};

vi.mock("monaco-editor", () => ({
  editor: {
    defineTheme: vi.fn(),
    create: vi.fn(() => editorMock),
  },
}));

import { CodeBlock, type CodeBlockOptions } from "./CodeBlock";

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

vi.stubGlobal("document", { createElement: () => ({ style: {} }) });

describe("CodeBlock", () => {
  let container: HTMLDivElement;
  const opts: CodeBlockOptions = {
    id: "b1",
    language: "typescript",
    content: "const x = 1;",
    x: 100,
    y: 200,
    width: 300,
    height: 200,
    origin: "agent",
  };

  beforeEach(() => {
    container = mockContainer();
    modelState.value = "";
    onDidChangeHandlers.length = 0;
    modelMock.getValue.mockClear();
    modelMock.setValue.mockClear();
    editorMock.getModel.mockReset();
    editorMock.getModel.mockReturnValue(modelMock);
    editorMock.onDidChangeModelContent.mockClear();
    editorMock.dispose.mockClear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("document", { createElement: () => ({ style: {} }) });
  });

  it("stores initial properties", () => {
    const cb = new CodeBlock(opts, container);
    expect(cb.id).toBe("b1");
    expect(cb.x).toBe(100);
    expect(cb.y).toBe(200);
    expect(cb.origin).toBe("agent");
  });

  it("setPosition updates coordinates and style", () => {
    const cb = new CodeBlock(opts, container);
    cb.setPosition(150, 250);
    expect(cb.x).toBe(150);
    expect(cb.y).toBe(250);
    expect(container.style.left).toBe("150px");
    expect(container.style.top).toBe("250px");
  });

  it("setContent updates stored content", () => {
    const cb = new CodeBlock(opts, container);
    cb.setContent("const y = 2;");
    expect(cb.content).toBe("const y = 2;");
  });

  it("setContent returns early when unchanged", () => {
    const cb = new CodeBlock(opts, container);
    modelState.value = opts.content;
    cb.setContent(opts.content);
    expect(modelMock.setValue).not.toHaveBeenCalled();
  });

  it("setContent avoids model write when model already has value", () => {
    const cb = new CodeBlock(opts, container);
    modelState.value = "const z = 3;";
    cb.setContent("const z = 3;");
    expect(modelMock.setValue).not.toHaveBeenCalled();
  });

  it("dispose removes the container element", () => {
    const cb = new CodeBlock(opts, container);
    cb.dispose();
    expect(container.remove).toHaveBeenCalled();
  });

  it("calculates spawn opacity based on age", () => {
    const cb = new CodeBlock(opts, container);
    expect(cb.spawnOpacity(0)).toBeCloseTo(0, 1);
    expect(cb.spawnOpacity(500)).toBeGreaterThan(0);
    expect(cb.spawnOpacity(500)).toBeLessThanOrEqual(1);
    expect(cb.spawnOpacity(2000)).toBeCloseTo(1, 1);
  });

  it("getContent returns stored content", () => {
    const cb = new CodeBlock(opts, container);
    expect(cb.getContent()).toBeDefined();
  });

  it("getContent falls back to stored content when model is null", () => {
    const cb = new CodeBlock(opts, container);
    cb.setContent("fallback-content");
    editorMock.getModel.mockReturnValueOnce(null);
    expect(cb.getContent()).toBe("fallback-content");
  });

  it("agent-origin blocks mount as readOnly", async () => {
    const { editor } = await import("monaco-editor");
    (editor.create as any).mockClear();
    new CodeBlock(opts, container);
    expect(editor.create).toHaveBeenCalled();
    const args = (editor.create as any).mock.calls[0][1];
    expect(args.readOnly).toBe(true);
  });

  it("user-origin blocks emit debounced patchBlock updates", async () => {
    vi.useFakeTimers();
    const patchBlock = vi.fn();
    vi.stubGlobal("window", { glass: { patchBlock } });
    const userOpts: CodeBlockOptions = { ...opts, origin: "user", id: "II" };
    new CodeBlock(userOpts, container);
    expect(onDidChangeHandlers).toHaveLength(1);

    modelState.value = "updated";
    onDidChangeHandlers[0]();
    expect(patchBlock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(patchBlock).toHaveBeenCalledWith("II", "updated");
  });

  it("user-origin debounce clears previous timer on rapid edits", () => {
    vi.useFakeTimers();
    const patchBlock = vi.fn();
    vi.stubGlobal("window", { glass: { patchBlock } });
    const userOpts: CodeBlockOptions = { ...opts, origin: "user", id: "III" };
    new CodeBlock(userOpts, container);

    modelState.value = "first";
    onDidChangeHandlers[0]();
    vi.advanceTimersByTime(300);
    modelState.value = "second";
    onDidChangeHandlers[0]();
    vi.advanceTimersByTime(499);
    expect(patchBlock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(patchBlock).toHaveBeenCalledTimes(1);
    expect(patchBlock).toHaveBeenCalledWith("III", "second");
  });

  it("user-origin change handler exits when model is unavailable", () => {
    vi.useFakeTimers();
    const patchBlock = vi.fn();
    vi.stubGlobal("window", { glass: { patchBlock } });
    const userOpts: CodeBlockOptions = { ...opts, origin: "user", id: "I" };
    new CodeBlock(userOpts, container);
    editorMock.getModel.mockReturnValueOnce(null);

    expect(() => onDidChangeHandlers[0]()).not.toThrow();
    vi.advanceTimersByTime(600);
    expect(patchBlock).not.toHaveBeenCalled();
  });

  it("updateOpacity writes style opacity", () => {
    const cb = new CodeBlock(opts, container);
    cb.updateOpacity(300);
    expect(container.style.opacity).toBeDefined();
  });
});
