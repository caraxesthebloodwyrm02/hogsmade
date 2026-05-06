import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname } from "path";

const DEFAULT_INVENTORY_PATH = `${homedir()}/.caraxes/glass-inventory.json`;

let writeSeq = 0;
let writeLock: Promise<void> = Promise.resolve();

export interface InventoryAssetRecord {
  ledger_id: string;
  block_id: string;
  category: string;
  rarity: string;
  label: string;
  glyph?: string;
  content: string;
  source_ceremony: string;
  source_session: string;
  acquired_at: string;
  created_at: string;
}

export interface InventoryState {
  version: 1;
  assets: InventoryAssetRecord[];
  updated_at: string;
}

export function getInventoryPath(): string {
  return process.env.GLASS_INVENTORY_PATH ?? DEFAULT_INVENTORY_PATH;
}

export async function readInventory(): Promise<InventoryState> {
  try {
    const raw = await readFile(getInventoryPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<InventoryState>;
    return {
      version: 1,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      updated_at:
        typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[glass-server] inventory read failed at ${getInventoryPath()}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { version: 1, assets: [], updated_at: new Date().toISOString() };
  }
}

async function writeInventory(state: InventoryState): Promise<InventoryState> {
  const inventoryPath = getInventoryPath();
  await mkdir(dirname(inventoryPath), { recursive: true, mode: 0o700 });

  const seq = ++writeSeq;
  const tmp = `${inventoryPath}.tmp.${process.pid}.${seq}`;
  await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, inventoryPath);
  return state;
}

export async function appendInventoryAsset(
  record: Omit<InventoryAssetRecord, "ledger_id" | "created_at"> & {
    ledger_id?: string;
    created_at?: string;
  },
): Promise<InventoryAssetRecord> {
  let result!: InventoryAssetRecord;
  const prev = writeLock;
  writeLock = prev.then(async () => {
    const current = await readInventory();
    const now = new Date().toISOString();
    result = {
      ...record,
      ledger_id:
        record.ledger_id ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: record.created_at ?? now,
    };
    await writeInventory({
      version: 1,
      assets: [...current.assets, result],
      updated_at: now,
    });
  });
  await writeLock;
  return result;
}
