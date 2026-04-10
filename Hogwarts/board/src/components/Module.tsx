import { Server, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { BoardKnob, House } from "../types/board";
import { HOUSE_META } from "../types/board";
import { getServersByHouse } from "../data/tool-registry";
import { Knob } from "./Knob";

interface ModuleProps {
  house: House;
  knobs: BoardKnob[];
  selectedKnobId: string | null;
  onKnobClick: (id: string) => void;
}

export function Module({ house, knobs, selectedKnobId, onKnobClick }: ModuleProps) {
  const meta = HOUSE_META[house];
  const servers = getServersByHouse(house);
  const [collapsed, setCollapsed] = useState(false);

  const knobsByServer = new Map<string, BoardKnob[]>();
  for (const knob of knobs) {
    const list = knobsByServer.get(knob.server) ?? [];
    list.push(knob);
    knobsByServer.set(knob.server, list);
  }

  const readyCount = knobs.filter((k) => k.status === "ready").length;

  return (
    <section
      className="rounded-2xl border border-panel-border bg-panel shadow-md overflow-hidden"
      aria-label={`${meta.label} house module`}
    >
      {/* Module header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls={`module-${house}`}
        className="w-full flex items-center gap-3 px-5 py-3.5 cursor-pointer
          hover:bg-panel-light/60 transition-colors duration-200 press-scale"
      >
        {/* House indicator with glow */}
        <div className="relative">
          <div
            className="w-3.5 h-3.5 rounded-full"
            style={{
              backgroundColor: meta.color,
              boxShadow: `0 0 10px ${meta.color}50, 0 0 4px ${meta.color}30`,
            }}
          />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-text-primary">{meta.label}</span>
          <span className="text-xs text-text-muted ml-2 italic">{meta.motto}</span>
        </div>
        {/* Stats pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary tabular-nums bg-panel-light/50 px-2 py-0.5 rounded-md">
            {readyCount}/{knobs.length}
          </span>
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform duration-200 ${
              collapsed ? "-rotate-90" : ""
            }`}
          />
        </div>
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div id={`module-${house}`} className="animate-expand px-4 pb-4 space-y-4">
          {servers.map((server) => {
            const serverKnobs = knobsByServer.get(server.key) ?? [];
            if (serverKnobs.length === 0) return null;

            return (
              <div key={server.key}>
                {/* Server label with left accent */}
                <div className="flex items-center gap-2 px-1 py-2">
                  <div
                    className="w-0.5 h-3 rounded-full"
                    style={{ backgroundColor: meta.color, opacity: 0.4 }}
                  />
                  <Server size={11} className="text-text-muted" />
                  <span className="text-xs text-text-tertiary uppercase tracking-wider font-medium">
                    {server.name}
                  </span>
                  <span className="text-[10px] text-text-muted ml-auto px-1.5 py-0.5 rounded bg-panel-light/30">
                    {server.runtime}
                  </span>
                </div>

                {/* Knob grid with stagger */}
                <div className="flex flex-wrap gap-2">
                  {serverKnobs.map((knob, i) => (
                    <Knob
                      key={knob.id}
                      knob={knob}
                      isSelected={selectedKnobId === knob.id}
                      onClick={() => onKnobClick(knob.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
