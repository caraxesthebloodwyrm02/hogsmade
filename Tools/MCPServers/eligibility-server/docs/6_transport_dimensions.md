Maps how eligibility-server evaluates candidates into runtime truth (weights, hierarchy, conditions), then transforms that truth into contract-like projections (forms, tables) and session-control state (evolution cases, endpoint specs, promotion gates). Notable entry points: runtime evaluation [1a], form compilation [2a], table transform [3a], session opening [4a], contract storage [5c], promotion decision [6d].

Eligibility Runtime Evaluation Pipeline
1a
Handler entry: safe evaluation wrapper
server.ts:142
const evaluation = safeEvaluateRoutine(candidates, shapeArgs(input.args));
evaluateCandidateHandler()
safeEvaluateRoutine()
evaluateRoutine()
buildRoutinePipeline()
createPipeline() w/ 8 passes
1b
Pipeline execution: 8-pass transform
pipeline.ts:695
const pipelineResult = pipeline.run(initialState(candidates, normalizedArgs, seed, argvSignature));
Pass 1: normalize-runtime-args
Pass 2: build-attribute-catalog
1c
Weight derivation: seeded analog scoring
pipeline.ts:496
const weights = scoreWeights(input.state.candidates, input.state.catalog, input.state.args, input.state.seed, input.state.argvSignature);
scoreWeights()
1d
Hierarchy projection: dimension + overall slices
pipeline.ts:516
const hierarchy = deriveHierarchy(input.state.weights, input.state.args);
deriveHierarchy()
Pass 5: derive-condition-notes
Pass 6: derive-observation-notes
1e
Form compilation: runtime → server/rule/agent/skill/reference
pipeline.ts:567
const forms = compileFormArtifacts({ args: input.state.args, seed: input.state.seed, argvSignature: input.state.argvSignature, candidateIds: input.state.candidates.map((candidate) => candidate.id), hierarchy: input.state.hierarchy, conditions: input.state.conditions, observations: input.state.observations, summary: input.state.summary });
compileFormArtifacts()
1f
Table emission: formula-ready rows with provenance
pipeline.ts:590
const table = buildCollectionTable({ args: input.state.args, argvSignature: input.state.argvSignature, seed: input.state.seed, weights: input.state.weights, hierarchy: input.state.hierarchy, conditions: input.state.conditions, observations: input.state.observations, generatedAt: input.state.table.generatedAt });
buildCollectionTable()

Form Artifact Compilation Pipeline
2a
Handler: reuse evaluation result
server.ts:159
const evaluation = evaluateCandidateHandler(input);
compileFormsHandler()
evaluateCandidateHandler()
safeEvaluateRoutine()
[runtime evaluation pipeline]
Form Compilation Module
compileFormArtifacts() entry
2b
Target selection: which form kinds to compile
forms.ts:192
const requestedTargets = input.args.formTarget === "all" ? [...ALL_FORM_TARGETS] : [input.args.formTarget];
requestedTargets array
2c
Form generation: invoke builders for each target
forms.ts:204
return requestedTargets.map((target) => builders[target]());
requestedTargets.map()
Individual form builders
2d
Server tool manifest: runtime-backed JSON
forms.ts:58
content: JSON.stringify({ summary: input.summary, seed: input.seed, argvSignature: input.argvSignature, tools: ["list_attribute_catalog", "evaluate_candidate", "compile_forms", "collect_table", "explain_hierarchy"] }, null, 2)
JSON.stringify(manifest)
2e
Rule artifact: markdown with runtime context
forms.ts:87
content: `---\ndescription: Runtime-backed eligibility routine guidance for weighted integration triage\nglobs: **/*\nalwaysApply: false\n---\n\n# Eligibility routine\n\nRuntime-backed seed: \`${input.seed}\`\nArgs: ${formatArgs(input.args)}\n\nTop overall ordering:\n${top.map((slice) => `- ${slice.candidateId} (rank ${slice.rank}, score ${slice.score.toFixed(3)})`).join("\n")}\n\nConditions:\n${input.conditions.map((note) => `- [${note.severity}] ${note.message}`).join("\n") || "- none"}\n\nObservation notes:\n${input.observations.map((note) => `- ${note.message}`).join("\n") || "- none"}\n`
Markdown template string
[other builders: agent, skill, reference]

Collection Table Transform (Trace 3)
Server Handler Layer
3a
Handler: reuse evaluation result
server.ts:173
const evaluation = evaluateCandidateHandler(input);
calls evaluateCandidateHandler()
returns evaluation result
Table Builder Entry
buildCollectionTable()
Attribute Row Generation
3b
Attribute rows: conditional generation
table.ts:50
if (input.args.tableScope === "attributes" || input.args.tableScope === "all") {
for each weight
3c
Attribute row emission: full provenance
table.ts:52
rows.push({ rowId: `attribute:${weight.id}`, rowType: "attribute", candidateId: weight.candidateId, dimension: weight.dimension, attributeId: weight.attributeId, sourcePass: "derive-analog-weights", sourceArtifact: "analog-weight", seed: input.seed, argvSignature: input.argvSignature, weightRaw: weight.weightRaw, weightBand: weight.weightBand, dimensionScore: null, hierarchyRank: null, conditionIds: getConditionIds(input.conditions, weight.candidateId, weight.dimension), observationIds: getObservationIds(input.observations, weight.candidateId, weight.dimension), creditLabel: `weight:${weight.id}` });
Dimension Row Generation
3d
Dimension rows: conditional generation
table.ts:73
if (input.args.tableScope === "dimensions" || input.args.tableScope === "all") {
for each hierarchy slice
3e
Dimension row emission: hierarchy slice with provenance
table.ts:75
rows.push({ rowId: `dimension:${slice.id}`, rowType: "dimension", candidateId: slice.candidateId, dimension: slice.dimension, attributeId: null, sourcePass: "project-vertical-hierarchy", sourceArtifact: "hierarchy-slice", seed: input.seed, argvSignature: input.argvSignature, weightRaw: null, weightBand: nullBand(), dimensionScore: slice.score, hierarchyRank: slice.rank, conditionIds: getConditionIds(input.conditions, slice.candidateId, slice.dimension), observationIds: getObservationIds(input.observations, slice.candidateId, slice.dimension), creditLabel: `hierarchy:${slice.id}` });
Return CollectionTable
{ columns, rows, generatedAt }

Evolution Case Session: Runtime Truth Wrapper
Server Tool Handler Layer
4a
Handler: open evolution case
server.ts:209
const result = openEvolutionCase({ caseId: input.caseId, label: input.label, owner: input.owner, candidates, args: input.args });
calls openEvolutionCase()
Pre-validation
4b
Pre-validation: check candidates before opening
evolution.ts:747
const validation = safeEvaluateRoutine(input.candidates, args).validation;
Case Record Creation
buildCaseId()
initialize EvolutionCase
Initial State Refresh
4c
Initial refresh: generate runtime truth
evolution.ts:812
refreshCaseRecord(caseRecord, timestamp);
4d
Runtime regeneration: candidates + args only
evolution.ts:492
const evaluation = evaluateRoutine(caseRecord.candidates, caseRecord.args);
pipeline.run()
computeEndpointStats()
buildMomentum()
baseConditions()
4e
State update: store runtime result in case
evolution.ts:527
caseRecord.latestEligibilityResult = evaluation;
caseRecord.latestEligibilityResult
Snapshot Building
4f
Snapshot building: session state projection
evolution.ts:553
return { summary: summarizeCase(caseRecord), caseRecord: clone(caseRecord), beatRail: buildBeatRail(caseRecord.currentBeat) };
summarizeCase()
clone(caseRecord)
buildBeatRail()

Endpoint Contract Storage Flow (Trace 5)
5a
Handler: upsert endpoint spec
server.ts:288
const result = upsertEndpointSpec(input);
upsertEndpointSpec(input)
Evolution Case Lookup
5b
Case lookup: validate case exists
evolution.ts:931
const caseRecord = validateCaseLookup(store.getCase(input.caseId), input.caseId);
store.getCase(caseId)
5c
Spec creation: contract stored as trimmed string
evolution.ts:933
const spec: EndpointSpec = { id: input.endpointId, label: input.label, owner: input.owner?.trim(), contract: input.contract?.trim(), status: input.status, required: input.required ?? true, readiness: input.readiness !== undefined ? round(clamp(input.readiness, 0, 1)) : undefined, notes: input.notes?.trim(), updatedAt: timestamp };
contract: input.contract?.trim()
owner: input.owner?.trim()
status: input.status
required: input.required ?? true
5d
Spec upsert: update or append
evolution.ts:946
if (existingIndex >= 0) caseRecord.endpointSpecs[existingIndex] = spec;
findIndex(existing by id)
update existing OR append new
5e
Refresh trigger: regenerate runtime + momentum
evolution.ts:960
refreshCaseRecord(caseRecord, timestamp);
refreshCaseRecord(caseRecord, timestamp)
evaluateRoutine() [regenerate runtime]
computeEndpointStats() [momentum calc]
buildMomentum() [session metrics]

Promotion Gate Evaluation Pipeline
MCP Tool Handler Layer
6a
Handler: evaluate promotion gate
server.ts:316
const result = evaluatePromotionGate(input.caseId);
calls evaluatePromotionGate()
Evolution Gate Orchestration
evaluatePromotionGate(caseId)
6b
Pre-gate refresh: regenerate runtime without snapshot
evolution.ts:1034
refreshCaseRecord(caseRecord, timestamp, false);
regenerates runtime truth
6c
Gate decision: evaluate thresholds and completeness
evolution.ts:1035
const gate = promotionDecision(caseRecord, timestamp);
Promotion Decision Logic
promotionDecision(caseRecord, timestamp)
6d
Contract completeness: presence check only
evolution.ts:674
const completeEndpointCount = caseRecord.endpointSpecs.filter((spec) => spec.required && Boolean(spec.owner?.trim()) && Boolean(spec.contract?.trim()) && (spec.status === "ready" || spec.status === "verified")).length;
checks owner + contract + status
accumulate blocking reasons
6e
Incomplete endpoint reason: blocks promotion
evolution.ts:697
if (requiredEndpointCount > completeEndpointCount) reasons.push("Not all required endpoint specs are complete.");
decide: allow/hold/return/deny
6f
Allow decision: no blocking reasons
evolution.ts:704
if (reasons.length === 0) { decision = "allow_promotion"; }
6g
Promotion allowed: update status and timeline
evolution.ts:1039
if (gate.decision === "allow_promotion") { caseRecord.status = "promoted"; pushTimeline(caseRecord, "promotion_allowed", timestamp, "Promotion gate passed.", ["promotion-gate"], { decision: gate.decision }); emitCycleAudit(caseRecord, "promotion_allowed", "Promotion gate passed.", { decision: gate.decision }); }
