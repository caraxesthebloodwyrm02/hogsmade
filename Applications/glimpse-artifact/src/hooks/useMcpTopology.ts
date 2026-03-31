import type { McpServerNode, McpEdge } from "@/components/phase4/types";
import { useDataSource } from "./useDataSource";

export interface UseMcpTopologyResult {
  nodes: McpServerNode[];
  edges: McpEdge[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

// ── Config schema (only the fields we need) ───────────────────────────

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

// ── Parser: config → topology ─────────────────────────────────────────

function deriveDescription(id: string, entry: McpServerEntry): string {
  const last = entry.args.at(-1) ?? "";
  const file = last.split("/").pop()?.replace(/\.(ts|py)$/, "") ?? id;
  return file.replace(/[_-]/g, " ");
}

function parseTopology(cfg: McpConfig): { nodes: McpServerNode[]; edges: McpEdge[] } {
  const entries = Object.entries(cfg.mcpServers);
  const isTsServer = (e: McpServerEntry) => e.command === "npx";

  // Nodes
  const nodes: McpServerNode[] = [
    { id: "shared-types", name: "shared-types", description: "Zod contracts, audit client, security policy", enabled: true, toolCount: 0, port: undefined },
    ...entries.map(([id, entry]) => ({
      id,
      name: id,
      description: deriveDescription(id, entry),
      enabled: true,
      toolCount: 0,
      port: undefined,
    })),
  ];

  // Edges
  const edges: McpEdge[] = [];
  const serverIds = new Set(entries.map(([id]) => id));

  for (const [id, entry] of entries) {
    // TS servers depend on shared-types
    if (isTsServer(entry)) {
      edges.push({ source: "shared-types", target: id, type: "dependency" });
    }

    // Servers with ECHOES_AUDIT_PATH share data with echoes-server
    if (entry.env?.ECHOES_AUDIT_PATH && id !== "echoes-server" && serverIds.has("echoes-server")) {
      edges.push({ source: "echoes-server", target: id, type: "dataflow", label: "audit.ndjson" });
    }

    // Servers with GRID_API_URL connect to grid-rag
    if (entry.env?.GRID_API_URL && serverIds.has("grid-rag")) {
      edges.push({ source: id, target: "grid-rag", type: "dataflow", label: entry.env.GRID_API_URL });
    }
  }

  return { nodes, edges };
}

// ── Fetcher ───────────────────────────────────────────────────────────

async function fetchTopology(signal: AbortSignal) {
  const res = await fetch("/data/mcp_config.json", { signal });
  if (!res.ok) throw new Error(`Failed to load MCP config (${res.status})`);
  const cfg: McpConfig = await res.json();
  return parseTopology(cfg);
}

// ── Mock fallback ─────────────────────────────────────────────────────

const MOCK_NODES: McpServerNode[] = [
  { id: "shared-types", name: "shared-types", description: "Zod contracts, audit client, security policy", enabled: true, toolCount: 0, port: undefined },
  { id: "afloat-server", name: "afloat-server", description: "Workflow orchestration", enabled: true, toolCount: 5, port: 3001 },
  { id: "echoes-server", name: "echoes-server", description: "Audit persistence", enabled: true, toolCount: 4, port: 3002 },
  { id: "grid-server", name: "grid-server", description: "GATE verification", enabled: true, toolCount: 6, port: 3003 },
  { id: "lots-server", name: "lots-server", description: "Experiment catalog", enabled: true, toolCount: 3, port: 3004 },
  { id: "maintain-server", name: "maintain-server", description: "System diagnostics", enabled: true, toolCount: 4, port: 3005 },
  { id: "pulse-server", name: "pulse-server", description: "Briefings & focus", enabled: true, toolCount: 5, port: 3006 },
  { id: "seeds-server", name: "seeds-server", description: "Ecosystem health", enabled: true, toolCount: 4, port: 3007 },
  { id: "grid-rag", name: "grid-rag", description: "RAG via MCP (Python)", enabled: true, toolCount: 3, port: 8000 },
];

const MOCK_EDGES: McpEdge[] = [
  { source: "shared-types", target: "afloat-server", type: "dependency" },
  { source: "shared-types", target: "echoes-server", type: "dependency" },
  { source: "shared-types", target: "grid-server", type: "dependency" },
  { source: "shared-types", target: "lots-server", type: "dependency" },
  { source: "shared-types", target: "maintain-server", type: "dependency" },
  { source: "shared-types", target: "pulse-server", type: "dependency" },
  { source: "shared-types", target: "seeds-server", type: "dependency" },
  { source: "echoes-server", target: "lots-server", type: "dataflow", label: "audit.ndjson" },
  { source: "echoes-server", target: "maintain-server", type: "dataflow", label: "audit.ndjson" },
  { source: "echoes-server", target: "pulse-server", type: "dataflow", label: "audit.ndjson" },
  { source: "grid-server", target: "grid-rag", type: "dataflow", label: "HTTP :8080" },
];

interface TopologyData {
  nodes: McpServerNode[];
  edges: McpEdge[];
}

const MOCK_TOPOLOGY: TopologyData = {
  nodes: MOCK_NODES,
  edges: MOCK_EDGES,
};

export function useMcpTopology(): UseMcpTopologyResult {
  const { data, loading, error, retry } = useDataSource<TopologyData>({
    fetcher: fetchTopology,
    mock: MOCK_TOPOLOGY,
  });

  return { nodes: data.nodes, edges: data.edges, loading, error, retry };
}
