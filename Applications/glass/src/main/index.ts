import { app, BrowserWindow, session, ipcMain } from "electron";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  startBridgeWatcher,
  patchBridgeBlock,
  appendConversationTurn,
  addBridgeBlock,
  patchBridgeBlockPosition,
  deleteBridgeBlock,
  setBridgeFieldProfile,
  setBridgeThresholdState,
  getPreviousThresholdState,
  touchBridgeTimestamp,
} from "./bridge-watcher";
import { loadFieldProfile } from "./field-profile";
import { searchLocalSemantic, rebuildIndexDebounced } from "./local-search";
import type { BridgeState, FieldProfile } from "../../bridge/schema";

if (process.platform === "linux" && process.env.NODE_ENV === "development") {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.disableHardwareAcceleration();
}

app.enableSandbox();

let latestBridgeState: BridgeState | null = null;
let activeFieldProfile: FieldProfile | null = null;

async function readInventoryAssets(): Promise<Record<string, unknown>[]> {
  const inventoryPath =
    process.env.GLASS_INVENTORY_PATH ?? path.join(os.homedir(), ".caraxes", "glass-inventory.json");
  try {
    const raw = await readFile(inventoryPath, "utf-8");
    return JSON.parse(raw).assets || [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[glass] bridge:list-assets failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return [];
  }
}

const USEB_SCRIPT =
  process.env.GLASS_USEB_SCRIPT_PATH ??
  path.join(os.homedir(), "x-change", "scripts", "useb_submit.py");

function spawnUsebSubmission(): void {
  const studentId = process.env.GLASS_STUDENT_ID;
  if (!studentId) {
    console.warn("[glass] USEB auto-ingest skipped — GLASS_STUDENT_ID not set");
    return;
  }
  const args = [
    USEB_SCRIPT,
    "--student-id", studentId,
    "--contract-satisfied",
    "--no-grid",
  ];
  const rewardId = process.env.GLASS_REWARD_ID;
  if (rewardId) {
    args.push("--reward-id", rewardId);
  }
  const python = process.env.GLASS_PYTHON_PATH ?? "python3";
  try {
    const child = spawn(python, args, {
      env: process.env,
      stdio: "ignore",
      detached: true,
    });
    child.on("error", (err) => {
      console.warn(`[glass] USEB auto-ingest failed to start: ${err.message}`);
    });
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[glass] USEB auto-ingest exited with code ${code}`);
      }
    });
    child.unref();
  } catch (err) {
    console.warn(
      `[glass] USEB auto-ingest spawn error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function sendBridgeUpdate(win: BrowserWindow, state: BridgeState): void {
  if (win.isDestroyed()) return;
  win.webContents.send("bridge:update", state);
}

function broadcastBridgeUpdate(state: BridgeState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendBridgeUpdate(win, state);
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0c",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file://") ||
      (process.env.NODE_ENV === "development" && url.startsWith("http://localhost:"));
    if (!allowed) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'; font-src 'self' data:; img-src 'self' data:; worker-src 'self' blob:; media-src 'self'",
        ],
      },
    });
  });

  win.webContents.on("did-finish-load", () => {
    if (latestBridgeState) sendBridgeUpdate(win, latestBridgeState);
  });

  if (process.env.NODE_ENV === "development") {
    win.loadURL("http://localhost:5173");
    if (process.env.GLASS_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

function asObject(payload: unknown, channel: string): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] ${channel} rejected — payload is not an object`);
    return null;
  }
  return payload as Record<string, unknown>;
}

ipcMain.on("bridge:patch-block", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:patch-block");
  if (!p) return;
  const { id, content } = p;
  if (typeof id !== "string" || typeof content !== "string") {
    console.warn(
      `[glass] bridge:patch-block rejected — id or content is not a string (id: ${typeof id}, content: ${typeof content})`,
    );
    return;
  }
  patchBridgeBlock(id, content);
});

ipcMain.on("bridge:send-message", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:send-message");
  if (!p) return;
  const { text } = p;
  if (typeof text !== "string") {
    console.warn(`[glass] bridge:send-message rejected — text is not a string`);
    return;
  }
  appendConversationTurn(text);
});

ipcMain.on("bridge:add-block", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:add-block");
  if (!p) return;
  if (typeof p.type !== "string" || typeof p.language !== "string") {
    console.warn(`[glass] bridge:add-block rejected — missing type or language`);
    return;
  }
  addBridgeBlock({
    type: p.type,
    language: p.language,
    content: typeof p.content === "string" ? p.content : "",
    position:
      p.position && typeof p.position === "object"
        ? {
            x: Number((p.position as Record<string, unknown>).x) || 0,
            y: Number((p.position as Record<string, unknown>).y) || 0,
          }
        : { x: 0, y: 0 },
    origin: typeof p.origin === "string" ? p.origin : "user",
    asset: p.asset && typeof p.asset === "object" ? p.asset : undefined,
  });
});

ipcMain.on("bridge:patch-block-position", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:patch-block-position");
  if (!p) return;
  const { id, x, y } = p;
  if (typeof id !== "string" || typeof x !== "number" || typeof y !== "number") {
    console.warn(`[glass] bridge:patch-block-position rejected — invalid id, x, or y`);
    return;
  }
  patchBridgeBlockPosition(id, x, y);
});

ipcMain.on("bridge:delete-block", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:delete-block");
  if (!p) return;
  const { id } = p;
  if (typeof id !== "string") {
    console.warn(`[glass] bridge:delete-block rejected — id is not a string`);
    return;
  }
  deleteBridgeBlock(id);
});

ipcMain.handle("bridge:list-assets", async () => {
  return readInventoryAssets();
});

ipcMain.handle("search:semantic", async (_event, payload: unknown) => {
  const query =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { query?: unknown }).query === "string"
      ? (payload as { query: string }).query
      : "";
  const limit =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { limit?: unknown }).limit === "number"
      ? Math.max(1, Math.min(20, (payload as { limit: number }).limit))
      : 8;
  if (!query.trim()) return [];
  const assets = await readInventoryAssets();
  return searchLocalSemantic(query, latestBridgeState, assets, limit);
});

ipcMain.handle("config:get-field-profile", async () => {
  return activeFieldProfile;
});

ipcMain.on("bridge:trigger-ceremony", (_event, payload: unknown) => {
  const p = asObject(payload, "bridge:trigger-ceremony");
  if (!p) return;
  const { state } = p;
  if (typeof state !== "string") {
    console.warn("[glass] bridge:trigger-ceremony rejected — state is not a string");
    return;
  }
  setBridgeThresholdState(state as ThresholdState);
  const prev = getPreviousThresholdState();
  if (state === "elevated" || (state === "returning" && prev === "elevated")) {
    spawnUsebSubmission();
  }
});

app.whenReady().then(() => {
  const loadedProfile = loadFieldProfile(app.getAppPath());
  activeFieldProfile = loadedProfile.profile;
  setBridgeFieldProfile(loadedProfile.profile);
  console.log(
    `[glass] loaded field-profile from ${loadedProfile.resolvedPath}${
      loadedProfile.usedOverride ? " (override)" : ""
    }`,
  );

  createWindow();

  startBridgeWatcher((state) => {
    latestBridgeState = state;
    broadcastBridgeUpdate(state);

    readInventoryAssets()
      .then((assets) => rebuildIndexDebounced(state, assets as any))
      .catch((err) =>
        console.warn(
          `[glass] index rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBridgeWatcher();
    app.quit();
  }
});
