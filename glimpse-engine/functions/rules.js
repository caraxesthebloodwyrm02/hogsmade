/**
 * Rule evaluation engine for the Glimpse engine.
 * Applies rules to entities, relations, and datasets to derive insights.
 */

import {
  createEvidence,
} from "../analysis/relations.js";
import {
  clamp,
  clone,
  compareFact,
  resolvePath,
  unique,
} from "../utils/utils.js";
import {
  createEvaluationContext,
  createSafeFunctionRegistry,
} from "./functions.js";

function inferRuleScope(rule, config) {
  if (rule.applies_to && rule.applies_to !== "auto") return rule.applies_to;
  if (rule.function) {
    const functionScope = config.function_registry?.[rule.function]?.scope || [];
    if (functionScope.length === 1) return functionScope[0];
  }
  const facts = [...(rule.when || []), ...(rule.guards || [])].map((condition) => condition.fact || "");
  if (facts.some((fact) => fact.startsWith("relation.") || fact.startsWith("source.") || fact.startsWith("target."))) return "relation";
  if (facts.some((fact) => fact.startsWith("entity."))) return "entity";
  if (facts.some((fact) => fact.startsWith("view."))) return "view";
  return "dataset";
}

function buildRuleTrace(rule, scopeType, targetId) {
  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    scope: scopeType,
    targetId,
    status: "skipped",
    mode: rule.function ? "function" : "legacy",
    functionName: rule.function || "",
    args: clone(rule.args || {}),
    guardResult: "not-run",
    guardFailures: [],
    validationErrors: [],
    output: null,
    emittedEvidenceIds: [],
    finalImpact: {
      lenses: [],
      views: [],
      relations: [],
    },
  };
}

function evaluateCondition(condition, context, scopeType, registry) {
  if (condition.function) {
    const validation = registry.validate(condition.function, condition.args || {}, scopeType);
    if (!validation.ok) {
      return {
        passed: false,
        validationErrors: validation.errors,
        mode: "function",
        output: null,
      };
    }
    try {
      const output = registry.invoke(condition.function, context, condition.args || {});
      return {
        passed: output.matched !== false,
        validationErrors: [],
        mode: "function",
        output,
      };
    } catch (error) {
      return {
        passed: false,
        validationErrors: [error.message],
        mode: "function",
        output: null,
      };
    }
  }

  const actual = resolvePath(context, condition.fact);
  return {
    passed: compareFact(actual, condition.op, condition.value),
    validationErrors: [],
    mode: "legacy",
    output: { matched: compareFact(actual, condition.op, condition.value), value: actual },
  };
}

function evaluateGuardSet(rule, context, scopeType, registry, trace) {
  const guards = rule.guards || [];
  if (!guards.length) {
    trace.guardResult = "none";
    return { ok: true };
  }

  for (const guard of guards) {
    const result = evaluateCondition(guard, context, scopeType, registry);
    if (result.validationErrors.length) {
      trace.guardResult = "validation_error";
      trace.guardFailures.push(...result.validationErrors);
      return { ok: false, validationErrors: result.validationErrors };
    }
    if (!result.passed) {
      trace.guardResult = "blocked";
      trace.guardFailures.push(guard.function ? `Guard ${guard.function} returned false.` : `${guard.fact} did not match.`);
      return { ok: false };
    }
  }

  trace.guardResult = "passed";
  return { ok: true };
}

function deriveConfidence(rule, result, config) {
  const floor = Number(config.defaults?.evidence_confidence_floor || 0.35);
  const strategy = rule.weight_strategy || "priority";
  if (strategy === "direct_score") return clamp(Math.max(floor, Number(result.score ?? result.value ?? 0)), floor, 1);
  if (strategy === "normalized_value") return clamp(Math.max(floor, Number(result.value || 0)), floor, 1);
  if (strategy === "boolean_boost") return result.matched ? Math.max(floor, 0.7) : floor;
  return clamp(Math.max(floor, 0.4 + Math.min(0.45, rule.priority / 220)), floor, 1);
}

function applyAction(action, context, evidence, state, trace) {
  if (action.action === "boost_lens") {
    const lens = action.lens;
    const weight = Number(action.score || 0);
    if (!state.lensBuckets[lens]) {
      state.lensBuckets[lens] = { score: 0, evidenceIds: [], label: state.lensLabels[lens] || lens };
    }
    state.lensBuckets[lens].score += weight * evidence.confidence;
    state.lensBuckets[lens].evidenceIds.push(evidence.id);
    trace.finalImpact.lenses.push(lens);
    if (context.entity?.id) {
      state.entityLensScores[context.entity.id] ||= {};
      state.entityLensScores[context.entity.id][lens] = (state.entityLensScores[context.entity.id][lens] || 0) + weight * evidence.confidence;
    }
  }

  if (action.action === "prefer_view") {
    const view = action.view;
    state.viewPreferences[view] = (state.viewPreferences[view] || 0) + Number(action.score || 0) * evidence.confidence;
    trace.finalImpact.views.push(view);
  }

  if (action.action === "annotate_relation" && context.relation) {
    context.relation.tags ||= [];
    context.relation.tags.push(action.tag || "annotated");
    context.relation.evidenceIds.push(evidence.id);
    trace.finalImpact.relations.push(context.relation.id);
  }
}

function emitDiagnosticEvidence(rule, scopeType, targetId, message, state) {
  const evidence = createEvidence({
    sourceRuleId: rule.id,
    confidence: 0.4,
    scope: scopeType,
    targetId,
    affects: ["diagnostics"],
    reason: message,
    payload: { diagnostic: true },
  });
  state.evidences.push(evidence);
  state.validationReport.diagnostics.push(message);
  return evidence;
}

export function applyRules(config, datasetScope, entities, relations) {
  const registry = createSafeFunctionRegistry(config);
  const entitiesById = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
  const state = {
    lensBuckets: {},
    lensLabels: Object.fromEntries((config.taxonomy?.domains || []).map((domain) => [domain.id, domain.label])),
    entityLensScores: {},
    viewPreferences: {},
    evidences: [],
    ruleTraces: [],
    registryInventory: registry.list(),
    validationReport: {
      configErrors: [],
      missingFunctions: [],
      invalidArgs: [],
      skippedRules: [],
      diagnostics: [],
    },
  };

  (config.rules || []).filter((rule) => rule.enabled !== false).forEach((rule) => {
    const scopeType = inferRuleScope(rule, config);
    const items = scopeType === "entity" ? entities : scopeType === "relation" ? relations : [datasetScope];

    items.forEach((item) => {
      const targetId = scopeType === "entity" ? item.id : scopeType === "relation" ? item.id : "dataset";
      const context = createEvaluationContext(scopeType, item, datasetScope, entitiesById, config);
      const trace = buildRuleTrace(rule, scopeType, targetId);
      const guardResult = evaluateGuardSet(rule, context, scopeType, registry, trace);

      if (!guardResult.ok) {
        trace.status = trace.guardResult === "validation_error" ? "validation_error" : "guard_blocked";
        if (guardResult.validationErrors?.length) {
          state.validationReport.invalidArgs.push(...guardResult.validationErrors);
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, guardResult.validationErrors.join(" "), state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
        } else {
          state.validationReport.skippedRules.push(`${rule.id}:${targetId}`);
        }
        state.ruleTraces.push(trace);
        return;
      }

      let matched = false;
      let output = null;

      if (rule.function) {
        const validation = registry.validate(rule.function, rule.args || {}, scopeType);
        if (!validation.ok) {
          trace.status = "validation_error";
          trace.validationErrors.push(...validation.errors);
          state.validationReport.invalidArgs.push(...validation.errors);
          if (validation.errors.some((error) => error.includes("no runtime handler") || error.includes("not exposed"))) {
            state.validationReport.missingFunctions.push(rule.function);
          }
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, validation.errors.join(" "), state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
          state.ruleTraces.push(trace);
          return;
        }

        try {
          output = registry.invoke(rule.function, context, rule.args || {});
          trace.output = output;
          matched = output.matched !== false;
        } catch (error) {
          trace.status = "execution_error";
          trace.validationErrors.push(error.message);
          state.validationReport.diagnostics.push(error.message);
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, error.message, state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
          state.ruleTraces.push(trace);
          return;
        }
      } else {
        matched = (rule.when || []).every((condition) => {
          const actual = resolvePath(context, condition.fact);
          return compareFact(actual, condition.op, condition.value);
        });
        trace.output = { matched };
      }

      if (!matched) {
        trace.status = "skipped";
        state.validationReport.skippedRules.push(`${rule.id}:${targetId}`);
        state.ruleTraces.push(trace);
        return;
      }

      const evidence = createEvidence({
        sourceRuleId: rule.id,
        confidence: deriveConfidence(rule, output || { matched: true }, config),
        scope: scopeType,
        targetId,
        affects: rule.affects || [],
        reason: output?.reason || rule.because || rule.label,
        payload: {
          ruleLabel: rule.label,
          functionName: rule.function || null,
          args: clone(rule.args || {}),
          returns: rule.returns || null,
          result: output ? clone(output) : null,
        },
      });
      state.evidences.push(evidence);
      trace.status = "fired";
      trace.emittedEvidenceIds.push(evidence.id);
      (rule.derive || []).forEach((action) => applyAction(action, context, evidence, state, trace));
      state.ruleTraces.push(trace);
    });
  });

  return state;
}

export function summarizeLenses(config, lensBuckets, presetId) {
  const preset = config.presets?.[presetId] || {};
  const weights = preset.lens_weights || {};
  const scored = Object.entries(lensBuckets)
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      rawScore: bucket.score,
      score: bucket.score * (weights[id] || 1),
      evidenceIds: unique(bucket.evidenceIds),
    }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return [{ id: "general", label: "General", score: 1, rawScore: 1, role: "primary", evidenceIds: [] }];
  }

  const primary = scored[0];
  const threshold = config.defaults?.secondary_lens_threshold || 0.42;
  const limit = config.defaults?.top_secondary_limit || 3;
  return scored
    .filter((lens, index) => index === 0 || lens.score >= primary.score * threshold)
    .slice(0, 1 + limit)
    .map((lens, index) => ({
      ...lens,
      score: Number((lens.score / primary.score).toFixed(3)),
      role: index === 0 ? "primary" : "secondary",
    }));
}

export function validateConfigWithRegistry(config) {
  const registry = createSafeFunctionRegistry(config);
  const report = {
    configErrors: [],
    missingFunctions: [],
    invalidArgs: [],
    skippedRules: [],
    diagnostics: [],
    registryInventory: registry.list(),
  };

  (config.rules || []).filter((rule) => rule.enabled !== false && rule.function).forEach((rule) => {
    const scopeType = inferRuleScope(rule, config);
    const validation = registry.validate(rule.function, rule.args || {}, scopeType);
    if (!validation.ok) {
      if (validation.errors.some((error) => error.includes("no runtime handler") || error.includes("not exposed"))) {
        report.missingFunctions.push(rule.function);
      }
      report.invalidArgs.push(...validation.errors.map((error) => `${rule.id}: ${error}`));
    }
  });

  return report;
}
