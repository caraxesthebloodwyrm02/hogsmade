import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildQuestionQueue,
  runResolutionWorkbench,
  type ResolutionCandidate,
  type ResolutionWorkbenchResult,
} from "../server/resolution-workbench.ts";
import type { KeywordBundle } from "../server/context-search.ts";

function createCandidate(
  overrides: Partial<ResolutionCandidate> & Pick<ResolutionCandidate, "id" | "label">,
): ResolutionCandidate {
  return {
    id: overrides.id,
    label: overrides.label,
    endpointType: overrides.endpointType ?? "mcp_tool",
    cluster: overrides.cluster ?? "grid-server",
    filePath: overrides.filePath ?? "grid-server/src/server.ts",
    route: overrides.route,
    score: overrides.score ?? 5,
    confidence: overrides.confidence ?? 0.7,
    matchedTerms: overrides.matchedTerms ?? ["penalty"],
    reasons: overrides.reasons ?? ["matched penalty"],
    evidenceRefs: overrides.evidenceRefs ?? ["grid-server/src/server.ts"],
    recommendedAction: overrides.recommendedAction ?? "Review this surface.",
  };
}

test("buildQuestionQueue asks disambiguation questions when the top candidates are close", () => {
  const keywords: KeywordBundle = {
    provider: "deterministic",
    accepted: [
      {
        term: "penalty",
        canonicalTerm: "penalty",
        weight: 1,
        expansions: ["admission"],
        source: "deterministic",
      },
    ],
    rejectedTerms: [],
    unknownTerms: [],
    synthesisTrace: [],
  };

  const candidates = [
    createCandidate({ id: "a", label: "admission_apply_penalty", score: 6.4 }),
    createCandidate({
      id: "b",
      label: "report_corruption_event",
      score: 5.5,
      cluster: "GRID-main",
    }),
  ];

  const observation: ResolutionWorkbenchResult["observation"] = {
    confidenceScore: 0.58,
    confidenceSummary: "Moderate confidence",
    ambiguitySummary: "Ambiguity remains",
    dominantCluster: "grid-server",
    dominantCandidate: "admission_apply_penalty",
    recommendedNextStep: "Stay in review mode.",
    warnings: [],
  };

  const questions = buildQuestionQueue("penalty", keywords, candidates, observation);

  assert.ok(questions.some((question) => question.id === "q-close-candidates"));
  assert.ok(questions.some((question) => question.id === "q-penalty-shape"));
});

test("runResolutionWorkbench resolves recognition prompts toward eligibility-style surfaces", async () => {
  const repoRoot = path.resolve(process.cwd(), "../..");

  const result = await runResolutionWorkbench(
    {
      prompt: "recognize hidden contributors and route credit with evidence and forms",
      mode: "recognition",
      context: "Need a recognition endpoint for under-credited people.",
    },
    repoRoot,
  );

  assert.ok(result.candidates.length >= 1);
  assert.ok(result.questions.length >= 1);
  assert.ok(result.graph.nodes.length >= 1);
  assert.ok(
    result.candidates.some((candidate) =>
      /eligibility|collect|compile|evaluate|trace|knowledge/i.test(
        candidate.label + " " + candidate.filePath,
      ),
    ),
  );
});

test("runResolutionWorkbench resolves penalty prompts toward gate, admission, or corruption surfaces", async () => {
  const repoRoot = path.resolve(process.cwd(), "../..");

  const result = await runResolutionWorkbench(
    {
      prompt: "find the endpoint for corruption penalty delivery with accountability and admission",
      mode: "penalty",
      context: "Need a review surface before any consequence.",
    },
    repoRoot,
  );

  assert.ok(result.candidates.length >= 1);
  assert.ok(
    result.candidates.some((candidate) =>
      /penalty|admission|corruption|gate|accountability/i.test(
        candidate.label + " " + candidate.filePath,
      ),
    ),
  );
  assert.ok(result.observation.confidenceScore > 0);
});
