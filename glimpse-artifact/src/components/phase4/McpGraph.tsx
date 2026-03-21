import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import type { McpEdge, McpServerNode } from "./types";

interface McpGraphProps {
  nodes: McpServerNode[];
  edges: McpEdge[];
  loading: boolean;
}

interface LayoutNode extends McpServerNode {
  x: number;
  y: number;
}

function layoutNodes(nodes: McpServerNode[]): LayoutNode[] {
  const cx = 300;
  const cy = 220;
  const radius = 160;

  return nodes.map((node) => {
    if (node.id === "shared-types") {
      return { ...node, x: cx, y: cy };
    }
    const others = nodes.filter((n) => n.id !== "shared-types");
    const idx = others.findIndex((n) => n.id === node.id);
    const angle = (idx / others.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

const NODE_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  "shared-types": { fill: "rgba(245, 158, 11, 0.15)", stroke: "#f59e0b", glow: "rgba(245, 158, 11, 0.3)" },
  "grid-rag": { fill: "rgba(96, 165, 250, 0.15)", stroke: "#60a5fa", glow: "rgba(96, 165, 250, 0.3)" },
  default: { fill: "rgba(52, 211, 153, 0.12)", stroke: "#34d399", glow: "rgba(52, 211, 153, 0.3)" },
};

function nodeColor(id: string) {
  return NODE_COLORS[id] ?? NODE_COLORS.default;
}

export function McpGraph({ nodes, edges, loading }: McpGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const layout = useMemo(() => layoutNodes(nodes), [nodes]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layout) m.set(n.id, n);
    return m;
  }, [layout]);

  const selectedData = selectedNode ? nodeMap.get(selectedNode) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[460px]">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* SVG graph */}
      <svg
        viewBox="0 0 600 440"
        className="flex-1 max-h-[460px]"
        role="img"
        aria-label="MCP Server Dependency Graph"
      >
        {/* Glow filter definitions */}
        <defs>
          <filter id="glow-emerald" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const src = nodeMap.get(edge.source);
          const tgt = nodeMap.get(edge.target);
          if (!src || !tgt) return null;

          const isHighlighted =
            hoveredNode === edge.source || hoveredNode === edge.target;

          return (
            <g key={i}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isHighlighted ? "#34d399" : "var(--border-color)"}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeDasharray={edge.type === "dataflow" ? "6 3" : undefined}
                opacity={hoveredNode && !isHighlighted ? 0.15 : 0.6}
                className="transition-all duration-200"
              />
              {edge.label && isHighlighted && (
                <text
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2 - 6}
                  textAnchor="middle"
                  className="text-[9px] fill-ink-muted font-body"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {layout.map((node) => {
          const colors = nodeColor(node.id);
          const isHovered = hoveredNode === node.id;
          const isSelected = selectedNode === node.id;
          const r = node.id === "shared-types" ? 28 : 22;

          return (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => setSelectedNode(isSelected ? null : node.id)}
              className="cursor-pointer"
              filter={isHovered || isSelected ? "url(#glow-emerald)" : undefined}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={r + (isHovered ? 3 : 0)}
                fill={colors.fill}
                stroke={isSelected ? "#34d399" : colors.stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
                className="transition-all duration-200"
              />
              {node.enabled && (
                <circle cx={node.x + r - 4} cy={node.y - r + 4} r={4} fill="#34d399" stroke="var(--surface)" strokeWidth={1.5} />
              )}
              <text
                x={node.x}
                y={node.y + r + 14}
                textAnchor="middle"
                className={cn(
                  "font-body text-[10px]",
                  isHovered || isSelected ? "fill-ink font-medium" : "fill-ink-muted",
                )}
              >
                {node.name}
              </text>
              {node.toolCount > 0 && (
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  className="font-mono text-[11px] fill-ink font-bold"
                >
                  {node.toolCount}
                </text>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(10, 410)">
          <line x1={0} y1={5} x2={20} y2={5} stroke="var(--border-color)" strokeWidth={1} />
          <text x={24} y={8} className="text-[9px] fill-ink-muted font-body">dependency</text>
          <line x1={100} y1={5} x2={120} y2={5} stroke="var(--border-color)" strokeWidth={1} strokeDasharray="6 3" />
          <text x={124} y={8} className="text-[9px] fill-ink-muted font-body">dataflow</text>
        </g>
      </svg>

      {/* Sidebar detail panel */}
      {selectedData && (
        <div className="w-56 shrink-0 rounded-lg border border-border-color bg-canvas-surface p-4 space-y-3 self-start shadow-token-sm card-glow">
          <div>
            <h3 className="font-heading text-sm font-bold text-ink">{selectedData.name}</h3>
            <p className="text-xs text-ink-muted mt-1">{selectedData.description}</p>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-ink-muted font-body">Status</span>
              <span className={selectedData.enabled ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
                {selectedData.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted font-body">Tools</span>
              <span className="text-ink font-medium">{selectedData.toolCount}</span>
            </div>
            {selectedData.port && (
              <div className="flex justify-between">
                <span className="text-ink-muted font-body">Port</span>
                <span className="text-ink">{selectedData.port}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink-muted font-body">Dependencies</span>
              <span className="text-ink font-medium">
                {edges.filter((e) => e.target === selectedData.id && e.type === "dependency").length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted font-body">Data flows</span>
              <span className="text-ink font-medium">
                {edges.filter((e) => (e.source === selectedData.id || e.target === selectedData.id) && e.type === "dataflow").length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
