I'll walk you through the Glimpse Engine build system step by step, using the codemap you've provided as our guide.

# Glimpse Engine Build System — A Complete Walkthrough

Let me guide you through this system from configuration to runtime execution. I'll explain each major component and how they interconnect.

---

## 1. Configuration Synchronization Pipeline (Trace 1)

The system starts with a **master YAML configuration** that needs to be embedded into the JavaScript engine.

### How it works

```text
glimpse.master.yaml (source of truth)
         ↓
sync-default-master.mjs (build script)
         ↓
default-master.js (embedded config)
         ↓
master-config.js (runtime parser)
```

**Key Insight**: The sync script creates a **JavaScript constant** from YAML so the engine can ship as a single-file bundle without external dependencies.

```javascript
// @/home/caraxes/CascadeProjects/scripts/sync-default-master.mjs:3-6
const yaml = readFileSync("./glimpse.master.yaml", "utf8");
const escaped = yaml.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const content = `export const DEFAULT_MASTER_YAML = \`${escaped}\`;\n`;
writeFileSync("./glimpse-engine/default-master.js", content);
```

The runtime parser then loads this embedded config and merges it with any custom overrides:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/master-config.js:55-59
export function parseMasterConfig(yamlText) {
  const parsed = parseYaml(yamlText) || {};
  const defaults = parseYaml(DEFAULT_MASTER_YAML);
  const merged = deepMerge(defaults, parsed);
  merged.rules = (merged.rules || []).map(normalizeRule).sort((a, b) => b.priority - a.priority);
```

---

## 2. Bootstrap Validation Pipeline (Trace 2)

The bootstrap script is a **comprehensive validation tool** that checks the entire Glimpse system before deployment.

### How Bootstrap Works

The bootstrap script performs **4 critical validation steps**:

1. **Load & Parse Config** — reads `glimpse.master.yaml` and validates structure
2. **Validate Function Registry** — ensures all rule functions exist and have correct signatures
3. **Run Sample Datasets** — executes the pipeline on real data to verify behavior
4. **Generate Report** — produces a JSON report with validation results

```javascript
// @/home/caraxes/CascadeProjects/scripts/bootstrap_glimpse_logic.mjs:101-107
async function main() {
  const quiet = hasFlag("--quiet");
  const reportPath = resolve(getArg("--report-json", DEFAULT_REPORT_PATH));
  const { yamlPath, config } = await loadConfig();
  const registryReport = validateConfigWithRegistry(config);
  const notebookReadiness = await checkNotebookReadiness();
  const sampleRuns = await runSamples(config);
```

The `runSamples()` function is particularly important — it actually **executes the Glimpse pipeline** on sample data:

```javascript
// @/home/caraxes/CascadeProjects/scripts/bootstrap_glimpse_logic.mjs:74-76
for (const dataset of DATASETS) {
  const raw = JSON.parse(await readFile(dataset.file, "utf8"));
  const ctx = runContextPipeline(raw, "json", config, { presetId: dataset.preset });
```

This catches runtime errors that static validation might miss.

---

## 3. Test Execution Flow (Trace 3)

The test suite validates the entire Glimpse engine using Node.js's built-in test runner.

### How Tests Work

The test suite loads the **embedded configuration** and runs it against sample datasets:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/tests/glimpse-engine.test.mjs:19
const config = parseMasterConfig(DEFAULT_MASTER_YAML);
```

Each test validates a specific aspect of the pipeline:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/tests/glimpse-engine.test.mjs:30-40
test("historical innovation dataset yields a primary lens with supporting secondary lenses", async () => {
  const data = await loadJson("sample-innovations.json");
  const ctx = runContextPipeline(data, "json", config, {
    presetId: "researcher",
  });

  assert.ok(ctx);
  assert.equal(ctx.primaryLens.id, "structured_data");
  assert.ok(ctx.secondaryLenses.length >= 1);
  assert.ok(ctx.secondaryLenses.some((lens) => lens.id === "innovation"));
  assert.ok(ctx.evidences.length > 0);
```

The final test is an **integration test** that validates the entire bootstrap process:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/tests/glimpse-engine.test.mjs:292-305
await execFileAsync(
  "node",
  [
    path.join(repoRoot, "scripts/bootstrap_glimpse_logic.mjs"),
    "--report-json",
    reportPath,
    "--quiet",
  ],
  { cwd: repoRoot },
);

const report = JSON.parse(await readFile(reportPath, "utf8"));
assert.ok(report.registry.count >= 10);
assert.equal(report.sampleRuns.length, 3);
assert.equal(Array.isArray(report.validationReport.invalidArgs), true);
```

This ensures the bootstrap script itself works correctly.

---

## 4. CI/CD Build Pipeline (Trace 4)

GitHub Actions orchestrates the entire build and validation process across multiple jobs.

### How CI/CD Works

The workflow has **3 parallel job types** that run on every push:

1. **Shared Types Build** — builds foundational contracts first
2. **MCP Servers Matrix** — builds and tests all 11 servers in parallel
3. **Glimpse Engine Verification** — runs the full test suite

```yaml
# @/home/caraxes/CascadeProjects/.github/workflows/root-typescript-ci.yml:64-81
jobs:
  # ── Shared packages (build once, every server job rebuilds from checkout) ──
  shared-types:
    name: Shared Types Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          submodules: true

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: shared-types/package-lock.json

      - run: npm ci -w shared-types
      - run: npm run build -w shared-types
```

The **servers job** uses a matrix strategy to test all servers in parallel, with conditional dependency builds:

```yaml
# @/home/caraxes/CascadeProjects/.github/workflows/root-typescript-ci.yml:123-140
- name: Build shared-types
  run: npm ci -w shared-types && npm run build -w shared-types

- name: Build shared-resilience
  if: matrix.needs_resilience
  run: npm ci -w shared-resilience && npm run build -w shared-resilience

- name: Build shared-pipeline
  if: matrix.needs_pipeline
  run: npm ci -w shared-pipeline && npm run build -w shared-pipeline

- name: Build server
  env:
    NODE_OPTIONS: '--max-old-space-size=8192'
  run: npm ci -w ${{ matrix.project }} && npm run build -w ${{ matrix.project }}

- name: Test server
  run: npm test -w ${{ matrix.project }}
```

The **Glimpse Engine job** runs the full test suite we examined earlier:

```yaml
# @/home/caraxes/CascadeProjects/.github/workflows/root-typescript-ci.yml:190-194
- name: Install deps
  run: npm ci -w glimpse-engine

- name: Run tests
  run: node --test tests/glimpse-engine.test.mjs
```

---

## 5. CLI Runtime Execution (Trace 5)

The CLI provides the user-facing interface for running Glimpse analysis on data.

### How CLI Runtime Works

The CLI is the **user-facing entry point** that orchestrates the entire Glimpse analysis:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/cli.js:27-38
const args = process.argv.slice(2);
const flags = {
  interview: args.includes('--interview'),
  json: args.includes('--json'),
  quiet: args.includes('--quiet'),
  brief: args.includes('--brief'),
  help: args.includes('--help') || args.includes('-h'),
  realtime: args.includes('--realtime'),
};
const positional = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));
const command = positional[0] || 'help';
const target = positional[1] || null;
```

The CLI delegates to the **runner** which orchestrates the full pipeline:

```javascript
// @/home/caraxes/CascadeProjects/glimpse-engine/core/runner.js:28-46
export function runGlimpse(params) {
  const { data, format = 'json', config, meta = {}, opts = {} } = params;

  // Parse CSV if needed
  const records = format === 'csv' && typeof data === 'string'
    ? parseCSV(data)
    : data;

  // 1. Run core pipeline
  const result = runContextPipeline(records, format, config);

  // 2. Learning cycle
  const learning = learnFromRun(records, result, config, {
    source: meta.source || 'glimpse',
    trigger: meta.trigger || 'manual'
  }, {
    historyPath: opts.historyPath || null,
    tracesPath: opts.tracesPath || null
  });
```

The **core pipeline** (`runContextPipeline`) is where the actual analysis happens — it's the same function called by tests, bootstrap, and the CLI.

---

## 6. End-to-End System Flow

Now let me show you how all these pieces connect in a complete development workflow:

### Development Flow

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. CONFIGURATION AUTHORING                                  │
│    Developer edits: glimpse.master.yaml                     │
│    ├─ Add/modify domains, rules, presets                    │
│    └─ Define view specifications                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. BUILD STEP (Manual or CI)                                │
│    Run: node scripts/sync-default-master.mjs                │
│    ├─ Reads glimpse.master.yaml                             │
│    ├─ Escapes special characters                            │
│    └─ Writes glimpse-engine/default-master.js               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. VALIDATION (Local or CI)                                 │
│    Run: node scripts/bootstrap_glimpse_logic.mjs            │
│    ├─ Loads embedded config via parseMasterConfig()         │
│    ├─ Validates function registry                           │
│    ├─ Runs sample datasets through pipeline                 │
│    └─ Generates validation report JSON                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. TESTING (Local or CI)                                    │
│    Run: node --test tests/glimpse-engine.test.mjs           │
│    ├─ Loads DEFAULT_MASTER_YAML constant                    │
│    ├─ Runs 13 integration tests                             │
│    ├─ Tests pipeline, views, grounding, drift detection     │
│    └─ Validates bootstrap script execution                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CI/CD DEPLOYMENT (GitHub Actions)                        │
│    Triggered on: push to any branch                         │
│    ├─ Job 1: Build shared-types                             │
│    ├─ Job 2: Build & test 11 MCP servers (matrix)           │
│    └─ Job 3: Run glimpse-engine tests                       │
│         └─ Blocks merge if any test fails                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. RUNTIME EXECUTION (Production)                           │
│    User runs: glimpse standup                               │
│    ├─ CLI parses args → calls runGlimpse()                  │
│    ├─ Runner calls runContextPipeline()                     │
│    │   ├─ Ingest: parse & normalize data                    │
│    │   ├─ Profile: detect domains & lenses                  │
│    │   ├─ Rules: apply weighted rule system                 │
│    │   └─ Articulate: generate insights                     │
│    ├─ Learning cycle: update history                        │
│    ├─ PATH evaluation: condition-driven scoring             │
│    └─ Display: formatted output to terminal                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Integration Points

1. **Single Source of Truth**: `glimpse.master.yaml` defines everything
2. **Build-Time Embedding**: Config becomes a JavaScript constant for zero-dependency deployment
3. **Multi-Layer Validation**: Bootstrap validates structure, tests validate behavior
4. **Shared Pipeline**: Same `runContextPipeline()` function used by CLI, tests, and bootstrap
5. **CI Enforcement**: GitHub Actions blocks merges if validation or tests fail

### Critical Dependencies

```text
glimpse.master.yaml (source)
    ↓
sync-default-master.mjs (build)
    ↓
default-master.js (embedded constant)
    ↓
master-config.js (parser) → parseMasterConfig()
    ↓
    ├─→ bootstrap_glimpse_logic.mjs (validation)
    ├─→ glimpse-engine.test.mjs (testing)
    └─→ runner.js → engine.js (runtime)
