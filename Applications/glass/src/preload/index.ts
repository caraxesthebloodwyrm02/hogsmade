import { contextBridge, ipcRenderer } from "electron";
import type {
  AssetMeta,
  BridgeState,
  FieldProfile,
  SemanticSearchResult,
} from "../../bridge/schema";

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
    asset?: AssetMeta,
  ) => {
    ipcRenderer.send("bridge:add-block", {
      type,
      language,
      content,
      position,
      origin: "user",
      asset,
    });
  },
  patchBlockPosition: (id: string, x: number, y: number) => {
    ipcRenderer.send("bridge:patch-block-position", { id, x, y });
  },
  deleteBlock: (id: string) => {
    ipcRenderer.send("bridge:delete-block", { id });
  },
  listAssets: () => {
    return ipcRenderer.invoke("bridge:list-assets");
  },
  searchSemantic: (query: string, limit = 8) => {
    return ipcRenderer.invoke("search:semantic", { query, limit }) as Promise<
      SemanticSearchResult[]
    >;
  },
  getFieldProfile: () => {
    return ipcRenderer.invoke("config:get-field-profile") as Promise<FieldProfile | null>;
  },
  triggerCeremony: (state: string) => {
    ipcRenderer.send("bridge:trigger-ceremony", { state });
  },
});
