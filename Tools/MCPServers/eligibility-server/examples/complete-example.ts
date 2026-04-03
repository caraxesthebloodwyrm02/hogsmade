import { DEFAULT_EXECUTE_SCENARIO, EligibilityRouter } from "../src/index.js";

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const router = new EligibilityRouter();
  const report = await router.execute({
    ...DEFAULT_EXECUTE_SCENARIO,
    id: "complete-example-execute",
    title: "Complete execute example",
    cycle: {
      ...DEFAULT_EXECUTE_SCENARIO.cycle,
      caseId: "complete-example-execute-cycle",
      label: "Complete example cycle",
    },
  });

  printSection("Scenario");
  console.log(
    JSON.stringify(
      {
        id: report.scenario.id,
        title: report.scenario.title,
        candidateIds: report.scenario.candidates.map((candidate) => candidate.id),
        args: report.normalizedArgs,
      },
      null,
      2,
    ),
  );

  printSection("Runtime Story");
  console.log(report.runtimeStory);

  printSection("Support-Balance Assist");
  console.log(JSON.stringify(report.supportBalanceAssist, null, 2));

  printSection("Topology Story");
  console.log(report.topologyStory);

  printSection("Topology Artifact");
  console.log(JSON.stringify(report.topologyArtifact, null, 2));

  printSection("Cycle Snapshot");
  console.log(
    JSON.stringify(
      {
        currentBeat: report.cycleSnapshots.promotion.snapshot.caseRecord.currentBeat,
        status: report.cycleSnapshots.promotion.snapshot.caseRecord.status,
        promotionDecision: report.cycleSnapshots.promotion.gate.decision,
        momentum: report.cycleSnapshots.promotion.snapshot.caseRecord.momentum,
      },
      null,
      2,
    ),
  );

  printSection("End Result");
  console.log(
    "execute() produced a unified runtime narrative, support-balance assist, and topology artifact from a single scenario run.",
  );
}

void main();
