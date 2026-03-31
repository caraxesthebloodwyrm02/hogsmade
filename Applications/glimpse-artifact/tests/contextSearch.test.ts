import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildObservation,
  buildInterviewScript,
  buildKeywordBundleFromText,
  parseRuntimeArgs,
  printWorkflowSummary,
  runContextSearch,
  runContextSearchWorkflow,
  searchIndexedDocuments,
  validateVocabulary,
  type KeywordBundle,
} from "../server/context-search.ts";

type IndexedDocument = Parameters<typeof searchIndexedDocuments>[1][number];

function createIndexedDocument({
  id,
  path: relativePath,
  title,
  cluster,
  kind,
  content,
  pathTokens = [],
  symbolTokens = [],
  references = [],
}: {
  id: string;
  path: string;
  title?: string;
  cluster?: string;
  kind?: string;
  content: string;
  pathTokens?: string[];
  symbolTokens?: string[];
  references?: string[];
}): IndexedDocument {
  const contentTokens = content
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return {
    id,
    path: relativePath,
    absolutePath: `/virtual/${relativePath}`,
    title: title ?? path.basename(relativePath),
    cluster: cluster ?? relativePath.split("/")[0] ?? "test",
    kind: kind ?? "code",
    content,
    lines: content.split("\n"),
    tokens: new Set([...pathTokens, ...symbolTokens, ...contentTokens]),
    pathTokens: new Set(pathTokens),
    symbolTokens: new Set(symbolTokens),
    references,
  };
}

test("buildKeywordBundleFromText keeps grounded terms and isolates unknown terms", () => {
  const vocabulary = new Set([
    "keyword",
    "graph",
    "cluster",
    "search",
    "token",
    "evidence",
  ]);

  const bundle = buildKeywordBundleFromText(
    {
      scenarioText: "Graph cluster token token bananas evidence search",
      maxKeywords: 6,
      provider: "openai",
    },
    vocabulary,
  );

  assert.equal(bundle.provider, "openai");
  assert.ok(bundle.accepted.some((term) => term.canonicalTerm === "token"));
  assert.ok(bundle.accepted.some((term) => term.canonicalTerm === "graph"));
  assert.ok(bundle.accepted.some((term) => term.canonicalTerm === "cluster"));
  assert.ok(bundle.accepted.some((term) => term.canonicalTerm === "search"));
  assert.ok(bundle.unknownTerms.includes("bananas"));
  assert.ok(
    bundle.accepted.find((term) => term.canonicalTerm === "token")?.expansions.includes("semantic"),
  );
});

test("searchIndexedDocuments ranks exact path and symbol matches above loose content matches", () => {
  const keywords: KeywordBundle = {
    provider: "deterministic",
    accepted: [
      {
        term: "context",
        canonicalTerm: "context",
        weight: 1,
        expansions: ["search"],
        source: "deterministic",
      },
      {
        term: "search",
        canonicalTerm: "search",
        weight: 1,
        expansions: ["query"],
        source: "deterministic",
      },
    ],
    rejectedTerms: [],
    unknownTerms: [],
    synthesisTrace: [],
  };

  const docs: IndexedDocument[] = [
    createIndexedDocument({
      id: "src/views/ContextSearchView.tsx",
      path: "src/views/ContextSearchView.tsx",
      title: "ContextSearchView.tsx",
      cluster: "src",
      kind: "view",
      content: [
        "export function ContextSearchView() {",
        "  return null;",
        "}",
        "This view renders deterministic keyword search.",
      ].join("\n"),
      pathTokens: ["src", "views", "context", "search", "view"],
      symbolTokens: ["context", "search", "view"],
    }),
    createIndexedDocument({
      id: "docs/search-notes.md",
      path: "docs/search-notes.md",
      title: "Search notes",
      cluster: "docs",
      kind: "doc",
      content: "# Search notes\nThis note mentions search once for context.",
      pathTokens: ["docs", "notes"],
      symbolTokens: [],
    }),
  ];

  const hits = searchIndexedDocuments(keywords, docs);

  assert.equal(hits[0]?.id, "src/views/ContextSearchView.tsx");
  assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0));
  assert.ok(hits[0]?.exactPathMatches.includes("context"));
  assert.ok(hits[0]?.symbolMatches.includes("search"));
});

test("buildInterviewScript ties claims to evidence and transport artifacts", () => {
  const keywords: KeywordBundle = {
    provider: "deterministic",
    accepted: [
      {
        term: "context",
        canonicalTerm: "context",
        weight: 0.92,
        expansions: ["search"],
        source: "deterministic",
      },
      {
        term: "graph",
        canonicalTerm: "graph",
        weight: 0.74,
        expansions: ["node", "cluster"],
        source: "deterministic",
      },
    ],
    rejectedTerms: [],
    unknownTerms: ["bananas"],
    synthesisTrace: ["provider=deterministic", "accepted=2", "unknown=1"],
  };

  const hits = [
    {
      id: "src/views/ContextSearchView.tsx",
      path: "src/views/ContextSearchView.tsx",
      title: "ContextSearchView.tsx",
      cluster: "src",
      kind: "view",
      score: 18.4,
      matchedTerms: ["context", "graph"],
      symbolMatches: ["context", "search"],
      exactPathMatches: ["context"],
      contentMatches: 4,
      excerpt: "This view renders deterministic keyword search.",
    },
  ];

  const clusters = [
    {
      id: "src",
      label: "src",
      score: 18.4,
      matchedTerms: ["context", "graph"],
      topHitIds: ["src/views/ContextSearchView.tsx"],
      transferReasons: ["matched context", "matched graph"],
    },
  ];

  const summary =
    "The repo response concentrates around src, with ContextSearchView.tsx as the strongest grounded reference.";

  const interview = buildInterviewScript(summary, hits, clusters, keywords);

  assert.equal(interview.speakers.length, 5);
  assert.equal(interview.turns.length, 5);
  assert.equal(interview.turns[4]?.text, summary);
  assert.ok(interview.turns[1]?.evidenceRefs.includes("src/views/ContextSearchView.tsx"));
  assert.ok(interview.turns[2]?.artifactRefs.includes("artifact-graph"));
  assert.ok(interview.artifacts.some((artifact) => artifact.type === "heatmap"));
});

test("runContextSearch returns grounded artifacts against the repo", async () => {
  const repoRoot = path.resolve(process.cwd(), "..");

  const result = await runContextSearch(
    {
      scenarioText:
        "deterministic context search keywords graph cluster interview evidence",
      maxKeywords: 8,
      provider: "deterministic",
    },
    repoRoot,
  );

  assert.ok(result.keywords.accepted.length >= 3);
  assert.ok(result.hits.length >= 1);
  assert.ok(result.clusters.length >= 1);
  assert.equal(
    result.interview.turns[result.interview.turns.length - 1]?.text,
    result.summary,
  );
});

test("parseRuntimeArgs applies defaults, recognizes flags, and clamps max keywords", () => {
  const args = parseRuntimeArgs([
    "--scenario=token dense workflow",
    "--context", "repo-native evidence",
    "--problem", "show mechanical stages",
    "--max-keywords", "30",
    "--provider", "openai",
    "--stage", "query",
    "--print-json",
  ]);

  assert.equal(args.scenarioText, "token dense workflow");
  assert.equal(args.optionalContext, "repo-native evidence");
  assert.equal(args.optionalProblemFrame, "show mechanical stages");
  assert.equal(args.maxKeywords, 12);
  assert.equal(args.provider, "openai");
  assert.equal(args.stage, "query");
  assert.equal(args.printJson, true);
});

test("runContextSearchWorkflow fails closed on empty scenario text", async () => {
  const repoRoot = path.resolve(process.cwd(), "..");

  await assert.rejects(
    () => runContextSearchWorkflow({
      scenarioText: "   ",
      optionalContext: "",
      optionalProblemFrame: "",
      maxKeywords: 8,
      provider: "deterministic",
      stage: "full",
      printJson: false,
    }, repoRoot),
    /scenarioText is required/,
  );
});

test("buildObservation reports stable counts and top-result fields", () => {
  const args = {
    scenarioText: "token dense flow",
    optionalContext: "",
    optionalProblemFrame: "",
    maxKeywords: 8,
    provider: "deterministic" as const,
    stage: "full" as const,
    printJson: false,
  };

  const keywords: KeywordBundle = {
    provider: "deterministic",
    accepted: [
      {
        term: "token",
        canonicalTerm: "token",
        weight: 0.91,
        expansions: ["keyword"],
        source: "deterministic",
      },
      {
        term: "graph",
        canonicalTerm: "graph",
        weight: 0.84,
        expansions: ["node", "cluster"],
        source: "deterministic",
      },
    ],
    rejectedTerms: ["with"],
    unknownTerms: ["bananas"],
    synthesisTrace: [],
  };

  const validation = validateVocabulary(keywords);
  const observation = buildObservation(
    args,
    keywords,
    [
      {
        id: "glimpse-artifact/src/views/ContextSearchView.tsx",
        path: "glimpse-artifact/src/views/ContextSearchView.tsx",
        title: "ContextSearchView.tsx",
        cluster: "glimpse-artifact",
        kind: "view",
        score: 18.2,
        matchedTerms: ["token", "graph"],
        symbolMatches: ["graph"],
        exactPathMatches: ["token"],
        contentMatches: 4,
        excerpt: "Evidence hits remain the truth layer.",
      },
    ],
    [
      {
        id: "glimpse-artifact",
        label: "glimpse-artifact",
        score: 18.2,
        matchedTerms: ["token", "graph"],
        topHitIds: ["glimpse-artifact/src/views/ContextSearchView.tsx"],
        transferReasons: ["matched token", "matched graph"],
      },
    ],
    "The repo response concentrates around glimpse-artifact.",
    validation,
  );

  assert.equal(observation.acceptedKeywordCount, 2);
  assert.equal(observation.rejectedTermCount, 1);
  assert.equal(observation.unknownTermCount, 1);
  assert.equal(observation.hitCount, 1);
  assert.equal(observation.clusterCount, 1);
  assert.equal(observation.topCluster, "glimpse-artifact");
  assert.equal(observation.topHit, "glimpse-artifact/src/views/ContextSearchView.tsx");
  assert.match(observation.confidenceSummary, /grounding/i);
  assert.ok(observation.warnings.some((warning) => warning.includes("Unknown terms")));
});

test("printWorkflowSummary emits stages in the token-dense order", async () => {
  const repoRoot = path.resolve(process.cwd(), "..");

  const result = await runContextSearchWorkflow({
    scenarioText: "scenario token keyword search graph cluster interview evidence",
    optionalContext: "",
    optionalProblemFrame: "",
    maxKeywords: 8,
    provider: "deterministic",
    stage: "full",
    printJson: false,
  }, repoRoot);

  const stageOrder = result.prints.map((entry) => entry.stage);
  assert.deepEqual(stageOrder, [
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
  ]);

  const lines = printWorkflowSummary(result);
  assert.ok(lines[0]?.includes("Contract-Grounded Routine Workflow"));
  assert.ok(lines.some((line) => line.includes("[completed] exportable synthesis")));
});

test("stage boundaries stop at the intended output surface", async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const baseInput = {
    scenarioText: "scenario token keyword search graph cluster interview evidence",
    optionalContext: "",
    optionalProblemFrame: "",
    maxKeywords: 8,
    provider: "deterministic" as const,
    printJson: false,
  };

  const keywordStage = await runContextSearchWorkflow({ ...baseInput, stage: "keywords" as const }, repoRoot);
  assert.equal(keywordStage.hits.length, 0);
  assert.equal(keywordStage.artifacts.length, 0);
  assert.equal(keywordStage.interview.turns.length, 0);
  assert.equal(keywordStage.prints[3]?.status, "skipped");

  const queryStage = await runContextSearchWorkflow({ ...baseInput, stage: "query" as const }, repoRoot);
  assert.ok(queryStage.hits.length >= 1);
  assert.ok(queryStage.graph.nodes.length >= 1);
  assert.equal(queryStage.artifacts.length, 0);
  assert.equal(queryStage.interview.turns.length, 0);
  assert.equal(queryStage.prints[7]?.status, "skipped");

  const interviewStage = await runContextSearchWorkflow({ ...baseInput, stage: "interview" as const }, repoRoot);
  assert.ok(interviewStage.artifacts.length >= 1);
  assert.ok(interviewStage.interview.turns.length >= 1);
  assert.equal(interviewStage.prints[9]?.status, "skipped");

  const fullStage = await runContextSearchWorkflow({ ...baseInput, stage: "full" as const }, repoRoot);
  assert.equal(fullStage.prints[9]?.status, "completed");
});

test("provider posture does not change deterministic scoring", () => {
  const vocabulary = new Set(["token", "search", "graph", "cluster", "evidence"]);
  const docs: IndexedDocument[] = [
    createIndexedDocument({
      id: "src/views/ContextSearchView.tsx",
      path: "src/views/ContextSearchView.tsx",
      title: "ContextSearchView.tsx",
      cluster: "src",
      kind: "view",
      content: "token search graph cluster evidence",
      pathTokens: ["src", "views", "token", "search"],
      symbolTokens: ["graph", "cluster"],
    }),
  ];

  const deterministicBundle = buildKeywordBundleFromText({
    scenarioText: "token search graph cluster evidence",
    optionalContext: "",
    optionalProblemFrame: "",
    maxKeywords: 8,
    provider: "deterministic",
  }, vocabulary);

  const providerBundle = buildKeywordBundleFromText({
    scenarioText: "token search graph cluster evidence",
    optionalContext: "",
    optionalProblemFrame: "",
    maxKeywords: 8,
    provider: "openai",
  }, vocabulary);

  const deterministicHits = searchIndexedDocuments(deterministicBundle, docs);
  const providerHits = searchIndexedDocuments(providerBundle, docs);

  assert.deepEqual(
    providerHits.map((hit) => ({ id: hit.id, score: hit.score, matchedTerms: hit.matchedTerms })),
    deterministicHits.map((hit) => ({ id: hit.id, score: hit.score, matchedTerms: hit.matchedTerms })),
  );
});
