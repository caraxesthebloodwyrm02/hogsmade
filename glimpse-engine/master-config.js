import { load as parseYaml, dump as dumpYaml } from "../glimpse-artifact/node_modules/js-yaml/dist/js-yaml.mjs";
import { DEFAULT_MASTER_YAML } from "./default-master.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override.map((item) => clone(item)) : clone(base);
  }
  if (!isObject(base)) {
    return override === undefined ? clone(base) : clone(override);
  }

  const result = clone(base);
  if (!isObject(override)) {
    return result;
  }

  Object.entries(override).forEach(([key, value]) => {
    if (key in result) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  });
  return result;
}

function normalizeRule(rule) {
  return {
    id: rule.id || `rule-${Math.random().toString(36).slice(2, 10)}`,
    label: rule.label || "Untitled rule",
    applies_to: rule.applies_to || "auto",
    when: Array.isArray(rule.when) ? rule.when : [],
    guards: Array.isArray(rule.guards) ? rule.guards : [],
    derive: Array.isArray(rule.derive) ? rule.derive : [],
    affects: Array.isArray(rule.affects) ? rule.affects : [],
    function: rule.function || "",
    args: isObject(rule.args) ? clone(rule.args) : {},
    returns: rule.returns || "",
    weight_strategy: rule.weight_strategy || "priority",
    because: rule.because || "",
    priority: Number.isFinite(rule.priority) ? rule.priority : 50,
    enabled: rule.enabled !== false,
    promotion: rule.promotion || "active",
  };
}

export function parseMasterConfig(yamlText) {
  const parsed = parseYaml(yamlText) || {};
  const defaults = parseYaml(DEFAULT_MASTER_YAML);
  const merged = deepMerge(defaults, parsed);
  merged.rules = (merged.rules || []).map(normalizeRule).sort((a, b) => b.priority - a.priority);
  merged.function_registry = isObject(merged.function_registry) ? merged.function_registry : {};
  merged.arg_types = isObject(merged.arg_types) ? merged.arg_types : {};
  merged.rule_sets = isObject(merged.rule_sets) ? merged.rule_sets : {};
  merged.diagnostics = isObject(merged.diagnostics) ? merged.diagnostics : {};
  return merged;
}

export async function loadMasterConfig() {
  let yamlText = DEFAULT_MASTER_YAML;
  let source = "embedded-default";

  try {
    const url = new URL("../glimpse.master.yaml", import.meta.url);
    const response = await fetch(url);
    if (response.ok) {
      yamlText = await response.text();
      source = "external-file";
    }
  } catch {
    // Opening the HTML from file:// usually blocks fetch; fallback is intentional.
  }

  return {
    yamlText,
    source,
    config: parseMasterConfig(yamlText),
  };
}

export function serializeMasterConfig(config) {
  return dumpYaml(config, {
    noRefs: true,
    sortKeys: false,
    lineWidth: 100,
    quotingType: '"',
    forceQuotes: false,
  });
}

export async function saveMasterConfigToHandle(handle, config) {
  const writable = await handle.createWritable();
  await writable.write(serializeMasterConfig(config));
  await writable.close();
}

export function downloadMasterConfig(config, fileName = "glimpse.master.yaml") {
  const blob = new Blob([serializeMasterConfig(config)], { type: "application/yaml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function createRulePreview(rule) {
  const checks = rule.when.length
    ? rule.when.map((condition) => {
        const fact = condition.fact?.split(".").slice(1).join(" ") || condition.fact || "a fact";
        const op = condition.op || "is";
        const value = condition.value ?? "";
        return `${fact} ${op} ${value}`.trim();
      })
    : ["no explicit checks detected"];

  const guardChecks = rule.guards?.length
    ? rule.guards.map((condition) => {
        if (condition.function) return `guard via ${condition.function}`;
        const fact = condition.fact?.split(".").slice(1).join(" ") || condition.fact || "a fact";
        const op = condition.op || "is";
        const value = condition.value ?? "";
        return `${fact} ${op} ${value}`.trim();
      })
    : [];

  const changes = rule.derive.length
    ? rule.derive.map((action) => {
        if (action.action === "boost_lens") return `boost the ${action.lens} context`;
        if (action.action === "prefer_view") return `favor the ${action.view} view`;
        if (action.action === "annotate_relation") return `annotate relations as ${action.tag}`;
        return action.action || "make a change";
      })
    : ["no changes defined"];

  return {
    title: rule.label,
    scope: rule.applies_to,
    checks,
    guardChecks,
    changes,
    ruleType: rule.function ? "function-backed" : "legacy",
    functionName: rule.function || "",
    args: rule.args || {},
    returns: rule.returns || "",
    weightStrategy: rule.weight_strategy || "priority",
    promotion: rule.promotion || "active",
    because: rule.because || "No explanation supplied.",
  };
}
