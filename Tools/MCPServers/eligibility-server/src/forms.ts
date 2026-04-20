import type {
  ConditionNote,
  FormArtifact,
  HierarchySlice,
  ObservationNote,
  ProvenanceCredit,
  RoutineArgs,
} from "./types.js";

interface CompileArtifactsInput {
  args: RoutineArgs;
  seed: string;
  argvSignature: string;
  candidateIds: string[];
  hierarchy: HierarchySlice[];
  conditions: ConditionNote[];
  observations: ObservationNote[];
  summary: string;
}

const ALL_FORM_TARGETS = ["server_tool", "rule", "agent", "skill", "reference"] as const;

function formatArgs(args: RoutineArgs): string {
  return [
    `governance=${args.governance.toFixed(2)}`,
    `usability=${args.usability.toFixed(2)}`,
    `integration=${args.integration.toFixed(2)}`,
    `observability=${args.observability.toFixed(2)}`,
    `operationalFit=${args.operationalFit.toFixed(2)}`,
    `formTarget=${args.formTarget}`,
    `tableScope=${args.tableScope}`,
  ].join(", ");
}

function topOverall(hierarchy: HierarchySlice[]): HierarchySlice[] {
  return hierarchy
    .filter((slice) => slice.dimension === "overall")
    .sort((left, right) => left.rank - right.rank);
}

function buildCredit(kind: FormArtifact["kind"], candidateIds: string[]): ProvenanceCredit {
  return {
    sourcePass: "compile-reusable-forms",
    sourceArtifact: kind,
    sourceIds: candidateIds,
    creditLabel: `runtime-backed:${candidateIds.join(",")}`,
  };
}

function buildServerToolManifest(input: CompileArtifactsInput): FormArtifact {
  return {
    kind: "server_tool",
    path: "eligibility-server/src/server.ts",
    title: "Eligibility server tool manifest",
    runtimeBacked: true,
    candidateIds: input.candidateIds,
    credit: buildCredit("server_tool", input.candidateIds),
    content: JSON.stringify(
      {
        summary: input.summary,
        seed: input.seed,
        argvSignature: input.argvSignature,
        tools: [
          "list_attribute_catalog",
          "evaluate_candidate",
          "compile_forms",
          "collect_table",
          "explain_hierarchy",
        ],
      },
      null,
      2,
    ),
  };
}

function buildRuleArtifact(input: CompileArtifactsInput): FormArtifact {
  const top = topOverall(input.hierarchy).slice(0, 3);

  return {
    kind: "rule",
    path: ".cursor/rules/eligibility-routine.mdc",
    title: "Eligibility routine rule surface",
    runtimeBacked: false,
    candidateIds: input.candidateIds,
    credit: buildCredit("rule", input.candidateIds),
    content: `---
description: Runtime-backed eligibility routine guidance for weighted integration triage
globs: **/*
alwaysApply: false
---

# Eligibility routine

Runtime-backed seed: \`${input.seed}\`
Args: ${formatArgs(input.args)}

Top overall ordering:
${top
  .map((slice) => `- ${slice.candidateId} (rank ${slice.rank}, score ${slice.score.toFixed(3)})`)
  .join("\n")}

Conditions:
${input.conditions.map((note) => `- [${note.severity}] ${note.message}`).join("\n") || "- none"}

Observation notes:
${input.observations.map((note) => `- ${note.message}`).join("\n") || "- none"}
`,
  };
}

function buildAgentArtifact(input: CompileArtifactsInput): FormArtifact {
  return {
    kind: "agent",
    path: ".cursor/agents/eligibility-routine.md",
    title: "Eligibility routine agent surface",
    runtimeBacked: false,
    candidateIds: input.candidateIds,
    credit: buildCredit("agent", input.candidateIds),
    content: `---
name: eligibility-routine
description: Evaluate weighted eligibility candidates into hierarchy, conditions, observations, forms, and collection tables.
---

You are the eligibility-routine agent.

Use the runtime-backed result first. Treat observations as annotations and not as replacements for the weighted hierarchy.

Current seed: ${input.seed}
Current argv signature: ${input.argvSignature}

Summary:
${input.summary}
`,
  };
}

function buildSkillArtifact(input: CompileArtifactsInput): FormArtifact {
  return {
    kind: "skill",
    path: ".cursor/skills/eligibility-routine/SKILL.md",
    title: "Eligibility routine skill surface",
    runtimeBacked: false,
    candidateIds: input.candidateIds,
    credit: buildCredit("skill", input.candidateIds),
    content: `---
name: eligibility-routine
description: Evaluate integration-eligibility candidates into weighted hierarchy, condition notes, observation notes, and collection tables. Use when turning a candidate or fixture into rule, agent, skill, server, or table outputs.
---

# Eligibility routine

Use runtime-backed outputs as the truth layer. Reuse the generated hierarchy, conditions, observations, and collection rows when compiling downstream forms.

Seed: \`${input.seed}\`
Args: ${formatArgs(input.args)}

Summary:
${input.summary}
`,
  };
}

function buildReferenceArtifact(input: CompileArtifactsInput): FormArtifact {
  const top = topOverall(input.hierarchy).slice(0, 3);

  return {
    kind: "reference",
    path: "eligibility-server/ELIGIBILITY_SCHEMA.md",
    title: "Eligibility routine reference schema",
    runtimeBacked: true,
    candidateIds: input.candidateIds,
    credit: buildCredit("reference", input.candidateIds),
    content: `# Eligibility routine schema

Seed: \`${input.seed}\`
Argv signature: \`${input.argvSignature}\`

## Summary
${input.summary}

## Top overall ordering
${top
  .map((slice) => `- ${slice.candidateId}: ${slice.score.toFixed(3)} (rank ${slice.rank})`)
  .join("\n")}

## Conditions
${input.conditions.map((note) => `- ${note.id}: ${note.message}`).join("\n") || "- none"}

## Observations
${
  input.observations
    .map((note) => `- ${note.id}: ${note.message} — ${note.surfaceHint}`)
    .join("\n") || "- none"
}
`,
  };
}

export function compileFormArtifacts(input: CompileArtifactsInput): FormArtifact[] {
  const requestedTargets =
    input.args.formTarget === "all" ? [...ALL_FORM_TARGETS] : [input.args.formTarget];

  const builders: Record<Exclude<FormArtifact["kind"], never>, () => FormArtifact> = {
    server_tool: () => buildServerToolManifest(input),
    rule: () => buildRuleArtifact(input),
    agent: () => buildAgentArtifact(input),
    skill: () => buildSkillArtifact(input),
    reference: () => buildReferenceArtifact(input),
  };

  // Validate all targets before accessing builders to prevent prototype traversal
  const validTargets = requestedTargets.filter((target): target is FormArtifact["kind"] =>
    ALL_FORM_TARGETS.includes(target as FormArtifact["kind"]),
  );
  if (validTargets.length !== requestedTargets.length) {
    throw new Error(
      `Invalid form target(s): ${requestedTargets
        .filter((t) => !ALL_FORM_TARGETS.includes(t as FormArtifact["kind"]))
        .join(", ")}`,
    );
  }

  return validTargets.map((target) => builders[target]());
}
