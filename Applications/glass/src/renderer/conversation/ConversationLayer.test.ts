import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationLayer, type ConversationMessage } from "./ConversationLayer";

describe("ConversationLayer", () => {
  let layer: ConversationLayer;

  function makeCtx(widthPerChar = 7): CanvasRenderingContext2D {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      measureText: vi.fn((s: string) => ({ width: s.length * widthPerChar })),
      fillText: vi.fn(),
      font: "",
      textAlign: "left",
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
  }

  function msg(
    role: "agent" | "user",
    text: string,
    age = 0,
    timestamp = "2026-01-01T00:00:00Z",
  ): ConversationMessage {
    return { role, text, timestamp, age };
  }

  beforeEach(() => {
    layer = new ConversationLayer(800, 600);
  });

  it("starts with no messages", () => {
    expect(layer.messages).toEqual([]);
  });

  it("syncs messages from bridge state", () => {
    const msgs: ConversationMessage[] = [
      { role: "agent", text: "hello", timestamp: "2026-01-01T00:00:00Z", age: 0 },
      { role: "user", text: "hi", timestamp: "2026-01-01T00:00:01Z", age: 0 },
    ];
    layer.sync(msgs);
    expect(layer.messages).toHaveLength(2);
  });

  it("prunes messages beyond max history", () => {
    const msgs: ConversationMessage[] = [];
    for (let i = 0; i < 60; i++) {
      msgs.push({
        role: "agent",
        text: `msg ${i}`,
        timestamp: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        age: 0,
      });
    }
    layer.sync(msgs);
    expect(layer.messages.length).toBeLessThanOrEqual(50);
  });

  it("tick advances message age", () => {
    layer.sync([{ role: "agent", text: "hello", timestamp: "2026-01-01T00:00:00Z", age: 0 }]);
    layer.tick(1000);
    expect(layer.messages[0].age).toBe(1000);
  });

  it("preserves message age when bridge sync repeats the same message", () => {
    layer.sync([msg("agent", "hello", 0, "2026-01-01T00:00:00Z")]);
    layer.tick(9000);

    layer.sync([msg("agent", "hello", 0, "2026-01-01T00:00:00Z")]);

    expect(layer.messages[0].age).toBe(9000);
  });

  it("computes opacity decay for older messages", () => {
    const recent = layer.opacityForAge(0);
    const old = layer.opacityForAge(30000);
    expect(recent).toBeGreaterThan(old);
    expect(recent).toBeCloseTo(0.85, 1);
  });

  it("agent messages use warm color, user messages use cool color", () => {
    expect(layer.colorForRole("agent")).toContain("240");
    expect(layer.colorForRole("user")).toContain("232");
  });

  it("draw is a no-op when no messages exist", () => {
    const ctx = makeCtx();
    layer.draw(ctx);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("draw wraps long lines and renders visible messages only", () => {
    const ctx = makeCtx(20);
    layer.sync([
      msg("agent", "this is a very long message that should wrap across multiple lines", 100),
      msg("user", "tiny", 100),
      msg("agent", "stale", 40000),
    ]);

    layer.draw(ctx);

    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalled();
    const renderedLines = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(renderedLines.join(" ")).toContain("very");
    expect(renderedLines.join(" ")).not.toContain("stale");
  });

  it("draw renders at most 12 visible messages", () => {
    const ctx = makeCtx();
    const messages: ConversationMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(
        msg("agent", `line-${i}`, 100, `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`),
      );
    }
    layer.sync(messages);

    layer.draw(ctx);

    const calls = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(12);
    expect(calls[0][0]).toBe("line-8");
    expect(calls[11][0]).toBe("line-19");
  });

  it("resize moves drawing anchor", () => {
    const ctx = makeCtx();
    layer.sync([msg("agent", "probe", 100)]);
    layer.draw(ctx);
    const firstX = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const firstY = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];

    (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mockClear();
    layer.resize(1000, 1000);
    layer.draw(ctx);
    const secondX = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const secondY = (ctx.fillText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];

    expect(secondX).not.toBe(firstX);
    expect(secondY).not.toBe(firstY);
  });

  it("opacity floor is preserved for very old messages", () => {
    expect(layer.opacityForAge(100000)).toBe(0.05);
  });
});
