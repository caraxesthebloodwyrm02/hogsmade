import { app, BrowserWindow, session, ipcMain } from "electron";
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
} from "./bridge-watcher";
import { loadFieldProfile } from "./field-profile";
import { searchLocalSemantic } from "./local-search";
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

ipcMain.on("bridge:patch-block", (_event, payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] bridge:patch-block rejected — payload is not an object`);
    return;
  }
  const { id, content } = payload as Record<string, unknown>;
  if (typeof id !== "string" || typeof content !== "string") {
    console.warn(
      `[glass] bridge:patch-block rejected — id or content is not a string (id: ${typeof id}, content: ${typeof content})`,
    );
    return;
  }
  patchBridgeBlock(id, content);
});

ipcMain.on("bridge:send-message", (_event, payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] bridge:send-message rejected — payload is not an object`);
    return;
  }
  const { text } = payload as Record<string, unknown>;
  if (typeof text !== "string") {
    console.warn(`[glass] bridge:send-message rejected — text is not a string`);
    return;
  }
  appendConversationTurn(text);
});

ipcMain.on("bridge:add-block", (_event, payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] bridge:add-block rejected — payload is not an object`);
    return;
  }
  const p = payload as Record<string, unknown>;
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
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] bridge:patch-block-position rejected — payload is not an object`);
    return;
  }
  const { id, x, y } = payload as Record<string, unknown>;
  if (typeof id !== "string" || typeof x !== "number" || typeof y !== "number") {
    console.warn(`[glass] bridge:patch-block-position rejected — invalid id, x, or y`);
    return;
  }
  patchBridgeBlockPosition(id, x, y);
});

ipcMain.on("bridge:delete-block", (_event, payload: unknown) => {
  if (typeof payload !== "object" || payload === null) {
    console.warn(`[glass] bridge:delete-block rejected — payload is not an object`);
    return;
  }
  const { id } = payload as Record<string, unknown>;
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
  if (typeof payload !== "object" || payload === null) {
    console.warn("[glass] bridge:trigger-ceremony rejected — payload is not an object");
    return;
  }
  const { state } = payload as Record<string, unknown>;
  if (typeof state !== "string") {
    console.warn("[glass] bridge:trigger-ceremony rejected — state is not a string");
    return;
  }
  setBridgeThresholdState(state);
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
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
