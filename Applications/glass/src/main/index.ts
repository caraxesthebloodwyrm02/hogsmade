import { app, BrowserWindow, session, ipcMain } from "electron";
import path from "path";
import { startBridgeWatcher, patchBridgeBlock } from "./bridge-watcher";

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
