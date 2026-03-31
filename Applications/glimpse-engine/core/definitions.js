/**
 * Custom Definition Installation
 *
 * Enables continuously installable custom patterns, functions, and rules.
 * Definitions can be serialized for persistence and loaded across sessions.
 */

/**
 * Install a custom definition into a registry.
 *
 * @param {PatternRegistry|FunctionRegistry} registry
 * @param {{ type: string, definition: object }} entry
 *   type: "pattern" | "function" | "rule"
 *   definition: the pattern/function/rule object
 * @returns {{ installed: boolean, conflicts: string[] }}
 */
export function installCustomDefinition(registry, entry) {
  const conflicts = [];
  const { type, definition } = entry;

  if (!type || !definition) {
    return { installed: false, conflicts: ["Missing type or definition."] };
  }

  if (type === "pattern") {
    if (!definition.id || !definition.name || !definition.category) {
      return {
        installed: false,
        conflicts: ["Pattern must have id, name, and category."],
      };
    }
    const existing = registry.get?.(definition.id);
    if (existing) {
      conflicts.push(
        `Pattern "${definition.id}" already exists — overwriting.`
      );
    }
    registry.register(definition);
    return { installed: true, conflicts };
  }

  if (type === "function") {
    if (!definition.name || !definition.handler) {
      return {
        installed: false,
        conflicts: ["Function must have name and handler."],
      };
    }
    const existing = registry.get?.(definition.name);
    if (existing) {
      conflicts.push(
        `Function "${definition.name}" already exists — overwriting.`
      );
    }
    registry.register(definition);
    return { installed: true, conflicts };
  }

  return {
    installed: false,
    conflicts: [`Unknown definition type: "${type}".`],
  };
}

/**
 * Serialize all custom definitions from a registry for persistence.
 *
 * @param {PatternRegistry} registry
 * @returns {string} JSON string of all definitions
 */
export function serializeDefinitions(registry) {
  const definitions = [];

  if (registry.patterns) {
    for (const pattern of registry.patterns.values()) {
      definitions.push({
        type: "pattern",
        definition: {
          id: pattern.id,
          name: pattern.name,
          description: pattern.description,
          category: pattern.category,
          conditions: pattern.conditions,
          insights: pattern.insights,
          viewRecommendations: pattern.viewRecommendations,
        },
      });
    }
  }

  return JSON.stringify(definitions, null, 2);
}

/**
 * Load definitions from a JSON string into a registry.
 *
 * @param {PatternRegistry} registry
 * @param {string} json - JSON string from serializeDefinitions
 * @returns {{ loaded: number, errors: string[] }}
 */
export function loadDefinitions(registry, json) {
  const errors = [];
  let loaded = 0;

  let entries;
  try {
    entries = JSON.parse(json);
  } catch (e) {
    return { loaded: 0, errors: [`Invalid JSON: ${e.message}`] };
  }

  if (!Array.isArray(entries)) {
    return { loaded: 0, errors: ["Expected an array of definitions."] };
  }

  for (const entry of entries) {
    const result = installCustomDefinition(registry, entry);
    if (result.installed) {
      loaded++;
    }
    errors.push(...result.conflicts);
  }

  return { loaded, errors };
}
