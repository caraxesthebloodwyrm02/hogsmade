import { useNukeStore } from "../stores/nuke-store.ts";
import { ROW_META } from "../types/nuke.ts";
import type { KeyRow } from "../types/nuke.ts";
import { Key } from "./Key.tsx";

const ROWS: KeyRow[] = ["scan", "analysis", "zap"];
const ROW_CLASS: Record<KeyRow, string> = {
  scan: "row-scan",
  analysis: "row-analysis",
  zap: "row-zap",
};

export function Pad() {
  const knobs = useNukeStore((s) => s.knobs);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--nuke-surface)", border: "1px solid var(--nuke-border-dim)" }}
    >
      {ROWS.map((row) => {
        const meta = ROW_META[row];
        const rowKnobs = knobs.filter((k) => k.row === row);

        return (
          <div key={row} className={ROW_CLASS[row]}>
            {/* row label */}
            <div
              className="text-xs font-semibold uppercase tracking-widest mb-2 pl-1"
              style={{ color: "var(--row-accent)" }}
            >
              {meta.label}
            </div>

            {/* keys */}
            <div className="flex gap-2">
              {rowKnobs.map((knob) => (
                <Key key={knob.id} knob={knob} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
