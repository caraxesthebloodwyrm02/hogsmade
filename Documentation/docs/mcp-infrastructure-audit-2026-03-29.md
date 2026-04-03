# MCP Infrastructure Audit Report

Date: 2026-03-29
Execution mode: mixed live-read plus /tmp dry-run isolation

## Scope and execution notes

This run used live MCP reads for sections 1 to 3 and 5. Sections 4, 6, 7, 9, and 10 were executed through isolated `/tmp` harnesses where possible.

Runtime deviations and hard limits:

- Section 1 ranked failing tools from `query_audit(status="error")` because `audit_stats` does not provide per-tool failure counts.
- `query_audit(status="error")` leaked `failure` rows; only literal `error` rows were counted for section 1.
- Section 1 mutated live precedent state because `check_recurrence` writes to the real echoes precedent store.
- Section 4 could not fully isolate precedent lifecycle state because the current `echoes-server` source still read precedent data from `/home/caraxes/.echoes/precedents/precedent-store.json`.
- Section 7 attempted `experiment_run` first and correctly fell back to direct shell execution because experiment execution is disabled.
- Section 8 could not persist dry-run traces because the local Python path lacked `pydantic`.

## Section 1: Enforcement loop

Baseline:

- `audit_stats.total`: 667
- `audit_stats.byStatus`: success 591, error 14, failure 23, blocked 38, dry_run 1

Top failing tools by literal `error` events from `query_audit(status="error")`:

- `grid-server | validate_envelope | 12`
- `grid-server | validate_envelope_lifecycle_probe | 2`
- `none found`

Recurrence and precedent results:

- `grid-server | validate_envelope | 12 | active precedent yes | escalation restricted | occurrence count 4`
- `grid-server | validate_envelope_lifecycle_probe | 2 | active precedent yes | escalation flagged plus new observed fingerprint created during verification | occurrence count 2`
- `none found`

Restricted or higher fingerprints:

- `prec-1774724623921-6f10640a` for `grid-server/validate_envelope`

Recommendation:

- Let stand for `grid-server/validate_envelope` because the run observed active recurrence and no remediation evidence.
- Let stand for `grid-server/validate_envelope_lifecycle_probe` because there is no post-fix success history.

Raw anomalies:

- `query_audit(status="error")` returned `failure` rows in addition to `error` rows.

Intentional state changes:

- Live mutation: section 1 escalated `grid-server/validate_envelope` to `restricted`.
- Live mutation: section 1 created a new observed fingerprint `prec-1774729011128-f4898b31` for `grid-server/validate_envelope_lifecycle_probe`.

## Section 2: Ecosystem vital signs

Live tool results:

- `ecosystem_scan(saveSnapshot=true)` overall score: 92
- `full_diagnostic(saveReport=true)` overall score: 100
- `enforcement_status` status: elevated

Repo table:
| Repo | Health | Precedent level | Recommended action |
| --- | ---: | --- | --- |
| GRID | 90 | restricted plus flagged | investigate source tool |
| afloat | 95 | none | monitor |
| echoes | 100 | none | monitor |
| glimpse-engine | 100 | none | monitor |
| apiguard | 90 | none | monitor |
| Vision | 95 | none | monitor |
| hogsmade | 75 | none | monitor |

Unmapped infrastructure precedents:

- `eligibility-server | evolution_promotion_blocked | observed`
- `maintain-server | cleanup_execute | observed`

Notes:

- The repo table includes all repos returned by `ecosystem_scan`.
- No repo was below the `health < 50` threshold.

## Section 3: Morning ignition

Live tool order executed:

1. `morning_briefing`
2. `check_alerts(healthThreshold=60)`
3. `what_should_i_work_on`
4. `query_precedents(level="flagged")`
5. `ecosystem_trend(limit=5)`

Findings:

- Multi-source items: none found
- Degraded items: none found from `ecosystem_trend`
- Single-source items:
  - `grid-server/validate_envelope_lifecycle_probe/error`
  - `grid-server/admission_bannered_entities/failure`
  - `grid-server/admission_stats/failure`
  - `grid-server/admission_policy/failure`
  - `grid-server/validate_envelope/error`

Priority ordering rationale:

- Source overlap first: none found
- Severity next: live precedent pressure on `grid-server`
- Occurrence count next: `validate_envelope` leads among literal errors

Trend status:

- `ecosystem_trend.degrading`: none found
- Snapshot delta degradation marking: not applied beyond trend output

## Section 4: Precedent lifecycle

Execution target:

- Synthetic identity requested:
  - `source: grid-server-sim`
  - `tool: validate_envelope_lifecycle_probe`
  - `status: error/success`
  - `metadata.reason: HMAC mismatch`

Dry-run result:

- Synthetic audit writes were issued in isolated `/tmp` state.
- `query_precedents(source="grid-server-sim")`: none found
- `resolve_precedent`: none found
- `enforcement_status` returned live home-store state instead of isolated synthetic state.

Conclusion:

- This section is only partially executed.
- Root cause: current `echoes-server` precedent reads still resolve against `/home/caraxes/.echoes/precedents/precedent-store.json`, so isolated synthetic lifecycle verification is not actually isolated.

Intentional state changes:

- Dry-run mutation attempt: synthetic precedent lifecycle writes under `/tmp`
- Effective read path leak: live precedent store still observed

Raw failure:

- No synthetic precedent was queryable after write attempts.

## Section 5: Admission gate stress read

Live tool results:

- `admission_policy`: `{"success":false,"error":"TypeError: fetch failed"}`
- `admission_stats`: `{"success":false,"error":"TypeError: fetch failed"}`
- `admission_bannered_entities`: `{"success":false,"error":"TypeError: fetch failed"}`

Blocked audit cross-reference:

- `query_audit(source="grid-server", status="blocked")` returned only `eligibility-server/evolution_promotion_blocked` rows.
- Bannered entities: none found
- Joined entity audit trail matches: none found

Conclusion:

- Admission queries failed closed.
- No reliable entity join was available.

## Section 6: Knowledge cartography

Dry-run isolated GRID knowledge store:

- Root: `/tmp/cascade-grid-audit-1774729681`

Upserts executed:

- `precedent-system` as `Artifact`
- `recurrence-detector` as `Skill`
- `echoes-server` as `Agent`

Relationships executed:

- `recurrence-detector DEPENDS_ON precedent-system`
- `echoes-server EXECUTED_BY recurrence-detector`

Verification:

- `query_knowledge("enforcement")`: 3 entities found
- `get_entity_neighborhood("precedent-system", depth=2)`: all 3 entities and both relationships traversable
- Connectivity confirmed: yes

Intentional state changes:

- Dry-run mutation: isolated `/tmp` knowledge graph entities and relationships

## Section 7: Experiment-driven audit throughput

Dry-run isolated LOTS catalog:

- Root: `/tmp/cascade-audit-1774729570245`

Experiments created:

- `audit-ingest-throughput`
- `audit-query-latency`

Runner behavior:

- `experiment_run` for both experiments returned:
  - `{"error":"Experiment execution is disabled (set LOTS_ENABLE_EXPERIMENT_RUN=true to enable)"}`
- Required fallback executed successfully for both via shell.

Measured results:

- `audit-ingest-throughput | result source fallback-shell | external wall ms 79.825237`
- `audit-query-latency | result source fallback-shell | external wall ms 72.019093`

Comparison:

- Faster total runtime in fallback mode: `audit-query-latency`
- Mean call time: none found because the fallback script did not emit the inner JSON timing payload
- Runner source: fallback-shell for both

Raw limitations:

- The direct fallback scripts exited successfully but produced empty stdout, so only external wall-clock timing is available.

Intentional state changes:

- Dry-run mutation: isolated LOTS experiment catalog entries

## Section 8: Structural integrity sweep

Live read-side results:

- `check_the_line`: clean, 0 findings
- `scan_git_repos`: `eligibility-server` has `24 uncommitted changes`, `14 untracked`, `gcRecommended: true`
- `gate_audit(limit=50)`: none found

Dry-run trace recording attempt:

- Intended findings to record:
  - `integrity-sweep git hygiene issue: eligibility-server`
  - `integrity-sweep gate audit anomaly: none found`
- Raw tool failure during dry-run trace recording:
  - `No module named 'pydantic'`

Conclusion:

- Structural findings recorded: none found
- Git hygiene findings: one
- Gate audit anomalies: one, `none found`
- Trace lineage confirmation: not completed because dry-run trace persistence failed

Required explanation:

- No traces were returned because the local Python trace path could not execute `record_trace` without `pydantic`.

## Section 9: Focus-tracked deep work

Dry-run isolated pulse state:

- Focus session started for `validate precedent enforcement end-to-end`
- Project: `echoes-server`

Observed levels during execution:

- `observed: 4`
- `flagged: 2`
- `restricted: 1`
- `blocked: 0`

Echoes health during session:

- Isolated audit file lines: 0
- Data dir: `/tmp/cascade-audit-1774729570245/echoes`

Journal result:

- Recorded: yes
- Mood: `focused`
- Tags: `enforcement`, `validation`, `hardening`

Focus end outcome:

- `observed=4 flagged=2 restricted=1 blocked=0; unresolved flagged+ prec-1774727641154-6987fcd9,prec-1774724623920-3fa5c223,prec-1774724623921-6f10640a`

Intentional state changes:

- Dry-run mutation: isolated focus session
- Dry-run mutation: isolated journal entry

## Section 10: Checkpoint full state capture

Raw tool failure:

- `checkpoint(focus="mcp-infrastructure", depth="full")` failed validation because `depth` only accepts `summary`, `standard`, or `deep`.

Executed fallback:

- `checkpoint(focus="mcp-infrastructure", depth="deep")`

Live comparison against fresh state:

- Checkpoint ecosystem score: 92
- Live ecosystem score: 92
- Checkpoint trajectory direction: `degrading`
- Live trajectory direction: `stable`
- Live `ecosystem_trend.degrading`: none found
- Live `enforcement_status.byLevel`: observed 4, flagged 2, restricted 1, blocked 0

Measured drift:

- `checkpoint_trajectory_direction != live_trajectory_direction`
- `driftCount: 1`

Telemetry snapshot saved:

- `/tmp/cascade-audit-1774729570245/echoes/telemetry/snapshot-1774729717654.json`

Bookmarks:

- none found

Intentional state changes:

- Dry-run mutation: isolated telemetry snapshot

## Consolidated priority list

1. `grid-server validate_envelope`
   - Live precedent is `restricted`
   - Error count dominates literal error rows
2. `grid-server admission_policy / admission_stats / admission_bannered_entities`
   - All failed with `TypeError: fetch failed`
3. `eligibility-server`
   - `24 uncommitted changes`
   - `gcRecommended: true`
4. `maintain-server cleanup_execute`
   - Observed precedent remains active
5. `checkpoint trajectory classification`
   - Reports `degrading` while fresh live repo trend is stable

## Drift summary

Measured dimensions:

- `checkpoint_ecosystem_score = 92`
- `live_ecosystem_score = 92`
- `drift_ecosystem_score = false`

- `checkpoint_grid_health = 90`
- `live_grid_health = 90`
- `drift_grid_health = false`

- `checkpoint_hogsmade_health = 75`
- `live_hogsmade_health = 75`
- `drift_hogsmade_health = false`

- `checkpoint_afloat_health = 95`
- `live_afloat_health = 95`
- `drift_afloat_health = false`

- `checkpoint_echoes_health = 100`
- `live_echoes_health = 100`
- `drift_echoes_health = false`

- `checkpoint_glimpse_engine_health = 100`
- `live_glimpse_engine_health = 100`
- `drift_glimpse_engine_health = false`

- `checkpoint_apiguard_health = 90`
- `live_apiguard_health = 90`
- `drift_apiguard_health = false`

- `checkpoint_vision_health = 95`
- `live_vision_health = 95`
- `drift_vision_health = false`

- `checkpoint_trajectory_direction = degrading`
- `live_trajectory_direction = stable`
- `drift_trajectory_direction = true`

- `driftCount = 1`

## Artifacts created during the run

Live artifacts:

- `prec-1774724623921-6f10640a` escalated to `restricted`
- `prec-1774729011128-f4898b31` created as a new observed fingerprint

Dry-run artifacts:

- Synthetic `/tmp` precedent lifecycle write attempts
- Knowledge entities:
  - `precedent-system`
  - `recurrence-detector`
  - `echoes-server`
- Knowledge relationships:
  - `recurrence-detector DEPENDS_ON precedent-system`
  - `echoes-server EXECUTED_BY recurrence-detector`
- Experiments:
  - `audit-ingest-throughput`
  - `audit-query-latency`
- Focus entry and journal entry in isolated pulse state
- Telemetry snapshot:
  - `/tmp/cascade-audit-1774729570245/echoes/telemetry/snapshot-1774729717654.json`

Artifacts requested but not successfully completed:

- Section 8 traces: none found because `record_trace` failed on missing `pydantic`
- Section 10 bookmarks: none found

## Final status

Completed:

- Live read-side sections 1 to 3 and 5
- Dry-run section 6
- Dry-run section 7
- Dry-run section 9
- Dry-run section 10 telemetry persistence

Partially completed:

- Section 4 precedent lifecycle, blocked by live precedent-store path coupling
- Section 8 trace persistence, blocked by missing Python dependency in sandbox
