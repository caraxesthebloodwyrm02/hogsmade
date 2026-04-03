import test from "node:test";
import assert from "node:assert/strict";

import { parseExperimentDashboardResponse } from "../src/hooks/useExperiments.ts";
import { parseFocusStatusResponse } from "../src/hooks/useFocusSession.ts";

test("parses experiment dashboard payloads", () => {
  const experiments = parseExperimentDashboardResponse({
    count: 1,
    experiments: [
      {
        id: "exp-1",
        name: "duration-check",
        status: "completed",
        metric: "Run duration (ms)",
        baselineValue: 2450,
        currentValue: 2450,
        startedAt: "2026-03-20T10:00:00.000Z",
        completedAt: "2026-03-20T12:00:00.000Z",
      },
    ],
  });

  assert.equal(experiments.length, 1);
  assert.equal(experiments[0]?.status, "completed");
});

test("parses null focus status payloads", () => {
  const session = parseFocusStatusResponse({ active: false, session: null });
  assert.equal(session, null);
});

test("parses active focus status payloads", () => {
  const session = parseFocusStatusResponse({
    active: true,
    session: {
      id: "focus-1",
      workflowName: "glimpse-artifact — Implement dashboard sync",
      status: "running",
      steps: [
        { name: "Declared focus", status: "done" },
        { name: "Deep work", status: "running" },
        { name: "Archive session", status: "pending" },
      ],
      startedAt: "2026-03-25T10:00:00.000Z",
      elapsedMs: 60000,
    },
  });

  assert.equal(session?.workflowName, "glimpse-artifact — Implement dashboard sync");
  assert.equal(session?.steps.length, 3);
});
