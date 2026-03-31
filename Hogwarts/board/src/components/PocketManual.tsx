import { BookOpen, Shield, Layers, Server } from "lucide-react";
import type { BoardKnob, House } from "../types/board";
import { HOUSE_META } from "../types/board";
import { SERVER_PROFILES } from "../data/tool-registry";

interface PocketManualProps {
  knobs: BoardKnob[];
  visibleHouses: House[];
}

export function PocketManual({ knobs, visibleHouses }: PocketManualProps) {
  const totalTools = knobs.length;
  const byHouse = visibleHouses.map((h) => ({
    house: h,
    meta: HOUSE_META[h],
    count: knobs.filter((k) => k.house === h).length,
  }));
  const serverCount = new Set(knobs.map((k) => k.server)).size;
  const totalParams = knobs.reduce((sum, k) => sum + k.parameters.length, 0);
  const requiredParams = knobs.reduce(
    (sum, k) => sum + k.parameters.filter((p) => p.required).length,
    0,
  );

  const governanceIssues = {
    descTooLong: knobs.filter((k) => k.description.length > 120).length,
    missingParamDesc: knobs.filter((k) =>
      k.parameters.some((p) => !p.description),
    ).length,
    nameTooLong: knobs.filter((k) => k.id.length > 40).length,
  };
  const totalIssues = Object.values(governanceIssues).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-panel-border bg-panel overflow-hidden shadow-md" role="complementary" aria-label="Board statistics">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
        <BookOpen size={12} className="text-text-muted" />
        <span className="text-[11px] text-text-muted uppercase tracking-widest font-medium">
          Pocket Manual
        </span>
      </div>

      <div className="p-4 space-y-5 text-xs">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: totalTools, label: "Tools", color: "var(--color-led-blue)" },
            { value: serverCount, label: "Servers", color: "var(--color-led-green)" },
            { value: totalParams, label: "Params", color: "var(--color-text-tertiary)" },
            { value: requiredParams, label: "Required", color: "var(--color-led-yellow)" },
          ].map(({ value, label, color }) => (
            <div key={label} className="rounded-xl bg-panel-light border border-panel-border/50 p-3 text-center">
              <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* House breakdown */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-2.5">
            <Layers size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Houses</span>
          </div>
          <div className="space-y-2">
            {byHouse.map(({ house, meta, count }) => (
              <div key={house} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color, boxShadow: `0 0 4px ${meta.color}30` }}
                />
                <span className="text-text-tertiary text-xs flex-1">{meta.label}</span>
                <span className="text-text-muted tabular-nums text-xs font-medium">{count}</span>
                <div className="w-14 h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${totalTools > 0 ? (count / totalTools) * 100 : 0}%`,
                      backgroundColor: meta.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Governance summary */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-2">
            <Shield size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Governance</span>
          </div>
          <div className={`rounded-xl p-3 ${totalIssues === 0 ? "bg-led-green/5 border border-led-green/20" : "bg-led-yellow/5 border border-led-yellow/20"}`}>
            {totalIssues === 0 ? (
              <span className="text-led-green text-xs font-medium">All checks passing</span>
            ) : (
              <div className="space-y-1.5">
                <span className="text-led-yellow text-xs font-medium">{totalIssues} warning{totalIssues !== 1 ? "s" : ""}</span>
                {governanceIssues.descTooLong > 0 && (
                  <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-led-yellow flex-shrink-0" />
                    {governanceIssues.descTooLong} descriptions &gt; 120 chars
                  </div>
                )}
                {governanceIssues.missingParamDesc > 0 && (
                  <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-led-yellow flex-shrink-0" />
                    {governanceIssues.missingParamDesc} params missing desc
                  </div>
                )}
                {governanceIssues.nameTooLong > 0 && (
                  <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-led-yellow flex-shrink-0" />
                    {governanceIssues.nameTooLong} names &gt; 40 chars
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Server list */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-2">
            <Server size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Active Servers</span>
          </div>
          <div className="space-y-1">
            {SERVER_PROFILES.filter((s) => visibleHouses.includes(s.house) && s.toolCount > 0).map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs py-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: HOUSE_META[s.house].color }}
                />
                <span className="text-text-muted flex-1 truncate">{s.name}</span>
                <span className="text-text-muted/60 text-[10px] bg-surface px-1.5 py-0.5 rounded">
                  {s.runtime === "python" ? "py" : "ts"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
