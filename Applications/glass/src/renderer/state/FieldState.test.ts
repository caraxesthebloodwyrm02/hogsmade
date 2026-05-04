import { describe, it, expect, vi } from "vitest";
import { FieldState } from "./FieldState";
import { DEFAULT_BRIDGE_STATE, type BridgeState } from "../../../bridge/schema";

describe("FieldState", () => {
  it("starts with default bridge values", () => {
    const fs = new FieldState();
    expect(fs.agentState).toBe("idle");
    expect(fs.thresholdState).toBe("ground");
    expect(fs.progress).toBe(0);
    expect(fs.voices).toEqual([]);
  });

  it("update() replaces state and notifies subscribers", () => {
    const fs = new FieldState();
    const listener = vi.fn();
    fs.subscribe(listener);

    const next: BridgeState = {
      ...DEFAULT_BRIDGE_STATE,
      agent_state: "writing",
      threshold_state: "evaluating",
      progress: 0.6,
    };
    fs.update(next);

    expect(listener).toHaveBeenCalledOnce();
    expect(fs.agentState).toBe("writing");
    expect(fs.thresholdState).toBe("evaluating");
    expect(fs.progress).toBe(0.6);
  });

  it("subscribe returns an unsubscribe function", () => {
    const fs = new FieldState();
    const listener = vi.fn();
    const unsub = fs.subscribe(listener);

    fs.update({ ...DEFAULT_BRIDGE_STATE });
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    fs.update({ ...DEFAULT_BRIDGE_STATE, agent_state: "thinking" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("multiple subscribers all receive updates", () => {
    const fs = new FieldState();
    const a = vi.fn();
    const b = vi.fn();
    fs.subscribe(a);
    fs.subscribe(b);

    fs.update({ ...DEFAULT_BRIDGE_STATE });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("exposes blocks and conversation getters from bridge state", () => {
    const fs = new FieldState();
    const next: BridgeState = {
      ...DEFAULT_BRIDGE_STATE,
      blocks: [
        {
          id: "I",
          type: "note",
          language: "text",
          content: "hello",
          position: { x: 1, y: 2 },
          origin: "user",
        },
      ],
      conversation: [{ role: "agent", text: "ack", timestamp: "2026-01-01T00:00:00Z" }],
    };
    fs.update(next);
    expect(fs.blocks).toHaveLength(1);
    expect(fs.conversation).toHaveLength(1);
  });
});
