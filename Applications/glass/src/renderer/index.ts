import { Field } from "./field/Field";
import { FieldState } from "./state/FieldState";
import type { BridgeState } from "../../bridge/schema";

declare global {
  interface Window {
    glass: {
      onBridgeUpdate: (cb: (state: BridgeState) => void) => void;
    };
  }
}

const canvas = document.getElementById("field") as HTMLCanvasElement;
const blockHost = document.getElementById("block-host") as HTMLDivElement;
const fieldState = new FieldState();
const field = new Field(canvas, fieldState, blockHost);

field.start();

window.glass.onBridgeUpdate((state) => {
  fieldState.update(state);
});
