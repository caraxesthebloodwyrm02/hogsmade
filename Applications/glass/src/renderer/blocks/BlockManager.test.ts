import { describe, it, expect, beforeEach } from "vitest";
import { BlockManager, type ManagedBlock } from "./BlockManager";
import type { BridgeBlock } from "../../../bridge/schema";

describe("BlockManager", () => {
  let mgr: BlockManager;

  beforeEach(() => {
    mgr = new BlockManager();
  });

  it("starts with no blocks", () => {
    expect(mgr.getAll()).toEqual([]);
  });

  it("syncs blocks from bridge state", () => {
    const bridgeBlocks: BridgeBlock[] = [
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "const x = 1;",
        position: { x: 100, y: 200 },
        origin: "agent",
      },
      {
        id: "b2",
        type: "note",
        language: "text",
        content: "a note",
        position: { x: 300, y: 400 },
        origin: "user",
      },
    ];
    mgr.sync(bridgeBlocks);
    expect(mgr.getAll()).toHaveLength(2);
  });

  it("preserves existing blocks on re-sync", () => {
    const blocks: BridgeBlock[] = [
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "v1",
        position: { x: 10, y: 20 },
        origin: "agent",
      },
    ];
    mgr.sync(blocks);
    const first = mgr.get("b1");

    mgr.sync([
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "v2",
        position: { x: 10, y: 20 },
        origin: "agent",
      },
    ]);
    const second = mgr.get("b1");
    expect(second?.content).toBe("v2");
    expect(first).not.toBe(second);
  });

  it("removes blocks not in the sync set", () => {
    mgr.sync([
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "",
        position: { x: 0, y: 0 },
        origin: "agent",
      },
      {
        id: "b2",
        type: "note",
        language: "text",
        content: "",
        position: { x: 0, y: 0 },
        origin: "user",
      },
    ]);
    expect(mgr.getAll()).toHaveLength(2);

    mgr.sync([
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "",
        position: { x: 0, y: 0 },
        origin: "agent",
      },
    ]);
    expect(mgr.getAll()).toHaveLength(1);
    expect(mgr.get("b2")).toBeUndefined();
  });

  it("moves a block to a new position", () => {
    mgr.sync([
      {
        id: "b1",
        type: "code",
        language: "typescript",
        content: "",
        position: { x: 10, y: 20 },
        origin: "user",
      },
    ]);
    mgr.move("b1", 50, 60);
    expect(mgr.get("b1")?.position).toEqual({ x: 50, y: 60 });
  });

  it("creates a local block", () => {
    const block = mgr.create("code", "typescript", "", { x: 100, y: 200 }, "user");
    expect(block.id).toBeTruthy();
    expect(mgr.getAll()).toHaveLength(1);
  });

  it("destroys a block by id", () => {
    mgr.create("note", "text", "hello", { x: 0, y: 0 }, "user");
    const all = mgr.getAll();
    expect(all).toHaveLength(1);
    mgr.destroy(all[0].id);
    expect(mgr.getAll()).toHaveLength(0);
  });

  it("tracks spawn animation age for new blocks", () => {
    mgr.create("code", "typescript", "", { x: 100, y: 200 }, "agent");
    const block = mgr.getAll()[0];
    expect(block.spawnAge).toBe(0);
    mgr.tick(16);
    expect(mgr.getAll()[0].spawnAge).toBe(16);
  });
});
