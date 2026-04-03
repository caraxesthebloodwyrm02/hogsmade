/**
 * Governance intake pipeline — proof of concept.
 *
 * 4-pass pipeline demonstrating the shader-pass residue pattern:
 *   1. timestamp  — marks entry (builtin, zero mutation)
 *   2. classify   — determines request type from context (active)
 *   3. evaluate   — reads classification, evaluates policies (balanced)
 *   4. summary    — reads all residue, produces summary (observant)
 */

import type { Pass, PassInput, PassOutput } from "../types.js";
import { findResidue } from "../residue.js";
import { timestampPass } from "../passes.js";
import { createPipeline } from "../pipeline.js";

export interface GovernanceState {
  requestType: string;
  context: string;
  classification?: string;
  riskLevel?: string;
  verdict?: string;
  summary?: string;
}

const classifyPass: Pass<GovernanceState> = {
  id: "governance:classify",
  description: "Classifies the governance request by context keywords",
  execute(input: PassInput<GovernanceState>): PassOutput<GovernanceState> {
    const ctx = input.state.context.toLowerCase();
    let classification = "general";
    if (ctx.includes("security") || ctx.includes("auth")) classification = "security";
    else if (ctx.includes("data") || ctx.includes("privacy")) classification = "data-governance";
    else if (ctx.includes("deploy") || ctx.includes("release")) classification = "release-gate";

    return {
      state: { ...input.state, classification },
      deposit: { classification, contextLength: input.state.context.length },
    };
  },
};

const evaluatePass: Pass<GovernanceState> = {
  id: "governance:evaluate",
  description: "Evaluates risk based on classification from prior pass",
  execute(input: PassInput<GovernanceState>): PassOutput<GovernanceState> {
    const classificationDeposit = findResidue(input.residue, "governance:classify");
    const classification = classificationDeposit?.data["classification"] as string | undefined;

    let riskLevel = "low";
    let verdict = "allow";
    if (classification === "security") {
      riskLevel = "high";
      verdict = "escalate";
    } else if (classification === "data-governance") {
      riskLevel = "medium";
      verdict = "review";
    } else if (classification === "release-gate") {
      riskLevel = "medium";
      verdict = "allow";
    }

    return {
      state: { ...input.state, riskLevel, verdict },
      deposit: { riskLevel, verdict, basedOn: classification ?? "unknown" },
    };
  },
};

const summaryPass: Pass<GovernanceState> = {
  id: "governance:summary",
  description: "Reads all prior residue and produces a governance summary",
  execute(input: PassInput<GovernanceState>): PassOutput<GovernanceState> {
    const passIds = input.residue.map((r) => r.passId);
    const summary = [
      `Governance intake processed through ${input.residue.length} prior passes`,
      `Classification: ${input.state.classification ?? "unknown"}`,
      `Risk: ${input.state.riskLevel ?? "unknown"}`,
      `Verdict: ${input.state.verdict ?? "pending"}`,
    ].join(". ");

    return {
      state: { ...input.state, summary },
      deposit: { summary, priorPasses: passIds },
    };
  },
};

export function createGovernancePipeline() {
  return createPipeline<GovernanceState>("governance-intake", [
    timestampPass<GovernanceState>(),
    classifyPass,
    evaluatePass,
    summaryPass,
  ]);
}
