import { loadMasterConfig, parseMasterConfig, serializeMasterConfig, saveMasterConfigToHandle, downloadMasterConfig, createRulePreview } from "./master-config.js";
import { parseCSV, runContextPipeline, buildSemanticHints, parseQueryIntent, compileRuleFromConversation, computeClusters, validateConfigWithRegistry } from "./engine.js";
import { rankViews, renderView, VIEW_SPECS } from "./view-specs.js";
import { buildPathwayEntry, logPathway } from "./pathway-logger.js";

const PHASES = [
  { num: 1, label: "Ingest" },
  { num: 2, label: "Profile" },
  { num: 3, label: "Rules" },
  { num: 4, label: "Articulate" },
];

const G = {
  version: "v0.3",
  phase: 0,
  rawData: null,
  fileName: "",
  fileType: "",
  masterConfig: null,
  masterConfigSource: "loading",
  masterYamlText: "",
  masterHandle: null,
  activePreset: "analyst",
  ctx: null,
  viewRankings: [],
  mode: "constellation",
  focus: null,
  clusterBy: "domain",
  chartType: "bar",
  query: "",
  sortCol: null,
  sortDir: 1,
  tableFilter: "",
  ruleDraft: "",
  ruleDraftResult: null,
  rulePromotion: "experimental",
  saveStatus: "",
};

let chartInstance = null;
let delegationBound = false;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function saveFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  return { id: el.id, selStart: el.selectionStart, selEnd: el.selectionEnd, scrollY: window.scrollY };
}

function restoreFocus(saved) {
  if (!saved) return;
  const el = saved.id ? document.getElementById(saved.id) : null;
  if (el) {
    el.focus();
    if (typeof el.selectionStart === "number" && saved.selStart != null) {
      try { el.setSelectionRange(saved.selStart, saved.selEnd); } catch {}
    }
  }
  window.scrollTo(0, saved.scrollY);
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function boot() {
  const { config, source, yamlText } = await loadMasterConfig();
  G.masterConfig = config;
  G.masterConfigSource = source;
  G.masterYamlText = yamlText;
  G.activePreset = config.defaults?.active_preset || "analyst";
  render();
}

function handleFile(file) {
  G.fileName = file.name;
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "json") {
    G.fileType = "json";
    file.text().then((text) => {
      G.rawData = JSON.parse(text);
      G.phase = 1;
      render();
      window.setTimeout(runPipeline, 120);
    }).catch((error) => alert(`Invalid JSON: ${error.message}`));
  } else if (ext === "csv") {
    G.fileType = "csv";
    file.text().then((text) => {
      G.rawData = parseCSV(text);
      G.phase = 1;
      render();
      window.setTimeout(runPipeline, 120);
    });
  } else {
    alert("Unsupported format. Use .json or .csv");
  }
}

function runPipeline() {
  if (!G.masterConfig) return;
  G.phase = 2;
  render();
  const ctx = runContextPipeline(G.rawData, G.fileType, G.masterConfig, { presetId: G.activePreset });
  if (!ctx) {
    G.phase = 0;
    render();
    return;
  }
  ctx.clusters = computeClusters(ctx, ctx.clusterBy || "domain");
  G.ctx = ctx;
  G.clusterBy = ctx.clusterBy;
  G.viewRankings = rankViews(ctx, G.masterConfig, G.activePreset);
  G.mode = G.viewRankings[0]?.id || "explorer";
  G.phase = 4;
  render();

  // Pathway logging — persistent root/branch trace
  const entry = buildPathwayEntry(ctx, G.fileName || "unknown");
  logPathway(entry).then(result => {
    if (result?.logged) console.info("[pathway] Trace logged:", result.file);
  }).catch(() => {});
}

function render() {
  const focus = saveFocus();
  const app = document.getElementById("app");
  app.innerHTML = [
    renderHeader(),
    renderPhaseBar(),
    renderMasterPanel(),
    G.phase === 0 ? renderUpload() : "",
    G.phase > 0 && G.phase < 4 ? renderProcessing() : "",
    G.phase >= 4 ? renderResults() : "",
    renderRuleAuthoring(),
  ].join("");
  if (!delegationBound) {
    bindDelegatedEvents();
    delegationBound = true;
  }
  restoreFocus(focus);
  if (G.phase >= 4) renderChart();
}

function renderHeader() {
  return `<div class="header"><div><h1><span>Glimpse</span> Dynamic Context Engine</h1><span class="header-badge">${G.version}</span></div><div class="header-meta">${G.fileName ? `${esc(G.fileName)} &middot; ${G.fileType.toUpperCase()}` : "No data loaded"}</div></div>`;
}

function renderPhaseBar() {
  const phaseNum = G.phase === 0 ? 0 : G.phase >= 4 ? 5 : G.phase;
  return `<div class="phase-bar">${PHASES.map((phase) => {
    const cls = phaseNum >= phase.num ? (phaseNum > phase.num ? "done" : "active") : "";
    return `<div class="phase-step ${cls}"><span class="step-num">${phaseNum > phase.num ? "&#10003;" : phase.num}</span>${phase.label}</div>`;
  }).join("")}</div>`;
}

function renderMasterPanel() {
  const presetOptions = Object.entries(G.masterConfig?.presets || {}).map(([id, preset]) => `<option value="${id}"${G.activePreset === id ? " selected" : ""}>${esc(preset.label || id)}</option>`).join("");
  const configLabel = G.masterConfigSource === "external-file" ? "Loaded `glimpse.master.yaml`" : G.masterConfigSource === "embedded-default" ? "Fallback config (use load/save for the master YAML)" : "Loading...";
  const functionCount = Object.keys(G.masterConfig?.function_registry || {}).length;
  const diagnostics = G.masterConfig?.diagnostics || {};
  return `<div class="context-panel fade-in"><div class="context-header"><h3>Master Config</h3><span class="config-status">${esc(configLabel)}</span></div><div class="context-body"><div class="master-grid"><div class="master-card"><div class="master-kicker">Preset</div><select class="cluster-select" id="presetSelect">${presetOptions}</select><div class="master-help">Presets change lens and view weighting without changing the raw evidence.</div></div><div class="master-card"><div class="master-kicker">Semantic Hints</div><div class="hint-list">${buildSemanticHints(G.masterConfig || { taxonomy: { domains: [] } }).slice(0, 5).map((hint) => `<span class="hint-chip">${esc(hint.label)}: ${esc(hint.sampleTerms.join(", "))}</span>`).join("")}</div></div><div class="master-card"><div class="master-kicker">Logic Surface</div><div class="master-help">${functionCount} safe functions exposed. Trace ${diagnostics.trace_output === false ? "off" : "on"}. Fail-closed ${diagnostics.fail_closed === false ? "off" : "on"}.</div></div><div class="master-card"><div class="master-kicker">Control</div><div class="button-row"><button class="btn btn-ghost btn-sm" data-action="loadMaster" aria-label="Load master YAML configuration">Load master YAML</button><button class="btn btn-ghost btn-sm" data-action="saveMaster" aria-label="Save master YAML configuration">Save master YAML</button></div><div class="master-help">${esc(G.saveStatus || "Rules, function metadata, and semantic packs persist through the master YAML file.")}</div></div></div></div></div>`;
}

function renderUpload() {
  return `<div class="drop-zone" id="dropZone"><div class="drop-zone-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg></div><h2>Drop your data file here</h2><p>JSON or CSV is enough. The engine profiles fields, runs rules, scores context lenses, and ranks views.</p><div class="format-tags"><span class="format-tag">.json</span><span class="format-tag">.csv</span><span class="format-tag">glimpse.master.yaml</span></div><input type="file" id="fileInput" accept=".json,.csv"></div>`;
}

function renderProcessing() {
  return `<div class="context-panel fade-in"><div class="context-header"><h3>Processing ${esc(G.fileName)}...</h3></div><div class="context-body"><div class="empty-state pulse">Building profile, extracting facts, firing rules, and ranking visual syntaxes...</div></div></div>`;
}

function renderResults() {
  return [
    renderContextSummary(),
    renderQueryBar(),
    renderStats(),
    renderModeBar(),
    renderVisualization(),
    renderInsightGrid(),
    renderLogicAudit(),
    renderChartPanel(),
    renderExportBar(),
  ].join("");
}

function renderLensPills() {
  if (!G.ctx?.contextLenses?.length) return '<span class="dim-tag">No strong context lenses detected yet.</span>';
  return G.ctx.contextLenses.map((lens) => `<span class="lens-pill ${lens.role}">${esc(lens.label)} <strong>${Math.round(lens.score * 100)}%</strong></span>`).join("");
}

function renderContextSummary() {
  const ctx = G.ctx;
  const topView = G.viewRankings[0];
  const descriptors = ctx.profile.descriptors.filter((descriptor) => descriptor.dimension).map((descriptor) => `<span class="dim-tag"><strong>${esc(descriptor.dimension)}:</strong> ${esc(descriptor.name)}</span>`).join("");
  const diagnosticsCount = (ctx.validationReport?.invalidArgs?.length || 0) + (ctx.validationReport?.diagnostics?.length || 0);
  return `<div class="context-panel fade-in"><div class="context-header"><h3>Context Lenses</h3><span style="font-size:0.75rem;color:var(--ink-muted)">${ctx.profile.recordCount} records &middot; ${ctx.entities.length} entities &middot; ${ctx.relations.length} relations</span></div><div class="context-body"><div class="lens-row">${renderLensPills()}</div><div class="dim-tags" style="margin-top:0.75rem">${descriptors}</div><div class="summary-grid"><div class="summary-card"><div class="master-kicker">Primary Lens</div><strong>${esc(ctx.primaryLens?.label || "General")}</strong><p>${generateLensReason(ctx.primaryLens)}</p></div><div class="summary-card"><div class="master-kicker">View Recommendation</div><strong>${esc(topView?.label || "Explorer")}</strong><p>${topView ? `Ranked first with a score of ${topView.score.toFixed(2)} based on your data structure and active preset.` : "No preferred view yet."}</p></div><div class="summary-card"><div class="master-kicker">Logic Audit</div><strong>${ctx.ruleTraces?.length || 0} traces</strong><p>${diagnosticsCount ? `${diagnosticsCount} validation or diagnostic notes detected.` : "No validation issues detected in the active rule pass."}</p></div></div></div></div>`;
}

function generateLensReason(lens) {
  if (!lens) return "The engine fell back to a general lens because the evidence was weak.";
  if (!G.ctx?.evidenceIndex) return "This lens is supported by the current rule system.";
  const reasons = (lens.evidenceIds || []).slice(0, 2).map((id) => G.ctx.evidenceIndex[id]?.reason).filter(Boolean);
  return reasons.length ? reasons.join(" ") : "This lens was selected from accumulated rule evidence.";
}

function renderQueryBar() {
  return `<div class="query-bar fade-in"><input class="query-input" id="queryInput" placeholder="Ask about the data... e.g. 'best views', 'cluster by region', 'show map', 'explain relation between Telegraph and Telephone'" value="${esc(G.query)}"><button class="btn btn-primary" data-action="query" aria-label="Run query">Query</button><button class="btn btn-ghost" data-action="reset" title="Start over" aria-label="Reset application" style="padding:0.75rem">Reset</button></div>`;
}

function renderStats() {
  const ctx = G.ctx;
  const stats = [
    { value: ctx.profile.recordCount, label: "Records" },
    { value: ctx.contextLenses.length, label: "Lenses" },
    { value: ctx.evidences.length, label: "Evidence" },
    { value: G.viewRankings.length, label: "Views" },
  ];
  return `<div class="stats-grid fade-in">${stats.map((stat) => `<div class="stat-card"><div class="stat-value">${stat.value}</div><div class="stat-label">${esc(stat.label)}</div></div>`).join("")}</div>`;
}

function renderModeBar() {
  const ordered = [...new Set([...G.viewRankings.map((view) => view.id), ...VIEW_SPECS.map((spec) => spec.id)])];
  return `<div class="mode-bar">${ordered.map((viewId) => {
    const spec = VIEW_SPECS.find((item) => item.id === viewId);
    const ranking = G.viewRankings.find((item) => item.id === viewId);
    if (!spec) return "";
    return `<button class="mode-btn${G.mode === viewId ? " active" : ""}" data-mode="${viewId}">${esc(spec.label)}${ranking ? ` <span class="mode-score">${ranking.score.toFixed(2)}</span>` : ""}</button>`;
  }).join("")}</div>`;
}

function renderVisualization() {
  return `<div class="viz-container fade-in"><div class="viz-header"><h4>${esc(VIEW_SPECS.find((item) => item.id === G.mode)?.label || G.mode)}</h4><div>${renderClusterSelect()}</div></div><div class="viz-body" id="vizBody">${renderView(G.mode, G.ctx, G)}</div>${renderLegend()}</div>`;
}

function renderClusterSelect() {
  const options = ["domain", "space", "time", "type", "catalyst"].map((id) => `<option value="${id}"${G.clusterBy === id ? " selected" : ""}>${id}</option>`).join("");
  return `<select class="cluster-select" id="clusterSelect">${options}</select>`;
}

function renderLegend() {
  return `<div class="legend"><span class="legend-item"><span class="legend-line" style="border-color:var(--teal-500)"></span>Influence</span><span class="legend-item"><span class="legend-line dashed" style="border-color:var(--emerald-500)"></span>Shared place</span><span class="legend-item"><span class="legend-line dotted" style="border-color:var(--amber-400)"></span>Shared time</span></div>`;
}

function renderInsightGrid() {
  return `<div class="output-grid"><div class="output-card"><div class="output-card-header"><h4>Narrative</h4></div><div class="output-card-body"><div class="narrative">${generateNarrative()}</div></div></div><div class="output-card"><div class="output-card-header"><h4>Evidence Trail</h4></div><div class="output-card-body">${renderEvidenceTrail()}</div></div></div>`;
}

function renderEvidenceTrail() {
  const evidences = [...G.ctx.evidences].sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  return `<div class="evidence-list">${evidences.map((evidence) => `<div class="evidence-item"><div class="evidence-top"><strong>${esc(evidence.sourceRuleId)}</strong><span>${Math.round(evidence.confidence * 100)}%</span></div><p>${esc(evidence.reason)}</p></div>`).join("")}</div>`;
}

function renderLogicAudit() {
  const traces = (G.ctx?.ruleTraces || []).slice().sort((left, right) => {
    const order = { fired: 0, validation_error: 1, execution_error: 2, guard_blocked: 3, skipped: 4 };
    return (order[left.status] ?? 9) - (order[right.status] ?? 9);
  }).slice(0, 12);
  const report = G.ctx?.validationReport || {};
  const inventory = (G.ctx?.functionInventory || []).slice(0, 8);
  return `<div class="output-grid"><div class="output-card fade-in"><div class="output-card-header"><h4>Rule Trace</h4></div><div class="output-card-body"><div class="evidence-list">${traces.map((trace) => `<div class="evidence-item"><div class="evidence-top"><strong>${esc(trace.ruleId)}</strong><span>${esc(trace.status)}</span></div><p>${trace.mode === "function" ? `Function: ${esc(trace.functionName || "n/a")} &middot; Args: ${esc(JSON.stringify(trace.args || {}))}` : "Legacy fact rule."}</p><p>${trace.guardResult && trace.guardResult !== "none" ? `Guards: ${esc(trace.guardResult)}. ` : ""}${trace.validationErrors?.length ? esc(trace.validationErrors.join(" ")) : trace.output?.reason ? esc(trace.output.reason) : "No extra trace text."}</p></div>`).join("") || '<div class="empty-state">No trace output available.</div>'}</div></div></div><div class="output-card fade-in"><div class="output-card-header"><h4>Validation Surface</h4></div><div class="output-card-body"><p><strong>Missing functions:</strong> ${report.missingFunctions?.length || 0}</p><p><strong>Invalid args:</strong> ${report.invalidArgs?.length || 0}</p><p><strong>Skipped rules:</strong> ${report.skippedRules?.length || 0}</p><p><strong>Diagnostics:</strong> ${report.diagnostics?.length || 0}</p><div class="hint-list" style="margin-top:0.75rem">${inventory.map((item) => `<span class="hint-chip">${esc(item.name)} → ${esc(item.returns)}</span>`).join("")}</div></div></div></div>`;
}

function renderChartPanel() {
  return `<div class="output-card fade-in"><div class="output-card-header"><h4>Distribution</h4><div style="display:flex;gap:0.375rem">${["bar", "doughnut", "radar"].map((type) => `<button class="btn btn-ghost btn-sm chart-type-btn" data-type="${type}">${type === "doughnut" ? "Ring" : type[0].toUpperCase() + type.slice(1)}</button>`).join("")}</div></div><div class="output-card-body"><div class="chart-container"><canvas id="mainChart"></canvas></div></div></div>`;
}

function renderExportBar() {
  return `<div class="export-bar"><button class="btn btn-ghost btn-sm" data-action="exportSvg" aria-label="Export visualization as SVG">Export SVG</button><button class="btn btn-ghost btn-sm" data-action="exportJson" aria-label="Export context data as JSON">Export Context</button><button class="btn btn-ghost btn-sm" data-action="exportHtml" aria-label="Export full report as HTML">Export Report</button></div>`;
}

function renderRuleAuthoring() {
  const preview = G.ruleDraftResult?.preview;
  const canSave = G.ruleDraftResult && !G.ruleDraftResult.ambiguous;
  return `<div class="context-panel fade-in"><div class="context-header"><h3>Rule Authoring</h3><span class="config-status">Describe a law in natural language; the engine compiles it into YAML.</span></div><div class="context-body"><div class="author-grid"><div><textarea class="rule-textarea" id="ruleDraftInput" placeholder="Example: When records share the same country, favor the map view and treat geography as a supporting context.">${esc(G.ruleDraft)}</textarea><div class="button-row" style="margin-top:0.75rem"><select class="cluster-select" id="rulePromotionSelect"><option value="experimental"${G.rulePromotion === "experimental" ? " selected" : ""}>Experimental</option><option value="active"${G.rulePromotion === "active" ? " selected" : ""}>Active</option></select><button class="btn btn-primary btn-sm" data-action="compileRule">Compile rule</button><button class="btn btn-ghost btn-sm" data-action="saveRule"${canSave ? "" : " disabled"}>Save to master YAML</button></div></div><div class="rule-preview">${preview ? `<div class="master-kicker">Preview</div><strong>${esc(preview.title)}</strong><p><strong>Rule type:</strong> ${esc(preview.ruleType)}</p><p><strong>Checks:</strong> ${esc(preview.checks.join("; "))}</p><p><strong>Guards:</strong> ${esc((preview.guardChecks || ["none"]).join("; "))}</p><p><strong>Changes:</strong> ${esc(preview.changes.join("; "))}</p><p><strong>Scope:</strong> ${esc(preview.scope)}</p><p><strong>Function:</strong> ${esc(preview.functionName || "n/a")}</p><p><strong>Args:</strong> ${esc(JSON.stringify(preview.args || {}))}</p><p><strong>Returns:</strong> ${esc(preview.returns || "n/a")} &middot; <strong>Weight:</strong> ${esc(preview.weightStrategy || "priority")}</p><p><strong>Promotion:</strong> ${esc(preview.promotion || "active")}</p><p><strong>Why:</strong> ${esc(preview.because)}</p><p><strong>Validation:</strong> ${G.ruleDraftResult?.validationErrors?.length ? esc(G.ruleDraftResult.validationErrors.join(" ")) : "No validation issues in preview."}</p>` : '<div class="empty-state">Compile a rule draft to preview what the engine understood before it is saved.</div>'}</div></div></div></div>`;
}

function generateNarrative() {
  const ctx = G.ctx;
  const query = G.query.trim().toLowerCase();
  const lead = [`<p>The dataset reads primarily as <strong>${esc(ctx.primaryLens?.label || "General")}</strong>`];
  if (ctx.secondaryLenses.length) {
    lead.push(` with supporting lenses in ${ctx.secondaryLenses.map((lens) => `<span class="hl">${esc(lens.label)}</span>`).join(", ")}`);
  }
  lead.push(`. This comes from ${ctx.evidences.length} explicit pieces of evidence rather than a single hard-coded domain guess.</p>`);

  const parts = [lead.join("")];
  const topView = G.viewRankings[0];
  if (topView) {
    parts.push(`<p>The engine recommends <strong>${esc(topView.label)}</strong> first because its ranking score reached <span class="hl">${topView.score.toFixed(2)}</span> under the active <strong>${esc(G.masterConfig.presets[G.activePreset]?.label || G.activePreset)}</strong> preset.</p>`);
  }

  const topEvidence = [...ctx.evidences].sort((a, b) => b.confidence - a.confidence)[0];
  if (topEvidence) {
    parts.push(`<p>Top evidence: <strong>${esc(topEvidence.sourceRuleId)}</strong> at ${Math.round(topEvidence.confidence * 100)}% confidence. ${esc(topEvidence.reason)}</p>`);
  }

  const firedFunctionTrace = (ctx.ruleTraces || []).find((trace) => trace.status === "fired" && trace.mode === "function");
  if (firedFunctionTrace) {
    parts.push(`<p>Most visible function-backed rule: <strong>${esc(firedFunctionTrace.ruleId)}</strong> used <span class="hl">${esc(firedFunctionTrace.functionName)}</span> with validated arguments.</p>`);
  }

  if (query) {
    const intent = parseQueryIntent(query, G.masterConfig);
    if (intent.kind === "show_best_views") {
      parts.push(`<p>Best views right now: ${G.viewRankings.slice(0, 3).map((view) => `<span class="hl">${esc(view.label)}</span>`).join(", ")}.</p>`);
    } else if (intent.kind === "compare_contexts") {
      parts.push(`<p>Context comparison: the primary lens is <strong>${esc(ctx.primaryLens?.label)}</strong>, while secondary lenses keep adjacent meaning visible instead of collapsing it into one bucket.</p>`);
    } else if (intent.kind === "explain_relation" && intent.names.length === 2) {
      const left = ctx.entities.find((entity) => entity.name.toLowerCase().includes(intent.names[0]));
      const right = ctx.entities.find((entity) => entity.name.toLowerCase().includes(intent.names[1]));
      const relation = left && right ? ctx.relations.find((item) => (item.source === left.id && item.target === right.id) || (item.source === right.id && item.target === left.id)) : null;
      if (relation) {
        const evidence = relation.evidenceIds.map((id) => ctx.evidenceIndex[id]?.reason).filter(Boolean).join(" ");
        parts.push(`<p>${esc(left.name)} and ${esc(right.name)} are connected through <strong>${esc(relation.type)}</strong>. ${esc(evidence || "The relation is supported by structural evidence.")}</p>`);
      }
    } else if (intent.kind === "show_trace") {
      const trace = (ctx.ruleTraces || []).find((item) => item.status === "fired");
      if (trace) {
        parts.push(`<p>Trace view: <strong>${esc(trace.ruleId)}</strong> fired as a ${esc(trace.mode)} rule on ${esc(trace.targetId)}.</p>`);
      }
    }
  }

  return parts.join("");
}

function renderChart() {
  const canvas = document.getElementById("mainChart");
  if (!canvas || !G.ctx || typeof Chart === "undefined") return;
  if (chartInstance) chartInstance.destroy();

  const labels = G.ctx.contextLenses.map((lens) => lens.label);
  const values = G.ctx.contextLenses.map((lens) => Number((lens.score * 100).toFixed(1)));
  const type = G.chartType || "bar";
  const palette = ["#14b8a6", "#0d9488", "#6366f1", "#d97706", "#059669", "#f43f5e", "#8b5cf6"];

  chartInstance = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        label: "Context confidence",
        data: values,
        backgroundColor: type === "bar" ? palette[0] + "cc" : palette.slice(0, labels.length),
        borderColor: type === "bar" ? palette[0] : palette.slice(0, labels.length),
        borderWidth: type === "bar" ? 0 : 2,
        borderRadius: type === "bar" ? 5 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: type !== "bar", position: "bottom" } },
      scales: type === "bar" ? {
        x: { grid: { display: false } },
        y: { grid: { color: "#e5e7eb" }, suggestedMax: 100 },
      } : undefined,
    },
  });
}

const debouncedTableSearch = debounce((value) => {
  G.tableFilter = value;
  render();
}, 150);

function bindDelegatedEvents() {
  const app = document.getElementById("app");

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], [data-mode], [data-type], [data-eid], [data-col], #dropZone, #fileInput");
    if (!target) return;

    if (target.id === "dropZone" || target.closest("#dropZone")) {
      document.getElementById("fileInput")?.click();
      return;
    }

    if (target.dataset.action === "loadMaster") {
      handleLoadMaster();
      return;
    }
    if (target.dataset.action === "saveMaster") {
      handleSaveMaster();
      return;
    }
    if (target.dataset.action === "query") { processQuery(); return; }
    if (target.dataset.action === "reset") { resetApp(); return; }
    if (target.dataset.action === "compileRule") { handleCompileRule(); return; }
    if (target.dataset.action === "saveRule") { handleSaveRule(); return; }
    if (target.dataset.action === "exportSvg") { exportSVG(); return; }
    if (target.dataset.action === "exportJson") { exportJSON(); return; }
    if (target.dataset.action === "exportHtml") { exportHTML(); return; }

    if (target.dataset.mode) {
      G.mode = target.dataset.mode;
      render();
      return;
    }

    if (target.classList.contains("chart-type-btn") && target.dataset.type) {
      G.chartType = target.dataset.type;
      renderChart();
      return;
    }

    if (target.dataset.col) {
      const column = target.dataset.col;
      if (G.sortCol === column) G.sortDir *= -1;
      else { G.sortCol = column; G.sortDir = 1; }
      render();
      return;
    }

    const entityNode = target.closest("[data-eid]");
    if (entityNode) {
      const entityId = entityNode.dataset.eid;
      G.focus = G.focus === entityId ? null : entityId;
      G.query = G.focus ? `focus ${entityNode.dataset.name}` : "";
      render();
      return;
    }
  });

  app.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "fileInput" && target.files[0]) {
      handleFile(target.files[0]);
      return;
    }
    if (target.id === "presetSelect") {
      G.activePreset = target.value;
      G.saveStatus = `Preset switched to ${G.masterConfig.presets[G.activePreset]?.label || G.activePreset}.`;
      if (G.rawData) runPipeline();
      else render();
      return;
    }
    if (target.id === "clusterSelect") {
      G.clusterBy = target.value;
      G.ctx.clusters = computeClusters(G.ctx, G.clusterBy);
      render();
      return;
    }
    if (target.id === "rulePromotionSelect") {
      G.rulePromotion = target.value;
      if (G.ruleDraftResult?.rule) {
        G.ruleDraftResult.rule.promotion = G.rulePromotion;
        G.ruleDraftResult.preview = createRulePreview(G.ruleDraftResult.rule);
      }
      return;
    }
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id === "queryInput") { G.query = target.value; return; }
    if (target.id === "tableSearch") { debouncedTableSearch(target.value); return; }
  });

  app.addEventListener("keydown", (event) => {
    if (event.target.id === "queryInput" && event.key === "Enter") processQuery();
  });

  app.addEventListener("dragover", (event) => {
    if (event.target.closest("#dropZone")) {
      event.preventDefault();
      event.target.closest("#dropZone").classList.add("drag-over");
    }
  });
  app.addEventListener("dragleave", (event) => {
    const dropZone = event.target.closest("#dropZone");
    if (dropZone) dropZone.classList.remove("drag-over");
  });
  app.addEventListener("drop", (event) => {
    const dropZone = event.target.closest("#dropZone");
    if (dropZone) {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      if (event.dataTransfer.files[0]) handleFile(event.dataTransfer.files[0]);
    }
  });
}

async function handleLoadMaster() {
  try {
    if ("showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "YAML", accept: { "application/yaml": [".yaml", ".yml"] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      if (!handle) return;
      const file = await handle.getFile();
      const yamlText = await file.text();
      G.masterConfig = parseMasterConfig(yamlText);
      G.masterConfigSource = "external-file";
      G.masterYamlText = yamlText;
      G.masterHandle = handle;
      G.activePreset = G.masterConfig.defaults?.active_preset || G.activePreset;
      G.saveStatus = `Loaded ${file.name}.`;
      if (G.rawData) runPipeline();
      else render();
      return;
    }
    alert("This browser does not support direct file loading. Serve the folder over HTTP or use a Chromium-based browser.");
  } catch (error) {
    G.saveStatus = `Failed to load YAML: ${error.message}`;
    render();
  }
}

async function handleSaveMaster() {
  try {
    if (G.masterHandle) {
      await saveMasterConfigToHandle(G.masterHandle, G.masterConfig);
      G.saveStatus = "Master YAML saved to disk.";
    } else {
      downloadMasterConfig(G.masterConfig);
      G.saveStatus = "Master YAML downloaded. If you want direct saves, load the file first.";
    }
    render();
  } catch (error) {
    G.saveStatus = `Failed to save YAML: ${error.message}`;
    render();
  }
}

function handleCompileRule() {
  G.ruleDraft = document.getElementById("ruleDraftInput")?.value || "";
  const result = compileRuleFromConversation(G.ruleDraft, G.masterConfig);
  if (!result) return;
  result.rule.promotion = G.rulePromotion;
  const previewConfig = JSON.parse(JSON.stringify(G.masterConfig));
  previewConfig.rules = [result.rule];
  const validation = validateConfigWithRegistry(previewConfig);
  G.ruleDraftResult = {
    ...result,
    preview: createRulePreview(result.rule),
    validationErrors: [...(validation.invalidArgs || []), ...(validation.missingFunctions || [])],
  };
  render();
}

async function handleSaveRule() {
  if (!G.ruleDraftResult || G.ruleDraftResult.ambiguous) return;
  G.masterConfig.rules = [...(G.masterConfig.rules || []).filter((rule) => rule.id !== G.ruleDraftResult.rule.id), G.ruleDraftResult.rule].sort((a, b) => b.priority - a.priority);
  const packId = G.ruleDraftResult.rule.promotion === "experimental" ? "experimental" : "base";
  G.masterConfig.rule_sets ||= {};
  G.masterConfig.rule_sets[packId] ||= { label: packId === "experimental" ? "Experimental" : "Base Logic", rules: [] };
  if (!G.masterConfig.rule_sets[packId].rules.includes(G.ruleDraftResult.rule.id)) {
    G.masterConfig.rule_sets[packId].rules.push(G.ruleDraftResult.rule.id);
  }
  G.masterYamlText = serializeMasterConfig(G.masterConfig);
  G.saveStatus = `Saved rule ${G.ruleDraftResult.rule.id} into the master config state.`;
  G.ruleDraft = "";
  G.ruleDraftResult = null;
  G.rulePromotion = "experimental";
  if (G.masterHandle) {
    await saveMasterConfigToHandle(G.masterHandle, G.masterConfig);
    G.saveStatus = "Saved the new rule directly into the loaded master YAML.";
  }
  if (G.rawData) runPipeline();
  else render();
}

function processQuery() {
  const intent = parseQueryIntent(G.query, G.masterConfig);
  if (intent.kind === "show_view" && intent.viewId) {
    G.mode = intent.viewId;
  } else if (intent.kind === "cluster_by") {
    G.clusterBy = intent.dimension;
    G.mode = "clusters";
    G.ctx.clusters = computeClusters(G.ctx, G.clusterBy);
  } else if (intent.kind === "show_best_views") {
    G.mode = G.viewRankings[0]?.id || G.mode;
  } else if (intent.kind === "focus_entity" && intent.text) {
    const entity = G.ctx.entities.find((item) => item.name.toLowerCase().includes(intent.text));
    if (entity) {
      G.focus = entity.id;
      G.mode = G.mode === "explorer" ? "constellation" : G.mode;
    }
  }
  render();
}

function exportSVG() {
  const svg = document.querySelector("#vizBody svg");
  if (!svg) return alert("No SVG-based view is active.");
  downloadBlob(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `glimpse-${G.mode}.svg`);
}

function exportJSON() {
  const payload = {
    engine: `Glimpse Dynamic Context Engine ${G.version}`,
    preset: G.activePreset,
    primaryLens: G.ctx.primaryLens,
    secondaryLenses: G.ctx.secondaryLenses,
    viewRankings: G.viewRankings,
    profile: G.ctx.profile,
    contextLenses: G.ctx.contextLenses,
    evidences: G.ctx.evidences,
    relations: G.ctx.relations,
    rules: G.masterConfig.rules,
    ruleTraces: G.ctx.ruleTraces,
    validationReport: G.ctx.validationReport,
    functionInventory: G.ctx.functionInventory,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "glimpse-context.json");
}

function exportHTML() {
  downloadBlob(new Blob([document.documentElement.outerHTML], { type: "text/html" }), "glimpse-report.html");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function resetApp() {
  G.phase = 0;
  G.rawData = null;
  G.fileName = "";
  G.fileType = "";
  G.ctx = null;
  G.viewRankings = [];
  G.mode = "constellation";
  G.focus = null;
  G.clusterBy = "domain";
  G.chartType = "bar";
  G.query = "";
  G.sortCol = null;
  G.sortDir = 1;
  G.tableFilter = "";
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  render();
}

boot();
