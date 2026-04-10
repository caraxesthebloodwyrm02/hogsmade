import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export type ContextSearchProvider = "deterministic" | "openai" | "ollama";
export type ContextSearchStageBoundary = "keywords" | "query" | "interview" | "full";
export type ContextSearchStageStatus = "completed" | "skipped";

export interface ContextSearchWorkflowDefinition {
  id: string;
  title: string;
  whatItIs: string;
  authorityOrder: string[];
  contractNotes: string[];
  implementedRuntime: string[];
  adjacentInfluence: string[];
  tokenDenseForm: string;
  stageOrder: string[];
}

export interface ContextSearchRuntimeArgs {
  scenarioText: string;
  optionalContext?: string;
  optionalProblemFrame?: string;
  maxKeywords: number;
  provider: ContextSearchProvider;
  stage: ContextSearchStageBoundary;
  printJson: boolean;
}

export interface ContextSearchStageResult {
  stage: string;
  status: ContextSearchStageStatus;
  message: string;
  counts: Record<string, number>;
}

export interface ContextSearchObservation {
  acceptedKeywordCount: number;
  rejectedTermCount: number;
  unknownTermCount: number;
  hitCount: number;
  clusterCount: number;
  topCluster: string | null;
  topHit: string | null;
  confidenceSummary: string;
  warnings: string[];
  finalOutput: string;
}

export interface KeywordTerm {
  term: string;
  canonicalTerm: string;
  weight: number;
  expansions: string[];
  source: ContextSearchProvider;
}

export interface KeywordBundle {
  provider: ContextSearchProvider;
  accepted: KeywordTerm[];
  rejectedTerms: string[];
  unknownTerms: string[];
  synthesisTrace: string[];
}

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  cluster: string;
  kind: string;
  score: number;
  matchedTerms: string[];
  symbolMatches: string[];
  exactPathMatches: string[];
  contentMatches: number;
  excerpt: string;
}

export interface ReferenceNode {
  id: string;
  label: string;
  type: "cluster" | "file";
  cluster?: string;
  score: number;
}

export interface ReferenceEdge {
  source: string;
  target: string;
  type: "belongs_to" | "references" | "transfer";
  weight: number;
  label?: string;
}

export interface ClusterVisibility {
  id: string;
  label: string;
  score: number;
  matchedTerms: string[];
  topHitIds: string[];
  transferReasons: string[];
}

export interface HeatmapCell {
  keyword: string;
  clusterId: string;
  score: number;
}

export interface InterviewSpeaker {
  id: "interviewer" | "retriever" | "mapper" | "skeptic" | "synthesizer";
  label: string;
  role: string;
}

export interface ArtifactCard {
  id: string;
  type: "paragraph" | "graph" | "cluster_map" | "heatmap" | "checklist";
  title: string;
  content: string;
  evidenceRefs: string[];
}

export interface InterviewTurn {
  id: string;
  speakerId: InterviewSpeaker["id"];
  text: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  confidence: number;
}

export interface ContextSearchResult {
  definition: ContextSearchWorkflowDefinition;
  observation: ContextSearchObservation;
  prints: ContextSearchStageResult[];
  keywords: KeywordBundle;
  summary: string;
  hits: SearchHit[];
  graph: {
    nodes: ReferenceNode[];
    edges: ReferenceEdge[];
  };
  clusters: ClusterVisibility[];
  heatmap: HeatmapCell[];
  artifacts: ArtifactCard[];
  interview: {
    speakers: InterviewSpeaker[];
    turns: InterviewTurn[];
  };
}

export interface ContextSearchRequest {
  scenarioText: string;
  optionalContext?: string;
  optionalProblemFrame?: string;
  maxKeywords?: number;
  provider?: ContextSearchProvider;
}

interface IndexedDocument {
  id: string;
  path: string;
  absolutePath: string;
  title: string;
  cluster: string;
  kind: string;
  content: string;
  lines: string[];
  tokens: Set<string>;
  pathTokens: Set<string>;
  symbolTokens: Set<string>;
  references: string[];
}

interface VocabularyValidationResult {
  warnings: string[];
}

const INCLUDED_ROOTS = [
  "glimpse-artifact/src",
  "glimpse-artifact/server",
  "glimpse-engine",
  "overview-server/src",
  "shared-types/src",
  "docs",
  "README.md",
  "glimpse.master.yaml",
  "mcp_config.json",
] as const;

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".html",
]);

const SKIPPED_DIRS = new Set([".git", "node_modules", "dist", "coverage", "tmp", ".vite"]);

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
  "whose",
  "there",
  "here",
  "have",
  "has",
  "had",
  "been",
  "being",
  "onto",
  "through",
  "across",
  "using",
  "used",
  "use",
  "just",
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
  "whole",
  "given",
  "also",
  "much",
  "many",
  "each",
  "any",
  "all",
  "few",
  "same",
  "able",
  "must",
  "show",
  "user",
  "users",
  "context",
  "problem",
  "scenario",
]);

const TERM_EXPANSIONS: Record<string, string[]> = {
  keyword: ["taxonomy", "term", "token", "match"],
  keywords: ["taxonomy", "term", "token", "match"],
  token: ["keyword", "term", "semantic"],
  search: ["query", "find", "retrieval", "rank"],
  vector: ["graph", "node", "cluster", "transfer"],
  interview: ["conversation", "meeting", "podcast", "dialogue"],
  graph: ["topology", "node", "edge", "cluster"],
  cluster: ["group", "domain", "visibility"],
  heatmap: ["matrix", "density", "score"],
  artifact: ["summary", "reference", "export"],
  evidence: ["trace", "reference", "excerpt"],
  synthesize: ["summary", "compress", "distill"],
  synthesis: ["summary", "compress", "distill"],
  transformer: ["attention", "token", "prediction"],
  prediction: ["next", "token", "language"],
  accuracy: ["confidence", "trace", "evidence"],
};

const PROVIDERS = new Set<ContextSearchProvider>(["deterministic", "openai", "ollama"]);

const TOKEN_DENSE_FLOW = [
  "scenario",
  "keyword bundle",
  "vocab validation",
  "deterministic pattern/glob search",
  "node transfer",
  "cluster visibility",
  "evidence graph",
  "interview speakers",
  "multimodal reference artifacts",
  "exportable synthesis",
] as const;

type WorkflowStageLabel = (typeof TOKEN_DENSE_FLOW)[number];

let cachedIndex:
  | {
      root: string;
      builtAt: number;
      docs: IndexedDocument[];
      vocabulary: Set<string>;
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

function getProvider(provider?: string): ContextSearchProvider {
  return PROVIDERS.has((provider ?? "") as ContextSearchProvider)
    ? (provider as ContextSearchProvider)
    : "deterministic";
}

function getStageBoundary(stage?: string): ContextSearchStageBoundary {
  if (stage === "keywords" || stage === "query" || stage === "interview" || stage === "full") {
    return stage;
  }
  return "full";
}

function normalizeArgValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((entry) => entry.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);

  const index = argv.findIndex((entry) => entry === flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function createEmptyInterview(): ContextSearchResult["interview"] {
  return {
    speakers: [],
    turns: [],
  };
}

function createEmptyKeywords(provider: ContextSearchProvider): KeywordBundle {
  return {
    provider,
    accepted: [],
    rejectedTerms: [],
    unknownTerms: [],
    synthesisTrace: [],
  };
}

function createStageResult(
  stage: WorkflowStageLabel,
  status: ContextSearchStageStatus,
  message: string,
  counts: Record<string, number> = {},
): ContextSearchStageResult {
  return { stage, status, message, counts };
}

function createSkippedStage(stage: WorkflowStageLabel, message: string): ContextSearchStageResult {
  return createStageResult(stage, "skipped", message);
}

function appendSkippedStages(
  prints: ContextSearchStageResult[],
  stages: readonly WorkflowStageLabel[],
  message: string,
) {
  for (const stage of stages) {
    prints.push(createSkippedStage(stage, message));
  }
}

function createInitialResult(args: ContextSearchRuntimeArgs): ContextSearchResult {
  return {
    definition: getWorkflowDefinition(),
    observation: {
      acceptedKeywordCount: 0,
      rejectedTermCount: 0,
      unknownTermCount: 0,
      hitCount: 0,
      clusterCount: 0,
      topCluster: null,
      topHit: null,
      confidenceSummary: "No grounded evidence yet.",
      warnings: [],
      finalOutput: `stage=${args.stage}`,
    },
    prints: [],
    keywords: createEmptyKeywords(args.provider),
    summary: "",
    hits: [],
    graph: {
      nodes: [],
      edges: [],
    },
    clusters: [],
    heatmap: [],
    artifacts: [],
    interview: createEmptyInterview(),
  };
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

function computeTokenOverlap(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  return intersection / (tokensA.size + tokensB.size - intersection);
}

function classifyKind(relativePath: string): string {
  if (relativePath.includes("/views/")) return "view";
  if (relativePath.includes("/hooks/")) return "hook";
  if (relativePath.includes("/components/")) return "component";
  if (relativePath.includes("/tests/") || relativePath.includes(".test.")) return "test";
  if (relativePath.startsWith("docs/") || relativePath.endsWith(".md")) return "doc";
  if (
    relativePath.endsWith(".json") ||
    relativePath.endsWith(".yaml") ||
    relativePath.endsWith(".yml")
  ) {
    return "config";
  }
  return "code";
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

function extractSymbolTokens(content: string): string[] {
  const matches = [
    ...content.matchAll(
      /\b(?:export\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g,
    ),
  ].map((match) => match[1] ?? "");

  return matches.flatMap((value) => splitIdentifierParts(value));
}

function extractReferences(content: string): string[] {
  const refs = new Set<string>();

  for (const match of content.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (match[1]) refs.add(match[1]);
  }

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (match[1]) refs.add(match[1]);
  }

  return [...refs];
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
      files.push(...(await walkTextFiles(nextPath)));
      continue;
    }

    if (entry.isFile() && INCLUDED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(nextPath);
    }
  }

  return files;
}

async function buildIndex(
  repoRoot: string,
): Promise<{ docs: IndexedDocument[]; vocabulary: Set<string> }> {
  const files: string[] = [];

  for (const root of INCLUDED_ROOTS) {
    const absoluteRoot = path.join(repoRoot, root);
    try {
      files.push(...(await walkTextFiles(absoluteRoot)));
    } catch {
      // Optional root
    }
  }

  const uniqueFiles = [...new Set(files)];
  const docs: IndexedDocument[] = [];
  const vocabulary = new Set<string>();

  for (const absolutePath of uniqueFiles) {
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    const raw = await readFile(absolutePath, "utf8");
    const content = raw.slice(0, 120_000);
    const title = extractTitle(relativePath, content);
    const cluster = relativePath.split("/")[0] || "root";
    const pathTokens = new Set(tokenize(relativePath));
    const symbolTokens = new Set(extractSymbolTokens(content));
    const contentTokens = new Set(tokenize(content));
    const tokens = new Set([...pathTokens, ...symbolTokens, ...contentTokens]);
    const references = extractReferences(content);
    const lines = content.split("\n");

    for (const token of tokens) {
      vocabulary.add(token);
    }

    docs.push({
      id: relativePath,
      path: relativePath,
      absolutePath,
      title,
      cluster,
      kind: classifyKind(relativePath),
      content,
      lines,
      tokens,
      pathTokens,
      symbolTokens,
      references,
    });
  }

  return { docs, vocabulary };
}

async function getIndexedRepo(
  repoRoot: string,
): Promise<{ docs: IndexedDocument[]; vocabulary: Set<string> }> {
  const now = Date.now();
  if (cachedIndex && cachedIndex.root === repoRoot && now - cachedIndex.builtAt < 15_000) {
    return { docs: cachedIndex.docs, vocabulary: cachedIndex.vocabulary };
  }

  const built = await buildIndex(repoRoot);
  cachedIndex = {
    root: repoRoot,
    builtAt: now,
    docs: built.docs,
    vocabulary: built.vocabulary,
  };
  return built;
}

function mapUnknownTerm(term: string, vocabulary: Set<string>): string | null {
  let best: string | null = null;
  let bestScore = 0;

  for (const vocabTerm of vocabulary) {
    const score = computeTokenOverlap(term, vocabTerm);
    if (score > bestScore) {
      best = vocabTerm;
      bestScore = score;
    }
  }

  return bestScore >= 0.6 ? best : null;
}

export function getWorkflowDefinition(): ContextSearchWorkflowDefinition {
  return {
    id: "ui-first-glimpse-artifact-context-search",
    title: "Contract-Grounded Routine Workflow for Context Search",
    whatItIs:
      "A plain staged workflow that compresses a scenario into grounded keywords, validates them against repo vocabulary, runs deterministic search and ranking, maps transfer across nodes and clusters, and packages the result as evidence-backed reference material.",
    authorityOrder: [
      "TUV-001 source contract: /home/caraxes/seed/templates/development-contract.md",
      "Implemented runtime: glimpse-artifact/server/context-search.ts, vite-api-plugin.ts, ContextSearchView.tsx, useContextSearch.ts, phase4/types.ts",
      "Adjacent UI influence: ScenarioCanvasView.tsx and useCanvasSeeds.ts",
      "Prototype mirror: non-authoritative reference only",
    ],
    contractNotes: [
      "Evidence stays visible and remains the grounding layer for all other surfaces.",
      "Unknown and rejected terms remain visible and are never silently absorbed.",
      "Provider posture can shape keyword synthesis only; it cannot override deterministic truth and scoring.",
      "Implemented runtime is kept distinct from adjacent and reference-only material.",
    ],
    implementedRuntime: [
      "deterministic keyword synthesis and validation",
      "repo-native glob and pattern search",
      "node transfer, cluster visibility, heatmap, summary, interview, and artifact packaging",
    ],
    adjacentInfluence: ["canvas-style layout and seam language from the scenario surface"],
    tokenDenseForm: TOKEN_DENSE_FLOW.join(" -> "),
    stageOrder: [...TOKEN_DENSE_FLOW],
  };
}

export function parseRuntimeArgs(argv: string[]): ContextSearchRuntimeArgs {
  const scenarioText = normalizeArgValue(argv, "--scenario")?.trim() ?? "";
  if (!scenarioText) {
    throw new Error("--scenario is required when using argv mode");
  }

  const maxKeywordsValue = normalizeArgValue(argv, "--max-keywords");
  const maxKeywords = clampMaxKeywords(
    maxKeywordsValue ? Number.parseInt(maxKeywordsValue, 10) : undefined,
  );

  return {
    scenarioText,
    optionalContext: normalizeArgValue(argv, "--context") ?? "",
    optionalProblemFrame: normalizeArgValue(argv, "--problem") ?? "",
    maxKeywords,
    provider: getProvider(normalizeArgValue(argv, "--provider")),
    stage: getStageBoundary(normalizeArgValue(argv, "--stage")),
    printJson: argv.includes("--print-json"),
  };
}

function normalizeRuntimeArgs(
  input: ContextSearchRequest | ContextSearchRuntimeArgs,
): ContextSearchRuntimeArgs {
  if ("stage" in input || "printJson" in input) {
    const runtimeInput = input as ContextSearchRuntimeArgs;
    return {
      scenarioText: String(runtimeInput.scenarioText ?? ""),
      optionalContext: runtimeInput.optionalContext ?? "",
      optionalProblemFrame: runtimeInput.optionalProblemFrame ?? "",
      maxKeywords: clampMaxKeywords(runtimeInput.maxKeywords),
      provider: getProvider(runtimeInput.provider),
      stage: getStageBoundary(runtimeInput.stage),
      printJson: Boolean(runtimeInput.printJson),
    };
  }

  return {
    scenarioText: String(input.scenarioText ?? ""),
    optionalContext: input.optionalContext ?? "",
    optionalProblemFrame: input.optionalProblemFrame ?? "",
    maxKeywords: clampMaxKeywords(input.maxKeywords),
    provider: getProvider(input.provider),
    stage: "full",
    printJson: false,
  };
}

export function buildKeywordBundle(
  request: Pick<
    ContextSearchRuntimeArgs,
    "scenarioText" | "optionalContext" | "optionalProblemFrame" | "maxKeywords" | "provider"
  >,
  vocabulary: Set<string>,
): KeywordBundle {
  const provider = getProvider(request.provider);
  const maxKeywords = clampMaxKeywords(request.maxKeywords);
  const combined = [
    request.scenarioText,
    request.optionalContext ?? "",
    request.optionalProblemFrame ?? "",
  ]
    .join("\n")
    .trim();

  const rawTerms = tokenize(combined);
  const termCounts = new Map<string, number>();
  const rejectedTerms = new Set<string>();
  const unknownTerms = new Set<string>();
  const synthesisTrace = [
    `provider=${provider}`,
    `raw_terms=${rawTerms.length}`,
    "authority=TUV-001->implemented-runtime->adjacent-ui->prototype-reference",
    "provider_posture=keyword-synthesis-only",
  ];

  for (const term of rawTerms) {
    if (term.length < 3 || STOPWORDS.has(term)) {
      rejectedTerms.add(term);
      continue;
    }
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  const accepted: KeywordTerm[] = [];
  const sortedTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]);

  for (const [term, frequency] of sortedTerms) {
    if (accepted.length >= maxKeywords) break;

    const directMatch = vocabulary.has(term);
    const mapped = directMatch ? term : mapUnknownTerm(term, vocabulary);
    if (!mapped) {
      unknownTerms.add(term);
      continue;
    }

    const expansions = [
      mapped,
      ...(TERM_EXPANSIONS[mapped] ?? []),
      ...(TERM_EXPANSIONS[term] ?? []),
    ]
      .map((value) => value.toLowerCase())
      .filter((value, index, values) => value.length >= 3 && values.indexOf(value) === index);

    accepted.push({
      term,
      canonicalTerm: mapped,
      weight: Number(Math.min(1, 0.35 + frequency * 0.18 + (directMatch ? 0.22 : 0.08)).toFixed(2)),
      expansions,
      source: provider,
    });
  }

  synthesisTrace.push(`accepted=${accepted.length}`);
  synthesisTrace.push(`rejected=${rejectedTerms.size}`);
  synthesisTrace.push(`unknown=${unknownTerms.size}`);

  return {
    provider,
    accepted,
    rejectedTerms: [...rejectedTerms].slice(0, 24),
    unknownTerms: [...unknownTerms].slice(0, 24),
    synthesisTrace,
  };
}

export const buildKeywordBundleFromText = buildKeywordBundle;

export function validateVocabulary(keywords: KeywordBundle): VocabularyValidationResult {
  const warnings: string[] = [];

  if (keywords.accepted.length === 0) {
    warnings.push(
      "No grounded keywords were accepted; later stages will have weak or empty evidence.",
    );
  }

  if (keywords.unknownTerms.length > 0) {
    warnings.push(
      "Unknown terms stayed visible and were not allowed to influence deterministic ranking.",
    );
  }

  if (keywords.rejectedTerms.length > 0) {
    warnings.push("Rejected terms stayed visible in the trace for inspection.");
  }

  if (keywords.provider !== "deterministic") {
    warnings.push(
      "Provider selection affects keyword posture only; scoring remains deterministic.",
    );
  }

  return { warnings };
}

function buildExcerpt(lines: string[], matchedTerms: string[]): string {
  const lowered = matchedTerms.map((term) => term.toLowerCase());
  const found = lines.find((line) => lowered.some((term) => line.toLowerCase().includes(term)));

  if (found) return found.trim().slice(0, 220);
  return (
    lines
      .find((line) => line.trim().length > 0)
      ?.trim()
      .slice(0, 220) ?? "No excerpt available."
  );
}

export function runDeterministicSearch(
  keywords: KeywordBundle,
  docs: IndexedDocument[],
): SearchHit[] {
  const hits: SearchHit[] = [];

  for (const doc of docs) {
    let score = 0;
    const matchedTerms = new Set<string>();
    const symbolMatches = new Set<string>();
    const exactPathMatches = new Set<string>();
    let contentMatches = 0;

    for (const keyword of keywords.accepted) {
      const terms = [keyword.term, keyword.canonicalTerm, ...keyword.expansions];
      let localScore = 0;

      for (const term of terms) {
        if (doc.pathTokens.has(term)) {
          localScore += 3.2;
          exactPathMatches.add(term);
        }

        if (doc.symbolTokens.has(term)) {
          localScore += 2.4;
          symbolMatches.add(term);
        }

        if (doc.tokens.has(term)) {
          localScore += 1.2;
        }

        const occurrences = countOccurrences(doc.content, term);
        if (occurrences > 0) {
          localScore += Math.min(occurrences, 4) * 0.55;
          contentMatches += occurrences;
        }
      }

      if (localScore > 0) {
        matchedTerms.add(keyword.canonicalTerm);
        score += localScore * keyword.weight;
      }
    }

    if (score <= 0) continue;

    const kindWeight =
      doc.kind === "view" || doc.kind === "hook" || doc.kind === "component"
        ? 1.18
        : doc.kind === "doc"
          ? 0.95
          : 1;

    score *= kindWeight;

    hits.push({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      cluster: doc.cluster,
      kind: doc.kind,
      score: Number(score.toFixed(2)),
      matchedTerms: [...matchedTerms],
      symbolMatches: [...symbolMatches].slice(0, 8),
      exactPathMatches: [...exactPathMatches].slice(0, 8),
      contentMatches,
      excerpt: buildExcerpt(doc.lines, [...matchedTerms, ...symbolMatches, ...exactPathMatches]),
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 18);
}

export const searchIndexedDocuments = runDeterministicSearch;

export function buildNodeTransfers(
  hits: SearchHit[],
  docs: IndexedDocument[],
  keywords: KeywordBundle,
): { nodes: ReferenceNode[]; edges: ReferenceEdge[] } {
  const docMap = new Map(docs.map((doc) => [doc.id, doc]));
  const clusterScores = new Map<string, number>();

  for (const hit of hits) {
    clusterScores.set(hit.cluster, (clusterScores.get(hit.cluster) ?? 0) + hit.score);
  }

  const nodes: ReferenceNode[] = [
    ...[...clusterScores.entries()].map(([cluster, score]) => ({
      id: `cluster:${cluster}`,
      label: cluster,
      type: "cluster" as const,
      score: Number(score.toFixed(2)),
    })),
    ...hits.map((hit) => ({
      id: hit.id,
      label: path.basename(hit.path),
      type: "file" as const,
      cluster: hit.cluster,
      score: hit.score,
    })),
  ];

  const edges: ReferenceEdge[] = hits.map((hit) => ({
    source: hit.id,
    target: `cluster:${hit.cluster}`,
    type: "belongs_to",
    weight: Number(Math.max(0.4, hit.score / 10).toFixed(2)),
    label: hit.kind,
  }));

  for (const hit of hits) {
    const doc = docMap.get(hit.id);
    if (!doc) continue;

    for (const ref of doc.references) {
      const normalized = ref.replace(/^\.\/+/, "").replace(/^\.\.\/+/, "");
      const targetHit = hits.find(
        (candidate) =>
          candidate.path.endsWith(normalized) ||
          candidate.path.includes(normalized) ||
          ref.includes(path.basename(candidate.path, path.extname(candidate.path))),
      );
      if (!targetHit) continue;

      edges.push({
        source: hit.id,
        target: targetHit.id,
        type: "references",
        weight: 0.7,
        label: "reference",
      });
    }
  }

  const clusters = [...clusterScores.keys()];
  for (let index = 0; index < clusters.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < clusters.length; nextIndex += 1) {
      const leftHits = hits.filter((hit) => hit.cluster === clusters[index]);
      const rightHits = hits.filter((hit) => hit.cluster === clusters[nextIndex]);
      const sharedKeywords = keywords.accepted.filter(
        (keyword) =>
          leftHits.some((hit) => hit.matchedTerms.includes(keyword.canonicalTerm)) &&
          rightHits.some((hit) => hit.matchedTerms.includes(keyword.canonicalTerm)),
      );

      if (sharedKeywords.length === 0) continue;

      edges.push({
        source: `cluster:${clusters[index]}`,
        target: `cluster:${clusters[nextIndex]}`,
        type: "transfer",
        weight: Number((0.45 + sharedKeywords.length * 0.18).toFixed(2)),
        label: sharedKeywords
          .map((keyword) => keyword.canonicalTerm)
          .slice(0, 2)
          .join(", "),
      });
    }
  }

  return { nodes, edges };
}

export function buildClusterVisibility(
  hits: SearchHit[],
  keywords: KeywordBundle,
): ClusterVisibility[] {
  const grouped = new Map<string, SearchHit[]>();

  for (const hit of hits) {
    const bucket = grouped.get(hit.cluster) ?? [];
    bucket.push(hit);
    grouped.set(hit.cluster, bucket);
  }

  return [...grouped.entries()]
    .map(([cluster, clusterHits]) => {
      const matchedTerms = new Set<string>();

      for (const hit of clusterHits) {
        for (const term of hit.matchedTerms) {
          matchedTerms.add(term);
        }
      }

      return {
        id: cluster,
        label: cluster,
        score: Number(clusterHits.reduce((sum, hit) => sum + hit.score, 0).toFixed(2)),
        matchedTerms: [...matchedTerms].slice(0, 6),
        topHitIds: clusterHits.slice(0, 3).map((hit) => hit.id),
        transferReasons: keywords.accepted
          .filter((keyword) =>
            clusterHits.some((hit) => hit.matchedTerms.includes(keyword.canonicalTerm)),
          )
          .map((keyword) => `matched ${keyword.canonicalTerm}`)
          .slice(0, 4),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function buildHeatmap(
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  keywords: KeywordBundle,
): HeatmapCell[] {
  return keywords.accepted.flatMap((keyword) =>
    clusters.map((cluster) => {
      const score = hits
        .filter(
          (hit) => hit.cluster === cluster.id && hit.matchedTerms.includes(keyword.canonicalTerm),
        )
        .reduce((sum, hit) => sum + hit.score, 0);

      return {
        keyword: keyword.canonicalTerm,
        clusterId: cluster.id,
        score: Number(score.toFixed(2)),
      };
    }),
  );
}

function buildSummary(
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  keywords: KeywordBundle,
): string {
  const topCluster = clusters[0];
  const topHit = hits[0];
  const terms = keywords.accepted
    .map((keyword) => keyword.canonicalTerm)
    .slice(0, 4)
    .join(", ");

  if (!topCluster || !topHit) {
    return "The workflow completed its grounded stages, but the deterministic search did not find enough reproducible repo evidence to claim a strong map.";
  }

  return `The repo response concentrates around ${topCluster.label}, with ${topHit.title} as the strongest grounded reference. The active concept bundle is ${terms}. Evidence hits remain the truth layer for every derived surface.`;
}

export function buildEvidenceArtifacts(
  summary: string,
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  keywords: KeywordBundle,
): ArtifactCard[] {
  const topCluster = clusters[0];

  return [
    {
      id: "artifact-paragraph",
      type: "paragraph",
      title: "Compressed synthesis",
      content: summary,
      evidenceRefs: hits.slice(0, 3).map((hit) => hit.id),
    },
    {
      id: "artifact-graph",
      type: "graph",
      title: "Reference graph",
      content: `Graph focuses on ${hits.length} grounded hit nodes and ${clusters.length} cluster nodes.`,
      evidenceRefs: hits.slice(0, 4).map((hit) => hit.id),
    },
    {
      id: "artifact-clusters",
      type: "cluster_map",
      title: "Cluster visibility",
      content: topCluster
        ? `${topCluster.label} leads the visibility map with ${topCluster.matchedTerms.join(", ")}.`
        : "No strong cluster dominance detected.",
      evidenceRefs: clusters.flatMap((cluster) => cluster.topHitIds).slice(0, 4),
    },
    {
      id: "artifact-heatmap",
      type: "heatmap",
      title: "Keyword-to-cluster heatmap",
      content:
        "Heatmap reflects how accepted keywords distribute across the strongest subsystem families.",
      evidenceRefs: hits.slice(0, 4).map((hit) => hit.id),
    },
    {
      id: "artifact-checklist",
      type: "checklist",
      title: "Accuracy checklist",
      content: [
        `accepted keywords: ${keywords.accepted.length}`,
        `unknown terms: ${keywords.unknownTerms.length}`,
        `grounded hits: ${hits.length}`,
        `dominant cluster: ${topCluster?.label ?? "none"}`,
      ].join(" | "),
      evidenceRefs: hits.slice(0, 2).map((hit) => hit.id),
    },
  ];
}

export function buildInterviewSession(
  summary: string,
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  keywords: KeywordBundle,
  artifacts: ArtifactCard[],
): ContextSearchResult["interview"] {
  const speakers: InterviewSpeaker[] = [
    {
      id: "interviewer",
      label: "Interviewer",
      role: "Frames the ask and keeps the discussion scoped.",
    },
    {
      id: "retriever",
      label: "Retriever",
      role: "Surfaces exact repo evidence and strongest hits.",
    },
    { id: "mapper", label: "Mapper", role: "Explains node, path, and cluster transfer." },
    {
      id: "skeptic",
      label: "Skeptic",
      role: "Calls out unknowns, weak matches, and confidence limits.",
    },
    {
      id: "synthesizer",
      label: "Synthesizer",
      role: "Turns grounded evidence into portable reference material.",
    },
  ];

  const topHit = hits[0];
  const secondHit = hits[1];
  const topCluster = clusters[0];

  const turns: InterviewTurn[] = [
    {
      id: "turn-1",
      speakerId: "interviewer",
      text: `We compressed the input into ${keywords.accepted.length} grounded keywords and asked the repo to answer through files, symbols, and deterministic pattern matches.`,
      evidenceRefs: [],
      artifactRefs: ["artifact-checklist"],
      confidence: 0.86,
    },
    {
      id: "turn-2",
      speakerId: "retriever",
      text: topHit
        ? `The strongest evidence node is ${
            topHit.path
          }, with matched terms ${topHit.matchedTerms.join(", ")} and excerpt: "${topHit.excerpt}".`
        : "No dominant evidence node was found.",
      evidenceRefs: topHit ? [topHit.id] : [],
      artifactRefs: ["artifact-paragraph"],
      confidence: topHit ? 0.88 : 0.34,
    },
    {
      id: "turn-3",
      speakerId: "mapper",
      text: topCluster
        ? `Visibility concentrates in ${topCluster.label}; transfer then spreads across adjacent clusters through shared terms and explicit references.`
        : "Cluster transfer is weak because the hit set is sparse.",
      evidenceRefs: topCluster?.topHitIds ?? [],
      artifactRefs: ["artifact-graph", "artifact-clusters", "artifact-heatmap"],
      confidence: topCluster ? 0.81 : 0.42,
    },
    {
      id: "turn-4",
      speakerId: "skeptic",
      text:
        keywords.unknownTerms.length > 0
          ? `Unknown terms remain visible: ${keywords.unknownTerms
              .slice(0, 4)
              .join(", ")}. These were not allowed to distort ranking.`
          : `Unknown-term pressure is low; the main risk is over-reading the top ${Math.min(
              2,
              hits.length,
            )} hits.`,
      evidenceRefs: secondHit ? [secondHit.id] : [],
      artifactRefs: ["artifact-checklist"],
      confidence: 0.78,
    },
    {
      id: "turn-5",
      speakerId: "synthesizer",
      text: summary,
      evidenceRefs: hits.slice(0, 3).map((hit) => hit.id),
      artifactRefs: artifacts.map((artifact) => artifact.id),
      confidence: 0.84,
    },
  ];

  return { speakers, turns };
}

export function buildInterviewScript(
  summary: string,
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  keywords: KeywordBundle,
): { speakers: InterviewSpeaker[]; turns: InterviewTurn[]; artifacts: ArtifactCard[] } {
  const artifacts = buildEvidenceArtifacts(summary, hits, clusters, keywords);
  const interview = buildInterviewSession(summary, hits, clusters, keywords, artifacts);

  return {
    speakers: interview.speakers,
    turns: interview.turns,
    artifacts,
  };
}

export function buildObservation(
  args: ContextSearchRuntimeArgs,
  keywords: KeywordBundle,
  hits: SearchHit[],
  clusters: ClusterVisibility[],
  summary: string,
  validation: VocabularyValidationResult,
): ContextSearchObservation {
  const topHit = hits[0];
  const topCluster = clusters[0];
  const groundingRatio =
    keywords.accepted.length === 0
      ? 0
      : Math.min(1, hits.length / Math.max(1, keywords.accepted.length));

  const confidenceSummary =
    groundingRatio >= 1
      ? "High grounding: accepted keywords resolved into stable evidence hits."
      : groundingRatio >= 0.5
        ? "Moderate grounding: evidence exists, but coverage is partial."
        : "Low grounding: the workflow remained deterministic, but evidence coverage is thin.";

  return {
    acceptedKeywordCount: keywords.accepted.length,
    rejectedTermCount: keywords.rejectedTerms.length,
    unknownTermCount: keywords.unknownTerms.length,
    hitCount: hits.length,
    clusterCount: clusters.length,
    topCluster: topCluster?.label ?? null,
    topHit: topHit?.path ?? null,
    confidenceSummary,
    warnings: [...validation.warnings, ...(summary ? [] : ["No final summary was produced."])],
    finalOutput: `stage=${args.stage}; provider=${args.provider}; summary=${
      summary ? "present" : "absent"
    }`,
  };
}

export function printWorkflowSummary(
  result: Pick<ContextSearchResult, "definition" | "observation" | "prints" | "summary">,
): string[] {
  const lines = [
    `[definition] ${result.definition.title}`,
    `[token-dense] ${result.definition.tokenDenseForm}`,
    ...result.prints.map((entry) => {
      const counts = Object.entries(entry.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      return counts.length > 0
        ? `[${entry.status}] ${entry.stage}: ${entry.message} (${counts})`
        : `[${entry.status}] ${entry.stage}: ${entry.message}`;
    }),
  ];

  for (const warning of result.observation.warnings) {
    lines.push(`[warning] ${warning}`);
  }

  lines.push(`[observation] ${result.observation.confidenceSummary}`);
  lines.push(`[result] ${result.summary || result.observation.finalOutput}`);

  return lines;
}

export async function runContextSearchWorkflow(
  input: ContextSearchRequest | ContextSearchRuntimeArgs,
  repoRoot: string,
): Promise<ContextSearchResult> {
  const args = normalizeRuntimeArgs(input);
  const result = createInitialResult(args);
  const trimmedScenario = args.scenarioText.trim();

  if (!trimmedScenario) {
    throw new Error("scenarioText is required");
  }

  result.prints.push(
    createStageResult(
      "scenario",
      "completed",
      "Scenario text accepted and anchored to the implemented runtime contract.",
      { characters: trimmedScenario.length },
    ),
  );

  const { docs, vocabulary } = await getIndexedRepo(repoRoot);

  const keywords = buildKeywordBundle(args, vocabulary);
  result.keywords = keywords;
  result.prints.push(
    createStageResult(
      "keyword bundle",
      "completed",
      "Built a compact keyword bundle from scenario text and optional context.",
      {
        accepted: keywords.accepted.length,
        rejected: keywords.rejectedTerms.length,
        unknown: keywords.unknownTerms.length,
      },
    ),
  );

  const validation = validateVocabulary(keywords);
  result.prints.push(
    createStageResult(
      "vocab validation",
      "completed",
      "Validated the keyword bundle against repo-native vocabulary and preserved non-grounded terms visibly.",
      { warnings: validation.warnings.length },
    ),
  );

  if (args.stage === "keywords") {
    appendSkippedStages(
      result.prints,
      TOKEN_DENSE_FLOW.slice(3),
      "Skipped because stage=keywords.",
    );
    result.summary =
      "Keyword bundle ready. Deterministic search was intentionally stopped at the vocabulary boundary.";
    result.observation = buildObservation(args, keywords, [], [], result.summary, validation);
    return result;
  }

  const hits = runDeterministicSearch(keywords, docs);
  result.hits = hits;
  result.prints.push(
    createStageResult(
      "deterministic pattern/glob search",
      "completed",
      "Scored repo-native files using path, symbol, token, and content matches without a vector store.",
      { hits: hits.length },
    ),
  );

  const graph = buildNodeTransfers(hits, docs, keywords);
  result.graph = graph;
  result.prints.push(
    createStageResult(
      "node transfer",
      "completed",
      "Propagated relevance from evidence hits into file-to-file and file-to-cluster transfer edges.",
      { nodes: graph.nodes.length, edges: graph.edges.length },
    ),
  );

  const clusters = buildClusterVisibility(hits, keywords);
  result.clusters = clusters;
  result.prints.push(
    createStageResult(
      "cluster visibility",
      "completed",
      "Aggregated transferred relevance into cluster-level visibility and transfer reasons.",
      { clusters: clusters.length },
    ),
  );

  const heatmap = buildHeatmap(hits, clusters, keywords);
  result.heatmap = heatmap;
  result.summary = buildSummary(hits, clusters, keywords);
  result.prints.push(
    createStageResult(
      "evidence graph",
      "completed",
      "Packaged evidence-bearing graph and keyword-to-cluster heatmap surfaces.",
      { heatmapCells: heatmap.length },
    ),
  );

  if (args.stage === "query") {
    appendSkippedStages(result.prints, TOKEN_DENSE_FLOW.slice(7), "Skipped because stage=query.");
    result.observation = buildObservation(
      args,
      keywords,
      hits,
      clusters,
      result.summary,
      validation,
    );
    return result;
  }

  const artifacts = buildEvidenceArtifacts(result.summary, hits, clusters, keywords);
  const interview = buildInterviewSession(result.summary, hits, clusters, keywords, artifacts);
  result.interview = interview;
  result.prints.push(
    createStageResult(
      "interview speakers",
      "completed",
      "Rendered an evidence-backed interview transcript with grounded speaker turns.",
      { speakers: interview.speakers.length, turns: interview.turns.length },
    ),
  );

  result.artifacts = artifacts;
  result.prints.push(
    createStageResult(
      "multimodal reference artifacts",
      "completed",
      "Built portable reference artifacts from grounded evidence hits, clusters, and summary.",
      { artifacts: artifacts.length },
    ),
  );

  if (args.stage === "interview") {
    result.prints.push(
      createSkippedStage("exportable synthesis", "Skipped because stage=interview."),
    );
    result.observation = buildObservation(
      args,
      keywords,
      hits,
      clusters,
      result.summary,
      validation,
    );
    return result;
  }

  result.prints.push(
    createStageResult(
      "exportable synthesis",
      "completed",
      "Prepared a complete exportable synthesis package with definition, observation, prints, evidence, and transcript.",
      { exportedSections: 9 },
    ),
  );

  result.observation = buildObservation(args, keywords, hits, clusters, result.summary, validation);
  return result;
}

export async function runContextSearch(
  request: ContextSearchRequest,
  repoRoot: string,
): Promise<ContextSearchResult> {
  return runContextSearchWorkflow(request, repoRoot);
}

export async function runContextSearchFromArgv(
  argv: string[],
  repoRoot: string,
): Promise<{ args: ContextSearchRuntimeArgs; result: ContextSearchResult; lines: string[] }> {
  const args = parseRuntimeArgs(argv);
  const result = await runContextSearchWorkflow(args, repoRoot);
  const lines = printWorkflowSummary(result);

  return { args, result, lines };
}
