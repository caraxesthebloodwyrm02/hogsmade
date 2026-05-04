import type { BridgeBlock, BlockType, BlockOrigin, BlockPosition } from "../../../bridge/schema";

export interface ManagedBlock {
  id: string;
  type: BlockType;
  language: string;
  content: string;
  position: BlockPosition;
  origin: BlockOrigin;
  spawnAge: number;
}

let nextLocalId = 1;

export class BlockManager {
  private blocks: Map<string, ManagedBlock> = new Map();

  getAll(): ManagedBlock[] {
    return [...this.blocks.values()];
  }

  get(id: string): ManagedBlock | undefined {
    return this.blocks.get(id);
  }

  sync(bridgeBlocks: BridgeBlock[]): void {
    const incoming = new Set(bridgeBlocks.map((b) => b.id));

    for (const key of this.blocks.keys()) {
      if (!incoming.has(key)) this.blocks.delete(key);
    }

    for (const b of bridgeBlocks) {
      this.blocks.set(b.id, {
        id: b.id,
        type: b.type,
        language: b.language,
        content: b.content,
        position: { ...b.position },
        origin: b.origin,
        spawnAge: this.blocks.get(b.id)?.spawnAge ?? 0,
      });
    }
  }

  create(
    type: BlockType,
    language: string,
    content: string,
    position: BlockPosition,
    origin: BlockOrigin,
  ): ManagedBlock {
    const id = `local-${nextLocalId++}`;
    const block: ManagedBlock = {
      id,
      type,
      language,
      content,
      position: { ...position },
      origin,
      spawnAge: 0,
    };
    this.blocks.set(id, block);
    return block;
  }

  move(id: string, x: number, y: number): void {
    const block = this.blocks.get(id);
    if (block) block.position = { x, y };
  }

  destroy(id: string): void {
    this.blocks.delete(id);
  }

  tick(dt: number): void {
    for (const block of this.blocks.values()) {
      block.spawnAge += dt;
    }
  }
}
