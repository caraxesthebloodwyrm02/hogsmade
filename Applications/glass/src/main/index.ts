import { app, BrowserWindow, session, ipcMain } from "electron";
import path from "path";
import {
  startBridgeWatcher,
  patchBridgeBlock,
  appendConversationTurn,
  addBridgeBlock,
  patchBridgeBlockPosition,
} from "./bridge-watcher";

app.enableSandbox();

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

app.whenReady().then(() => {
  const win = createWindow();

  startBridgeWatcher((state) => {
    win.webContents.send("bridge:update", state);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
