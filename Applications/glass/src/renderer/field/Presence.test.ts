import { describe, it, expect } from "vitest";
import { UserPresence, AgentPresence, VoiceLayer } from "./Presence";
import type { BridgeVoice } from "../../../bridge/schema";

function makeVoice(id: BridgeVoice["id"], active = true): BridgeVoice {
  return { id, color: "amber", position: "left", text: "test", active };
}

describe("UserPresence", () => {
  it("updates x/y on move", () => {
    const up = new UserPresence();
    up.move(42, 99);
    expect(up.x).toBe(42);
    expect(up.y).toBe(99);
  });

  it("appends a trail point on move", () => {
    const up = new UserPresence();
    up.move(10, 20);
    expect((up as any).trail).toHaveLength(1);
    expect((up as any).trail[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("caps trail at 20 points", () => {
    const up = new UserPresence();
    for (let i = 0; i < 25; i++) up.move(i, i);
    expect((up as any).trail.length).toBeLessThanOrEqual(20);
  });
});

describe("AgentPresence", () => {
  it("starts inactive", () => {
    const ap = new AgentPresence(100, 100);
    expect((ap as any).active).toBe(false);
  });

  it("becomes active for writing and thinking states", () => {
    const ap = new AgentPresence(100, 100);
    ap.setAgentState("writing");
    expect((ap as any).active).toBe(true);
    ap.setAgentState("thinking");
    expect((ap as any).active).toBe(true);
  });

  it("becomes inactive for idle/reviewing/elevated states", () => {
    const ap = new AgentPresence(100, 100);
    ap.setAgentState("writing");
    ap.setAgentState("idle");
    expect((ap as any).active).toBe(false);
    ap.setAgentState("reviewing");
    expect((ap as any).active).toBe(false);
  });

  it("reposition updates x and y", () => {
    const ap = new AgentPresence(100, 100);
    ap.reposition(200, 300);
    expect(ap.x).toBe(200);
    expect(ap.y).toBe(300);
  });
});

describe("VoiceLayer", () => {
  it("starts with empty presences", () => {
    const layer = new VoiceLayer(800, 600);
    expect((layer as any).presences.size).toBe(0);
  });

  it("adds a presence per voice on update", () => {
    const layer = new VoiceLayer(800, 600);
    layer.update([makeVoice("I"), makeVoice("II")], "elevated");
    expect((layer as any).presences.size).toBe(2);
  });

  it("removes presences for voices no longer in the list", () => {
    const layer = new VoiceLayer(800, 600);
    layer.update([makeVoice("I"), makeVoice("II")], "elevated");
    layer.update([makeVoice("I")], "elevated");
    expect((layer as any).presences.size).toBe(1);
    expect((layer as any).presences.has("I")).toBe(true);
  });

  it("clears all presences when voices is empty", () => {
    const layer = new VoiceLayer(800, 600);
    layer.update([makeVoice("I")], "elevated");
    layer.update([], "elevated");
    expect((layer as any).presences.size).toBe(0);
  });

  it("sets voices inactive when thresholdState is not elevated", () => {
    const layer = new VoiceLayer(800, 600);
    layer.update([makeVoice("I", true)], "ground");
    const presence = (layer as any).presences.get("I");
    expect((presence as any).voice.active).toBe(false);
  });
});
