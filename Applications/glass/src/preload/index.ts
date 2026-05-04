import { contextBridge, ipcRenderer } from "electron";
import type { BridgeState } from "../../bridge/schema";

contextBridge.exposeInMainWorld("glass", {
  onBridgeUpdate: (cb: (state: BridgeState) => void) => {
    ipcRenderer.removeAllListeners("bridge:update");
    ipcRenderer.on("bridge:update", (_event, state: BridgeState) => cb(state));
  },
  patchBlock: (id: string, content: string) => {
    ipcRenderer.send("bridge:patch-block", { id, content });
  },
  sendMessage: (text: string) => {
    ipcRenderer.send("bridge:send-message", { text });
  },
  addBlock: (
    type: string,
    language: string,
    content: string,
    position: { x: number; y: number },
  ) => {
    ipcRenderer.send("bridge:add-block", { type, language, content, position, origin: "user" });
  },
  patchBlockPosition: (id: string, x: number, y: number) => {
    ipcRenderer.send("bridge:patch-block-position", { id, x, y });
  },
  onSimilarityResults: (cb: (results: unknown[]) => void) => {
    ipcRenderer.removeAllListeners("pane:similarity-results");
    ipcRenderer.on("pane:similarity-results", (_event, results: unknown[]) => cb(results));
  },
  togglePane: (open: boolean) => {
    ipcRenderer.send("pane:toggle", { open });
  },
});
