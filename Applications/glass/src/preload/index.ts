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
});
