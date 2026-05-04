import { Field } from "./field/Field";
import { FieldState } from "./state/FieldState";
import { SessionState } from "./state/SessionState";
import { GlobalHeader } from "./blocks/GlobalHeader";
import { SimilarityPane } from "./blocks/SimilarityPane";
import type {
  AssetMeta,
  BridgeState,
  FieldProfile,
  SemanticSearchResult,
} from "../../bridge/schema";

declare global {
  interface Window {
    glass: {
      onBridgeUpdate: (cb: (state: BridgeState) => void) => void;
      patchBlock: (id: string, content: string) => void;
      sendMessage: (text: string) => void;
      addBlock: (
        type: string,
        language: string,
        content: string,
        position: { x: number; y: number },
        asset?: AssetMeta,
      ) => void;
      patchBlockPosition: (id: string, x: number, y: number) => void;
      deleteBlock: (id: string) => void;
      listAssets: () => Promise<AssetMeta[]>;
      searchSemantic: (query: string, limit?: number) => Promise<SemanticSearchResult[]>;
      getFieldProfile: () => Promise<FieldProfile | null>;
      triggerCeremony: (state: string) => void;
    };
  }
}

const canvas = document.getElementById("field") as HTMLCanvasElement;
const blockHost = document.getElementById("block-host") as HTMLDivElement;
const fieldState = new FieldState();
const field = new Field(canvas, fieldState, blockHost);

let pendingBridgeState: BridgeState | null = null;
let bridgeConsumerReady = false;

window.glass.onBridgeUpdate((state) => {
  pendingBridgeState = state;
  if (bridgeConsumerReady) {
    fieldState.update(state);
  }
});

async function bootstrap(): Promise<void> {
  const fieldProfile = await window.glass.getFieldProfile();
  if (!fieldProfile) {
    throw new Error("Field profile unavailable from main process");
  }
  field.applyFieldProfile(fieldProfile);

  const session = new SessionState();
  const saved = session.get();
  if (saved.cameraOffset.x !== 0 || saved.cameraOffset.y !== 0) {
    field.restoreCameraOffset(saved.cameraOffset.x, saved.cameraOffset.y);
  }

  let cameraSaveTimer: ReturnType<typeof setTimeout> | null = null;
  field.onCameraPan((x, y) => {
    if (cameraSaveTimer) clearTimeout(cameraSaveTimer);
    cameraSaveTimer = setTimeout(() => {
      session.update({ cameraOffset: { x, y } });
    }, 300);
  });

  bridgeConsumerReady = true;
  if (pendingBridgeState) {
    fieldState.update(pendingBridgeState);
  }

  const headerHost = document.getElementById("global-header") as HTMLDivElement;
  if (headerHost) {
    new GlobalHeader(headerHost, {
      onRecenter: () => field.recenterCamera(),
      onSeed: () => triggerSeed(),
    });
  }

  function triggerSeed(): void {
    const camera = field.getCameraOffset();
    field.recenterCamera();
    window.glass.sendMessage(
      "Seed \u00b7 canvas center (0, 0) \u2014 returning from (" +
        Math.round(camera.x) +
        ", " +
        Math.round(camera.y) +
        ")",
    );
  }

  const paneHost = document.getElementById("similarity-pane") as HTMLDivElement | null;
  const similarityPane = paneHost
    ? new SimilarityPane(paneHost, {
        search: (query) => window.glass.searchSemantic(query, 8),
        onOpenChange: (open) => field.setPaneOpen(open),
        onSelect: (result) => {
          if (result.source === "block") {
            field.panToBlock(result.id);
          }
          similarityPane?.hide();
        },
      })
    : null;

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Home") {
      e.preventDefault();
      triggerSeed();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
      e.preventDefault();
      void similarityPane?.toggle();
      return;
    }
    if (e.key === "Escape" && similarityPane?.isOpen()) {
      e.preventDefault();
      similarityPane.hide();
    }
  });

  field.start();

  const userInput = document.getElementById("user-input") as HTMLInputElement;
  if (userInput) {
    const RECENTER_COMMANDS = new Set(["/home", "/origin", "/recenter"]);
    userInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const val = userInput.value.trim();
        if (RECENTER_COMMANDS.has(val.toLowerCase())) {
          userInput.value = "";
          field.recenterCamera();
          return;
        }
        if (val) {
          window.glass.sendMessage(val);
          userInput.value = "";
        }
      }
      if (e.key === "Escape") {
        userInput.blur();
      }
    });
  }
}

bootstrap().catch((err: unknown) => {
  console.error(
    `[glass] renderer bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
  );
});

const userInput = document.getElementById("user-input") as HTMLInputElement;
if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && userInput.value.trim()) {
      window.glass.sendMessage(userInput.value.trim());
      userInput.value = "";
    }
    if (e.key === "Escape") {
      userInput.blur();
    }
  });
}
