import { Field } from "./field/Field";
import { FieldState } from "./state/FieldState";
import { SessionState } from "./state/SessionState";
import type { BridgeState } from "../../bridge/schema";

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
      ) => void;
      patchBlockPosition: (id: string, x: number, y: number) => void;
    };
  }
}

const canvas = document.getElementById("field") as HTMLCanvasElement;
const blockHost = document.getElementById("block-host") as HTMLDivElement;
const fieldState = new FieldState();
const field = new Field(canvas, fieldState, blockHost);

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

field.start();

window.glass.onBridgeUpdate((state) => {
  fieldState.update(state);
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
