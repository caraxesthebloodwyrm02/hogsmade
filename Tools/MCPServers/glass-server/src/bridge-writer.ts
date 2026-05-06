import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { dirname } from "path";
import { homedir } from "os";

const DEFAULT_BRIDGE_PATH = `${homedir()}/.caraxes/field-bridge.json`;

let writeSeq = 0;
let writeLock: Promise<void> = Promise.resolve();

export function getBridgePath(): string {
  return process.env.GLASS_BRIDGE_PATH ?? DEFAULT_BRIDGE_PATH;
}

export async function readBridge(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(getBridgePath(), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[glass-server] bridge read failed at ${getBridgePath()}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return {};
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv != null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv != null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

async function doWrite(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bridgePath = getBridgePath();
  await mkdir(dirname(bridgePath), { recursive: true, mode: 0o700 });

  const current = await readBridge();
  const merged = deepMerge(current, patch);
  merged.timestamp = new Date().toISOString();

  const seq = ++writeSeq;
  const tmp = `${bridgePath}.tmp.${process.pid}.${seq}`;
  await writeFile(tmp, JSON.stringify(merged, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, bridgePath);

  return merged;
}

export async function writeBridge(
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let result!: Record<string, unknown>;
  const prev = writeLock;
  writeLock = prev.then(() =>
    doWrite(patch).then((r) => {
      result = r;
    }),
  );
  await writeLock;
  return result;
}
