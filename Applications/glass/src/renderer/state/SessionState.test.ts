import { describe, it, expect, beforeEach } from "vitest";
import { SessionState, type SessionData } from "./SessionState";

const mockStorage = (): Storage => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
};

describe("SessionState", () => {
  let storage: Storage;
  let session: SessionState;

  beforeEach(() => {
    storage = mockStorage();
    session = new SessionState(storage);
  });

  it("starts with default values when storage is empty", () => {
    const data = session.get();
    expect(data.sessionId).toBe("");
    expect(data.blockPositions).toEqual({});
    expect(data.cameraOffset).toEqual({ x: 0, y: 0 });
  });

  it("persists and restores session data", () => {
    session.update({ sessionId: "abc-123" });
    const fresh = new SessionState(storage);
    expect(fresh.get().sessionId).toBe("abc-123");
  });

  it("merges partial updates", () => {
    session.update({ sessionId: "s1" });
    session.update({ cameraOffset: { x: 100, y: 50 } });
    const data = session.get();
    expect(data.sessionId).toBe("s1");
    expect(data.cameraOffset).toEqual({ x: 100, y: 50 });
  });

  it("persists block positions", () => {
    session.update({
      blockPositions: { b1: { x: 10, y: 20 }, b2: { x: 30, y: 40 } },
    });
    const fresh = new SessionState(storage);
    expect(fresh.get().blockPositions).toEqual({
      b1: { x: 10, y: 20 },
      b2: { x: 30, y: 40 },
    });
  });

  it("handles corrupted storage gracefully", () => {
    storage.setItem("glass:session", "not-valid-json");
    const fresh = new SessionState(storage);
    expect(fresh.get().sessionId).toBe("");
  });
});
