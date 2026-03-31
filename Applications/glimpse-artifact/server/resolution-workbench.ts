import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  buildKeywordBundleFromText,
  validateVocabulary,
  type KeywordBundle,
} from "./context-search";

export type ResolutionMode =
  | "recognition"
  | "reward"
  | "review"
  | "restriction"
  | "penalty";

export interface ResolutionWorkbenchRequest {
  prompt: string;
  context?: string;
  mode?: ResolutionMode;
  answers?: Array<{ questionId: string; answer: string }>;
  maxKeywords?: number;
}

export interface ResolutionCandidate {
  id: string;
  label: string;
  endpointType: "mcp_tool" | "http_route" | "file_surface";
  cluster: string;
  filePath: string;
  route?: string;
  score: number;
  confidence: number;
  matchedTerms: string[];
  reasons: string[];
  evidenceRefs: string[];
  recommendedAction: string;
}

export interface ResolutionQuestion {
  id: string;
  kind: "focused" | "random";
  question: string;
  rationale: string;
  affects: string[];
}

export interface ResolutionNode {
  id: string;
  label: string;
  type: "cluster" | "endpoint";
  cluster?: string;
  score: number;
}

export interface ResolutionEdge {
  source: string;
  target: string;
  type: "belongs_to" | "transfer";
  weight: number;
  label?: string;
}

export interface ResolutionCluster {
  id: string;
  label: string;
  score: number;
  candidateIds: string[];
  matchedTerms: string[];
}

export interface ResolutionHeatmapCell {
  keyword: string;
  clusterId: string;
  score: number;
}

export interface ResolutionArtifact {
  id: string;
  title: string;
  kind: "summary" | "candidate_ladder" | "question_queue" | "action_checklist";
  content: string;
  evidenceRefs: string[];
}

export interface ResolutionTurn {
  id: string;
  speaker: "planner" | "retriever" | "skeptic" | "synthesizer";
  text: string;
  evidenceRefs: string[];
}

export interface ResolutionWorkbenchResult {
  definition: {
    id: string;
    title: string;
    whatItIs: string;
    stageOrder: string[];
  };
  observation: {
    confidenceScore: number;
    confidenceSummary: string;
    ambiguitySummary: string;
    dominantCluster: string | null;
    dominantCandidate: string | null;
    recommendedNextStep: string;
    warnings: string[];
  };
  keywords: KeywordBundle;
  candidates: ResolutionCandidate[];
  graph: {
    nodes: ResolutionNode[];
    edges: ResolutionEdge[];
  };
  clusters: ResolutionCluster[];
  heatmap: ResolutionHeatmapCell[];
  questions: ResolutionQuestion[];
  artifacts: ResolutionArtifact[];
  transcript: ResolutionTurn[];
}

interface IndexedSource {
  id: string;
  path: string;
  title: string;
  cluster: string;
  content: string;
  lines: string[];
  tokens: Set<string>;
}

interface EndpointRecord {
  id: string;
  label: string;
  endpointType: "mcp_tool" | "http_route";
  cluster: string;
  filePath: string;
  route?: string;
  method?: string;
  tokens: Set<string>;
  snippet: string;
  evidenceRefs: string[];
}

const INCLUDED_ROOTS = [
  "glimpse-artifact/src",
  "glimpse-artifact/server",
  "glimpse-engine",
  "Tools/MCPServers/glimpse-server/src",
  "Tools/MCPServers/afloat-server/src",
  "Tools/MCPServers/echoes-server/src",
  "Tools/MCPServers/grid-server/src",
  "Tools/MCPServers/lots-server/src",
  "Tools/MCPServers/maintain-server/src",
  "Tools/MCPServers/pulse-server/src",
  "Tools/MCPServers/seeds-server/src",
  "Tools/MCPServers/eligibility-server/src",
  "Projects/GRID-main/src",
  "docs",
  "README.md",
] as const;

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".py",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".html",
]);

const SKIPPED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "tmp",
  ".vite",
  ".venv",
  "__pycache__",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "then",
  "than",
  "your",
  "their",
  "they",
  "them",
  "will",
  "would",
  "should",
  "could",
  "about",
  "after",
  "before",
  "while",
  "where",
  "when",
  "what",
  "which",
  "there",
  "here",
  "have",
  "has",
  "had",
  "been",
  "being",
  "using",
  "used",
  "only",
  "very",
  "more",
  "most",
  "some",
  "such",
  "like",
  "make",
  "made",
  "need",
  "needs",
  "tool",
  "tools",
  "plan",
  "plans",
  "user",
  "users",
  "context",
  "problem",
  "scenario",
]);

const MODE_HINTS: Record<ResolutionMode, string[]> = {
  recognition: [
    "recognition",
    "credit",
    "attribution",
    "contributor",
    "eligibility",
    "evaluate",
    "collect",
    "compile",
    "forms",
    "knowledge",
    "trace",
  ],
  reward: [
    "reward",
    "recognition",
    "credit",
    "eligibility",
    "evaluate",
    "collect",
    "compile",
    "promote",
    "hierarchy",
  ],
  review: [
    "review",
    "trace",
    "query",
    "knowledge",
    "audit",
    "lineage",
    "health",
    "confidence",
    "report",
  ],
  restriction: [
    "restriction",
    "admission",
    "penalty",
    "gate",
    "compliance",
    "contract",
    "corruption",
    "health",
    "enforce",
  ],
  penalty: [
    "penalty",
    "admission",
    "corruption",
    "contract",
    "accountability",
    "gate",
    "violation",
    "banner",
    "restrict",
    "health",
  ],
};

const RANDOM_QUESTIONS: Record<ResolutionMode, string[]> = {
  recognition: [
    "What real contribution would disappear from the story if this person or surface were removed?",
    "Is the missing thing authorship, sustained labor, or invisible maintenance?",
  ],
  reward: [
    "Should the result route to recognition, to credit documentation, or to a formal reward surface?",
    "Is the right endpoint a person-facing acknowledgment or a system-facing record?",
  ],
  review: [
    "Is the core uncertainty about actor identity, endpoint identity, or evidence quality?",
    "Which surface currently feels most causally central: route, tool, module, or trace chain?",
  ],
  restriction: [
    "Is the failure primarily unethical actor behavior or unstable endpoint behavior?",
    "Do you need a boundary, a review gate, or a direct restriction surface?",
  ],
  penalty: [
    "What concrete event or repeated pattern makes this more than a suspicion?",
    "Is the consequence supposed to land on an actor, a route, or a contract boundary?",
  ],
};

let cachedIndex:
  | {
    root: string;
    builtAt: number;
    sources: IndexedSource[];
    vocabulary: Set<string>;
    endpoints: EndpointRecord[];
  }
  | undefined;

function splitIdentifierParts(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 2);
}

function tokenize(value: string): string[] {
  return splitIdentifierParts(value).filter((part) => !STOPWORDS.has(part));
}

function clampMaxKeywords(value: number | undefined): number {
  return Math.min(12, Math.max(5, value ?? 8));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let index = 0;
  let count = 0;

  while (index !== -1) {
    index = lowerHaystack.indexOf(lowerNeedle, index);
    if (index !== -1) {
      count += 1;
      index += lowerNeedle.length;
    }
  }

  return count;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function createDefinition() {
  return {
    id: "glimpse-resolution-workbench",
    title: "Glimpse Resolution Workbench",
    whatItIs:
      "A deterministic planning and endpoint-resolution workflow that grounds a prompt in real repo surfaces, ranks candidate endpoints, exposes ambiguity, and asks targeted questions before consequence.",
    stageOrder: [
      "keyword grounding",
      "surface extraction",
      "candidate scoring",
      "cluster visibility",
      "question generation",
      "artifact synthesis",
    ],
  };
}

function createInitialResult(mode: ResolutionMode): ResolutionWorkbenchResult {
  return {
    definition: createDefinition(),
    observation: {
      confidenceScore: 0,
      confidenceSummary: "No evidence run yet.",
      ambiguitySummary: "No ambiguity analysis yet.",
      dominantCluster: null,
      dominantCandidate: null,
      recommendedNextStep:
        mode === "recognition" || mode === "reward"
          ? "Bring a concrete scenario and let the workbench identify the strongest recognition surface."
          : "Bring a concrete scenario and let the workbench identify the strongest review or restriction surface.",
      warnings: [],
    },
    keywords: {
      provider: "deterministic",
      accepted: [],
      rejectedTerms: [],
      unknownTerms: [],
      synthesisTrace: [],
    },
    candidates: [],
    graph: { nodes: [], edges: [] },
    clusters: [],
    heatmap: [],
    questions: [],
    artifacts: [],
    transcript: [],
  };
}

function extractTitle(relativePath: string, content: string): string {
  if (relativePath.endsWith(".md")) {
    const heading = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("# "));
    if (heading) return heading.replace(/^#\s+/, "");
  }

  return path.basename(relativePath);
}

async function walkTextFiles(targetPath: string): Promise<string[]> {
  const fileStat = await stat(targetPath);
  if (fileStat.isFile()) return [targetPath];

  const entries = await readdir(targetPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const nextPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkTextFiles(nextPath));
      continue;
    }

    if (entry.isFile() && INCLUDED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(nextPath);
    }
  }

  return files;
}

function extractSnippet(content: string, index: number): string {
  const start = Math.max(0, index - 120);
  const end = Math.min(content.length, index + 180);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function buildSource(relativePath: string, content: string): IndexedSource {
  const title = extractTitle(relativePath, content);
  const cluster = relativePath.split("/")[0] || "root";
  const tokens = new Set([
    ...tokenize(relativePath),
    ...tokenize(title),
    ...tokenize(content),
  ]);

  return {
    id: relativePath,
    path: relativePath,
    title,
    cluster,
    content,
    lines: content.split("\n"),
    tokens,
  };
}

function extractEndpoints(source: IndexedSource): EndpointRecord[] {
  const endpoints: EndpointRecord[] = [];
  const { content, path: filePath, cluster } = source;

  for (const match of content.matchAll(/server\.tool\(\s*['"`]([^'"`]+)['"`]/g)) {
    const label = match[1]?.trim();
    if (!label) continue;
    endpoints.push({
      id: `mcp:${filePath}:${label}`,
      label,
      endpointType: "mcp_tool",
      cluster,
      filePath,
      tokens: new Set([...source.tokens, ...tokenize(label)]),
      snippet: extractSnippet(content, match.index ?? 0),
      evidenceRefs: [filePath],
    });
  }

  for (const match of content.matchAll(/@router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi)) {
    const method = (match[1] ?? "get").toLowerCase();
    const route = match[2]?.trim();
    if (!route) continue;
    const label = `${method.toUpperCase()} ${route}`;
    endpoints.push({
      id: `route:${filePath}:${method}:${route}`,
      label,
      endpointType: "http_route",
      cluster,
      filePath,
      route,
      method,
      tokens: new Set([...source.tokens, ...tokenize(label), ...tokenize(route)]),
      snippet: extractSnippet(content, match.index ?? 0),
      evidenceRefs: [filePath],
    });
  }

  if (
    filePath.includes("/mcp/") ||
    filePath.endsWith("server.py") ||
    filePath.endsWith("server.ts")
  ) {
    for (const match of content.matchAll(/name\s*=\s*["']([a-zA-Z0-9._-]+)["']/g)) {
      const label = match[1]?.trim();
      if (!label) continue;
      endpoints.push({
        id: `named:${filePath}:${label}`,
        label,
        endpointType: "mcp_tool",
        cluster,
        filePath,
        tokens: new Set([...source.tokens, ...tokenize(label)]),
        snippet: extractSnippet(content, match.index ?? 0),
        evidenceRefs: [filePath],
      });
    }
  }

  return dedupeById(endpoints);
}

async function buildIndex(repoRoot: string): Promise<{
  sources: IndexedSource[];
  vocabulary: Set<string>;
  endpoints: EndpointRecord[];
}> {
  const files: string[] = [];

  for (const root of INCLUDED_ROOTS) {
    const absoluteRoot = path.join(repoRoot, root);
    try {
      files.push(...await walkTextFiles(absoluteRoot));
    } catch {
      // optional root
    }
  }

  const uniqueFiles = [...new Set(files)];
  const sources: IndexedSource[] = [];
  const vocabulary = new Set<string>();
  const endpoints: EndpointRecord[] = [];

  for (const absolutePath of uniqueFiles) {
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    const raw = await readFile(absolutePath, "utf8");
    const content = raw.slice(0, 120_000);
    const source = buildSource(relativePath, content);
    sources.push(source);

    for (const token of source.tokens) {
      vocabulary.add(token);
    }

    for (const endpoint of extractEndpoints(source)) {
      endpoints.push(endpoint);
      for (const token of endpoint.tokens) {
        vocabulary.add(token);
      }
    }
  }

  return {
    sources,
    vocabulary,
    endpoints: dedupeById(endpoints),
  };
}

async function getIndexedRepo(repoRoot: string): Promise<{
  sources: IndexedSource[];
  vocabulary: Set<string>;
  endpoints: EndpointRecord[];
}> {
  const now = Date.now();
  if (cachedIndex && cachedIndex.root === repoRoot && now - cachedIndex.builtAt < 15_000) {
    return {
      sources: cachedIndex.sources,
      vocabulary: cachedIndex.vocabulary,
      endpoints: cachedIndex.endpoints,
    };
  }

  const built = await buildIndex(repoRoot);
  cachedIndex = {
    root: repoRoot,
    builtAt: now,
    sources: built.sources,
    vocabulary: built.vocabulary,
    endpoints: built.endpoints,
  };
  return built;
}

function scoreEndpointCandidates(
  keywords: KeywordBundle,
  endpoints: EndpointRecord[],
  mode: ResolutionMode,
): ResolutionCandidate[] {
  const modeHints = new Set(MODE_HINTS[mode]);
  const candidates: ResolutionCandidate[] = [];

  for (const endpoint of endpoints) {
    let score = 0;
    const matchedTerms = new Set<string>();
    const reasons: string[] = [];
    const haystack = `${endpoint.label} ${endpoint.route ?? ""} ${endpoint.filePath} ${endpoint.snippet}`.toLowerCase();

    for (const keyword of keywords.accepted) {
      const terms = [keyword.term, keyword.canonicalTerm, ...keyword.expansions];
      let localScore = 0;

      for (const term of terms) {
        if (endpoint.tokens.has(term)) {
          localScore += 1.6;
        }

        if (endpoint.label.toLowerCase().includes(term)) {
          localScore += 2.8;
        }

        if ((endpoint.route ?? "").toLowerCase().includes(term)) {
          localScore += 2.2;
        }

        if (endpoint.filePath.toLowerCase().includes(term)) {
          localScore += 1.4;
        }

        const occurrences = countOccurrences(haystack, term);
        if (occurrences > 0) {
          localScore += Math.min(occurrences, 4) * 0.35;
        }
      }

      if (localScore > 0) {
        matchedTerms.add(keyword.canonicalTerm);
        score += localScore * keyword.weight;
      }
    }

    const modeOverlap = [...modeHints].filter((hint) => endpoint.tokens.has(hint));
    if (modeOverlap.length > 0) {
      score += 1.4 + modeOverlap.length * 0.35;
      reasons.push(`mode-aligned with ${modeOverlap.slice(0, 3).join(", ")}`);
    }

    if (endpoint.endpointType === "http_route" && (mode === "restriction" || mode === "penalty" || mode === "review")) {
      score += 0.65;
    }

    if (endpoint.endpointType === "mcp_tool" && (mode === "recognition" || mode === "reward" || mode === "review")) {
      score += 0.55;
    }

    if (score <= 0) continue;

    if (matchedTerms.size > 0) {
      reasons.push(`matched ${[...matchedTerms].slice(0, 4).join(", ")}`);
    }
    reasons.push(`surface ${endpoint.endpointType} in ${endpoint.cluster}`);

    candidates.push({
      id: endpoint.id,
      label: endpoint.label,
      endpointType: endpoint.endpointType,
      cluster: endpoint.cluster,
      filePath: endpoint.filePath,
      route: endpoint.route,
      score: Number(score.toFixed(2)),
      confidence: 0,
      matchedTerms: [...matchedTerms].slice(0, 6),
      reasons,
      evidenceRefs: endpoint.evidenceRefs,
      recommendedAction:
        mode === "recognition" || mode === "reward"
          ? "Review this surface as a recognition routing endpoint."
          : mode === "review"
            ? "Review this surface as a likely evidence or control endpoint."
            : "Review this surface before any restriction or penalty handoff.",
    });
  }

  const sorted = candidates.sort((left, right) => right.score - left.score).slice(0, 12);
  const topScore = sorted[0]?.score ?? 1;

  return sorted.map((candidate, index) => {
    const rankPenalty = index * 0.04;
    const confidence = Math.max(0.18, Math.min(0.97, candidate.score / topScore - rankPenalty + 0.08));
    return {
      ...candidate,
      confidence: Number(confidence.toFixed(2)),
    };
  });
}

function scoreFileSurfaces(
  keywords: KeywordBundle,
  sources: IndexedSource[],
  mode: ResolutionMode,
): ResolutionCandidate[] {
  const modeHints = new Set(MODE_HINTS[mode]);
  const candidates: ResolutionCandidate[] = [];

  for (const source of sources) {
    let score = 0;
    const matchedTerms = new Set<string>();
    const reasons: string[] = [];
    const haystack = `${source.title} ${source.path} ${source.content.slice(0, 3000)}`.toLowerCase();

    for (const keyword of keywords.accepted) {
      const terms = [keyword.term, keyword.canonicalTerm, ...keyword.expansions];
      let localScore = 0;

      for (const term of terms) {
        if (source.tokens.has(term)) {
          localScore += 1.1;
        }

        if (source.path.toLowerCase().includes(term)) {
          localScore += 1.5;
        }

        if (source.title.toLowerCase().includes(term)) {
          localScore += 1.9;
        }

        const occurrences = countOccurrences(haystack, term);
        if (occurrences > 0) {
          localScore += Math.min(occurrences, 5) * 0.22;
        }
      }

      if (localScore > 0) {
        matchedTerms.add(keyword.canonicalTerm);
        score += localScore * keyword.weight;
      }
    }

    const modeOverlap = [...modeHints].filter((hint) => source.tokens.has(hint));
    if (modeOverlap.length > 0) {
      score += 0.9 + modeOverlap.length * 0.25;
    }

    if (score <= 0) continue;

    if (matchedTerms.size > 0) {
      reasons.push(`matched ${[...matchedTerms].slice(0, 4).join(", ")}`);
    }
    reasons.push(`file surface in ${source.cluster}`);

    candidates.push({
      id: `file:${source.path}`,
      label: source.title,
      endpointType: "file_surface",
      cluster: source.cluster,
      filePath: source.path,
      score: Number(score.toFixed(2)),
      confidence: 0,
      matchedTerms: [...matchedTerms].slice(0, 6),
      reasons,
      evidenceRefs: [source.path],
      recommendedAction:
        mode === "recognition" || mode === "reward"
          ? "Review this file surface for hidden contribution, authorship, or recognition routing."
          : "Review this file surface for evidence, contract logic, or endpoint policy.",
    });
  }

  const sorted = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((candidate, index, all) => {
      const topScore = all[0]?.score ?? 1;
      const confidence = Math.max(0.16, Math.min(0.93, candidate.score / topScore - index * 0.05 + 0.06));
      return {
        ...candidate,
        confidence: Number(confidence.toFixed(2)),
      };
    });

  return sorted;
}

function mergeCandidates(
  endpointCandidates: ResolutionCandidate[],
  fileCandidates: ResolutionCandidate[],
): ResolutionCandidate[] {
  const merged = [...endpointCandidates, ...fileCandidates]
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const deduped: ResolutionCandidate[] = [];

  for (const candidate of merged) {
    const key = `${candidate.label}:${candidate.filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped.slice(0, 14);
}

function buildClusters(candidates: ResolutionCandidate[]): ResolutionCluster[] {
  const grouped = new Map<string, ResolutionCandidate[]>();

  for (const candidate of candidates) {
    const bucket = grouped.get(candidate.cluster) ?? [];
    bucket.push(candidate);
    grouped.set(candidate.cluster, bucket);
  }

  return [...grouped.entries()]
    .map(([cluster, bucket]) => {
      const matchedTerms = new Set<string>();
      for (const candidate of bucket) {
        for (const term of candidate.matchedTerms) {
          matchedTerms.add(term);
        }
      }

      return {
        id: cluster,
        label: cluster,
        score: Number(bucket.reduce((sum, candidate) => sum + candidate.score, 0).toFixed(2)),
        candidateIds: bucket.slice(0, 4).map((candidate) => candidate.id),
        matchedTerms: [...matchedTerms].slice(0, 6),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

function buildHeatmap(
  keywords: KeywordBundle,
  clusters: ResolutionCluster[],
  candidates: ResolutionCandidate[],
): ResolutionHeatmapCell[] {
  return keywords.accepted.flatMap((keyword) =>
    clusters.map((cluster) => {
      const score = candidates
        .filter((candidate) => candidate.cluster === cluster.id && candidate.matchedTerms.includes(keyword.canonicalTerm))
        .reduce((sum, candidate) => sum + candidate.score, 0);

      return {
        keyword: keyword.canonicalTerm,
        clusterId: cluster.id,
        score: Number(score.toFixed(2)),
      };
    }),
  );
}

function buildGraph(
  keywords: KeywordBundle,
  clusters: ResolutionCluster[],
  candidates: ResolutionCandidate[],
): { nodes: ResolutionNode[]; edges: ResolutionEdge[] } {
  const nodes: ResolutionNode[] = [
    ...clusters.map((cluster) => ({
      id: `cluster:${cluster.id}`,
      label: cluster.label,
      type: "cluster" as const,
      score: cluster.score,
    })),
    ...candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      type: "endpoint" as const,
      cluster: candidate.cluster,
      score: candidate.score,
    })),
  ];

  const edges: ResolutionEdge[] = candidates.map((candidate) => ({
    source: candidate.id,
    target: `cluster:${candidate.cluster}`,
    type: "belongs_to" as const,
    weight: Number(Math.max(0.35, candidate.score / 12).toFixed(2)),
    label: candidate.endpointType,
  }));

  for (let index = 0; index < clusters.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < clusters.length; nextIndex += 1) {
      const left = clusters[index];
      const right = clusters[nextIndex];
      const sharedTerms = keywords.accepted
        .map((keyword) => keyword.canonicalTerm)
        .filter((term) => left.matchedTerms.includes(term) && right.matchedTerms.includes(term));

      if (sharedTerms.length === 0) continue;

      edges.push({
        source: `cluster:${left.id}`,
        target: `cluster:${right.id}`,
        type: "transfer",
        weight: Number((0.45 + sharedTerms.length * 0.12).toFixed(2)),
        label: sharedTerms.slice(0, 2).join(", "),
      });
    }
  }

  return { nodes, edges };
}

function buildObservation(
  mode: ResolutionMode,
  validationWarnings: string[],
  candidates: ResolutionCandidate[],
  clusters: ResolutionCluster[],
): ResolutionWorkbenchResult["observation"] {
  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];
  const dominantCluster = clusters[0];
  const evidenceCount = candidates.reduce((sum, candidate) => sum + candidate.evidenceRefs.length, 0);
  const gap = topCandidate && secondCandidate
    ? topCandidate.score - secondCandidate.score
    : topCandidate
      ? topCandidate.score
      : 0;

  const confidenceBase = topCandidate
    ? Math.min(0.96, 0.28 + topCandidate.confidence * 0.42 + Math.min(0.18, gap * 0.03) + Math.min(0.12, evidenceCount * 0.01))
    : 0.12;

  const confidenceScore = Number(confidenceBase.toFixed(2));
  const confidenceSummary = confidenceScore >= 0.75
    ? "High confidence: a leading endpoint and cluster are materially ahead of the rest."
    : confidenceScore >= 0.5
      ? "Moderate confidence: there is signal, but the top endpoint still has meaningful competition."
      : "Low confidence: keep reading, answer the question queue, and avoid direct consequence.";

  const ambiguitySummary = !topCandidate
    ? "No grounded endpoint candidates yet."
    : secondCandidate && gap < 1.4
      ? `Ambiguity remains between ${topCandidate.label} and ${secondCandidate.label}.`
      : `The current endpoint field is led by ${topCandidate.label}.`;

  const recommendedNextStep = !topCandidate
    ? "Tighten the prompt with subsystem or event specifics."
    : confidenceScore < 0.5
      ? "Stay in read mode, preserve evidence, and answer the focused questions."
      : confidenceScore < 0.75
        ? "Use the top candidate as a review surface and narrow the remaining ambiguity."
        : mode === "recognition" || mode === "reward"
          ? "Route recognition or reward review through the top candidate after human confirmation."
          : "Route review or bounded consequence discussion through the top candidate after human confirmation.";

  return {
    confidenceScore,
    confidenceSummary,
    ambiguitySummary,
    dominantCluster: dominantCluster?.label ?? null,
    dominantCandidate: topCandidate?.label ?? null,
    recommendedNextStep,
    warnings: validationWarnings,
  };
}

export function buildQuestionQueue(
  mode: ResolutionMode,
  keywords: KeywordBundle,
  candidates: ResolutionCandidate[],
  observation: ResolutionWorkbenchResult["observation"],
): ResolutionQuestion[] {
  const questions: ResolutionQuestion[] = [];
  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];

  if (!topCandidate) {
    questions.push({
      id: "q-missing-surface",
      kind: "focused",
      question: "Which subsystem or event stream is this closest to right now?",
      rationale: "The resolver has not found a grounded endpoint surface yet.",
      affects: [],
    });
  }

  if (topCandidate && secondCandidate && Math.abs(topCandidate.score - secondCandidate.score) < 1.4) {
    questions.push({
      id: "q-close-candidates",
      kind: "focused",
      question: `Is the real target closer to ${topCandidate.label} or ${secondCandidate.label}, and why?`,
      rationale: "The top two candidates are too close to separate cleanly without user sharpening.",
      affects: [topCandidate.id, secondCandidate.id],
    });
  }

  if (keywords.unknownTerms.length > 0) {
    questions.push({
      id: "q-unknown-terms",
      kind: "focused",
      question: `These terms are still ungrounded: ${keywords.unknownTerms.slice(0, 4).join(", ")}. Which subsystem or artifact are they closest to?`,
      rationale: "Unknown terms are currently visible but not trusted by deterministic scoring.",
      affects: candidates.slice(0, 3).map((candidate) => candidate.id),
    });
  }

  if (mode === "recognition" || mode === "reward") {
    questions.push({
      id: "q-recognition-shape",
      kind: "focused",
      question: "Are you trying to identify the person, the proof trail, or the system surface that should carry the recognition?",
      rationale: "Recognition and reward modes need a clear distinction between contributor identity and delivery surface.",
      affects: candidates.slice(0, 4).map((candidate) => candidate.id),
    });
  }

  if (mode === "restriction" || mode === "penalty") {
    questions.push({
      id: "q-penalty-shape",
      kind: "focused",
      question: "Is the issue primarily unethical actor behavior, unhealthy endpoint behavior, or a contract boundary failure?",
      rationale: "Penalty and restriction modes should separate actor, endpoint, and contract causes before recommending consequence.",
      affects: candidates.slice(0, 4).map((candidate) => candidate.id),
    });
  }

  const randomPool = RANDOM_QUESTIONS[mode];
  const fallbackQuestion = randomPool[(keywords.accepted.length + candidates.length) % randomPool.length];
  questions.push({
    id: "q-random-bounded",
    kind: "random",
    question: fallbackQuestion,
    rationale: observation.confidenceScore < 0.75
      ? "A bounded displacement question can expose the hidden angle that deterministic ranking still lacks."
      : "A displacement question can test whether the top candidate remains stable under reframing.",
    affects: candidates.slice(0, 3).map((candidate) => candidate.id),
  });

  return dedupeById(questions).slice(0, 5);
}

function buildArtifacts(
  mode: ResolutionMode,
  observation: ResolutionWorkbenchResult["observation"],
  candidates: ResolutionCandidate[],
  questions: ResolutionQuestion[],
): ResolutionArtifact[] {
  const topCandidate = candidates[0];

  return [
    {
      id: "artifact-summary",
      title: "Resolution summary",
      kind: "summary",
      content: topCandidate
        ? `${observation.dominantCandidate} leads the current field in ${observation.dominantCluster ?? "mixed"} with ${Math.round(observation.confidenceScore * 100)}% confidence.`
        : "No grounded endpoint candidate is leading yet.",
      evidenceRefs: topCandidate?.evidenceRefs ?? [],
    },
    {
      id: "artifact-ladder",
      title: "Candidate ladder",
      kind: "candidate_ladder",
      content: candidates
        .slice(0, 4)
        .map((candidate, index) => `${index + 1}. ${candidate.label} (${candidate.endpointType}, ${candidate.cluster})`)
        .join(" | "),
      evidenceRefs: candidates.slice(0, 4).flatMap((candidate) => candidate.evidenceRefs),
    },
    {
      id: "artifact-questions",
      title: "Question queue",
      kind: "question_queue",
      content: questions.map((question) => question.question).join(" | "),
      evidenceRefs: candidates.slice(0, 3).flatMap((candidate) => candidate.evidenceRefs),
    },
    {
      id: "artifact-actions",
      title: "Action checklist",
      kind: "action_checklist",
      content: [
        `mode=${mode}`,
        `confidence=${Math.round(observation.confidenceScore * 100)}%`,
        `dominant=${observation.dominantCandidate ?? "none"}`,
        `next=${observation.recommendedNextStep}`,
      ].join(" | "),
      evidenceRefs: topCandidate?.evidenceRefs ?? [],
    },
  ];
}

function buildTranscript(
  observation: ResolutionWorkbenchResult["observation"],
  candidates: ResolutionCandidate[],
  questions: ResolutionQuestion[],
): ResolutionTurn[] {
  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];

  return [
    {
      id: "turn-planner",
      speaker: "planner",
      text: `The workbench grounded the prompt, ranked candidate endpoints, and mapped the strongest cluster field as ${observation.dominantCluster ?? "none"}.`,
      evidenceRefs: candidates.slice(0, 2).flatMap((candidate) => candidate.evidenceRefs),
    },
    {
      id: "turn-retriever",
      speaker: "retriever",
      text: topCandidate
        ? `The strongest endpoint surface is ${topCandidate.label} in ${topCandidate.filePath}.`
        : "No dominant endpoint surface has been grounded yet.",
      evidenceRefs: topCandidate?.evidenceRefs ?? [],
    },
    {
      id: "turn-skeptic",
      speaker: "skeptic",
      text: secondCandidate
        ? `The main ambiguity is between ${topCandidate?.label ?? "none"} and ${secondCandidate.label}.`
        : "The main risk is over-reading a thin evidence field.",
      evidenceRefs: secondCandidate?.evidenceRefs ?? [],
    },
    {
      id: "turn-synthesizer",
      speaker: "synthesizer",
      text: questions.length > 0
        ? `Next move: ${questions[0]?.question}`
        : observation.recommendedNextStep,
      evidenceRefs: candidates.slice(0, 3).flatMap((candidate) => candidate.evidenceRefs),
    },
  ];
}

export async function runResolutionWorkbench(
  request: ResolutionWorkbenchRequest,
  repoRoot: string,
): Promise<ResolutionWorkbenchResult> {
  const mode = request.mode ?? "review";
  const result = createInitialResult(mode);
  const prompt = request.prompt?.trim() ?? "";

  if (!prompt) {
    throw new Error("prompt is required");
  }

  const { sources, vocabulary, endpoints } = await getIndexedRepo(repoRoot);
  const answerText = (request.answers ?? [])
    .map((answer) => answer.answer.trim())
    .filter(Boolean)
    .join("\n");

  const keywords = buildKeywordBundleFromText(
    {
      scenarioText: prompt,
      optionalContext: [request.context ?? "", answerText].filter(Boolean).join("\n"),
      maxKeywords: clampMaxKeywords(request.maxKeywords),
      provider: "deterministic",
    },
    vocabulary,
  );

  const validation = validateVocabulary(keywords);
  const endpointCandidates = scoreEndpointCandidates(keywords, endpoints, mode);
  const fileCandidates = scoreFileSurfaces(keywords, sources, mode);
  const candidates = mergeCandidates(endpointCandidates, fileCandidates);
  const clusters = buildClusters(candidates);
  const heatmap = buildHeatmap(keywords, clusters, candidates);
  const graph = buildGraph(keywords, clusters, candidates);
  const observation = buildObservation(mode, validation.warnings, candidates, clusters);
  const questions = buildQuestionQueue(mode, keywords, candidates, observation);
  const artifacts = buildArtifacts(mode, observation, candidates, questions);
  const transcript = buildTranscript(observation, candidates, questions);

  result.keywords = keywords;
  result.candidates = candidates;
  result.clusters = clusters;
  result.heatmap = heatmap;
  result.graph = graph;
  result.observation = observation;
  result.questions = questions;
  result.artifacts = artifacts;
  result.transcript = transcript;

  return result;
}
