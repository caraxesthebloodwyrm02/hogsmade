import { DataError } from "@/components/phase4/DataError";
import type {
  BeatRailEntry,
  ConditionNote,
  CycleSnapshot,
  EndpointSpec,
  MomentumFrame,
  PromotionGateResult,
} from "@/components/phase4/types";
import { useEvolutionCycle } from "@/hooks/useEvolutionCycle";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  Gauge,
  GitBranch,
  Orbit,
  ShieldAlert,
  TableProperties,
  TimerReset,
} from "lucide-react";
import { useMemo, useState } from "react";

const FIXTURE_OPTIONS = [
  { id: "balanced-bridge", label: "Balanced bridge" },
  { id: "governance-lattice", label: "Governance lattice" },
  { id: "usability-orbit", label: "Usability orbit" },
];

function formatDecimal(value: number) {
  return value.toFixed(3);
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function BeatRailPanel({ beatRail }: { beatRail: BeatRailEntry[] }) {
  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Orbit className="w-4 h-4 text-teal-500" />
        <h2 className="font-body text-sm font-medium text-ink">Beat Rail</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {beatRail.map((entry) => (
          <div
            key={entry.beat}
            className={cn(
              "rounded-xl border p-4 transition-colors",
              entry.state === "current" && "border-teal-500/40 bg-teal-500/10",
              entry.state === "complete" && "border-amber-400/30 bg-amber-400/10",
              entry.state === "pending" && "border-border-color bg-surface-raised",
            )}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              {entry.state}
            </p>
            <p className="mt-2 font-body text-lg text-ink capitalize">{entry.beat}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function MomentumPanel({ momentum }: { momentum: MomentumFrame }) {
  const metrics = [
    { label: "Acceleration", value: momentum.acceleration, accent: "text-amber-500" },
    { label: "Momentum", value: momentum.momentum, accent: "text-teal-500" },
    { label: "Sidewalk drift", value: momentum.sidewalkDrift, accent: "text-rose-500" },
    { label: "Endpoint readiness", value: momentum.endpointReadiness, accent: "text-sky-500" },
    { label: "Handoff completion", value: momentum.handoffCompletion, accent: "text-violet-500" },
    {
      label: "Integration success",
      value: momentum.integrationSuccessRate,
      accent: "text-lime-500",
    },
  ];

  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Gauge className="w-4 h-4 text-amber-500" />
        <h2 className="font-body text-sm font-medium text-ink">Momentum Surface</h2>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-border-color bg-surface-raised p-4"
          >
            <p className="font-body text-xs uppercase tracking-[0.08em] text-ink-muted">
              {metric.label}
            </p>
            <p className={cn("mt-3 font-mono text-2xl", metric.accent)}>
              {formatDecimal(metric.value)}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-ink-muted">
        <div>
          Reversal rate:{" "}
          <span className="font-mono text-ink">{formatPct(momentum.reversalRate)}</span>
        </div>
        <div>
          Stale ratio:{" "}
          <span className="font-mono text-ink">{formatPct(momentum.staleWindowRatio)}</span>
        </div>
        <div>
          Priority conditions:{" "}
          <span className="font-mono text-ink">{momentum.openPriorityConditionCount}</span>
        </div>
      </div>
    </article>
  );
}

export function PromotionGatePanel({ gate }: { gate: PromotionGateResult | null }) {
  if (!gate) {
    return (
      <article className="glass-panel p-5 space-y-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <h2 className="font-body text-sm font-medium text-ink">Promotion Gate</h2>
        </div>
        <p className="text-sm text-ink-muted">No promotion evaluation has been recorded yet.</p>
      </article>
    );
  }

  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <h2 className="font-body text-sm font-medium text-ink">Promotion Gate</h2>
        </div>
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-[0.08em]",
            gate.passed ? "text-lime-500" : "text-rose-500",
          )}
        >
          {gate.decision}
        </span>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border-color bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">Overall</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {formatDecimal(gate.metrics.overallScore)}
          </p>
        </div>
        <div className="rounded-xl border border-border-color bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">Governance</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {formatDecimal(gate.metrics.governanceScore)}
          </p>
        </div>
        <div className="rounded-xl border border-border-color bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">Integration</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {formatDecimal(gate.metrics.integrationScore)}
          </p>
        </div>
        <div className="rounded-xl border border-border-color bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">Drift</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {formatDecimal(gate.metrics.sidewalkDrift)}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {gate.reasons.length > 0 ? (
          gate.reasons.map((reason) => (
            <p key={reason} className="text-sm text-ink-muted">
              {reason}
            </p>
          ))
        ) : (
          <p className="text-sm text-lime-600">All promotion thresholds passed.</p>
        )}
      </div>
    </article>
  );
}

function EndpointMatrixPanel({ endpointSpecs }: { endpointSpecs: EndpointSpec[] }) {
  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <GitBranch className="w-4 h-4 text-sky-500" />
        <h2 className="font-body text-sm font-medium text-ink">Endpoint Matrix</h2>
      </div>
      {endpointSpecs.length === 0 ? (
        <p className="text-sm text-ink-muted">No endpoint specs have been recorded yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-color">
                <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  Endpoint
                </th>
                <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  Owner
                </th>
                <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  Contract
                </th>
                <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  Status
                </th>
                <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  Readiness
                </th>
              </tr>
            </thead>
            <tbody>
              {endpointSpecs.map((spec) => (
                <tr key={spec.id} className="border-b border-border-color/40">
                  <td className="py-3 pr-4">
                    <div className="font-body text-ink">{spec.label}</div>
                    <div className="font-mono text-[11px] text-ink-muted">{spec.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{spec.owner ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{spec.contract ?? "—"}</td>
                  <td className="py-3 pr-4 font-mono text-teal-600">{spec.status}</td>
                  <td className="py-3 pr-4 font-mono text-ink">
                    {spec.readiness !== undefined ? formatPct(spec.readiness) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function HandoffLanePanel({ snapshot }: { snapshot: CycleSnapshot }) {
  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <ArrowRightLeft className="w-4 h-4 text-violet-500" />
        <h2 className="font-body text-sm font-medium text-ink">Handoff Transport Lane</h2>
      </div>
      {snapshot.caseRecord.handoffs.length === 0 ? (
        <p className="text-sm text-ink-muted">No handoffs recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {snapshot.caseRecord.handoffs.map((handoff) => (
            <div
              key={handoff.id}
              className="rounded-xl border border-border-color bg-surface-raised p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-body text-sm text-ink">
                  {handoff.from} → {handoff.to}
                </p>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-violet-500">
                  {handoff.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{handoff.summary}</p>
              <p className="mt-2 font-mono text-[11px] text-ink-muted">
                {formatTime(handoff.recordedAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function NotesPanel({
  title,
  notes,
}: {
  title: string;
  notes: Array<ConditionNote | { id: string; message: string }>;
}) {
  return (
    <article className="glass-panel p-5 space-y-4">
      <h2 className="font-body text-sm font-medium text-ink">{title}</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-ink-muted">No notes recorded.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-border-color bg-surface-raised p-4"
            >
              {"severity" in note ? (
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-amber-500">
                  {note.severity}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-ink-muted">{note.message}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function CollectionTablePanel({ snapshot }: { snapshot: CycleSnapshot }) {
  const table = snapshot.caseRecord.latestEligibilityResult?.table;
  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TableProperties className="w-4 h-4 text-lime-500" />
        <h2 className="font-body text-sm font-medium text-ink">Collection Table</h2>
      </div>
      {!table ? (
        <p className="text-sm text-ink-muted">No table has been generated yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-color">
                {table.columns.slice(0, 6).map((column) => (
                  <th
                    key={column}
                    className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 6).map((row) => (
                <tr key={row.rowId} className="border-b border-border-color/40">
                  <td className="py-3 pr-4 font-mono text-[11px] text-ink">{row.rowId}</td>
                  <td className="py-3 pr-4 text-ink-muted">{row.rowType}</td>
                  <td className="py-3 pr-4 text-ink-muted">{row.candidateId}</td>
                  <td className="py-3 pr-4 text-ink-muted">{row.dimension}</td>
                  <td className="py-3 pr-4 text-ink-muted">{row.attributeId ?? "—"}</td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-lime-600">
                    {row.creditLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function TimelinePanel({ snapshot }: { snapshot: CycleSnapshot }) {
  return (
    <article className="glass-panel p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TimerReset className="w-4 h-4 text-amber-500" />
        <h2 className="font-body text-sm font-medium text-ink">Audit & Timeline</h2>
      </div>
      <div className="space-y-3">
        {snapshot.caseRecord.timeline
          .slice()
          .reverse()
          .map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border-color bg-surface-raised p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-body text-sm text-ink">{entry.summary}</p>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-amber-500">
                  {entry.event}
                </span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-muted">
                {formatTime(entry.timestamp)}
              </p>
            </div>
          ))}
      </div>
    </article>
  );
}

export function EvolutionCycleView() {
  const {
    cases,
    snapshot,
    selectedCaseId,
    loading,
    error,
    selectCase,
    openCase,
    recordSignal,
    recordHandoff,
    upsertEndpoint,
    advanceCase,
    evaluatePromotion,
  } = useEvolutionCycle();

  const [fixtureId, setFixtureId] = useState("balanced-bridge");
  const [label, setLabel] = useState("Promotion control case");
  const [endpointId, setEndpointId] = useState("primary-endpoint");
  const [endpointLabel, setEndpointLabel] = useState("Primary endpoint");
  const [endpointOwner, setEndpointOwner] = useState("ops");
  const [endpointContract, setEndpointContract] = useState("POST /primary");
  const [endpointStatus, setEndpointStatus] = useState<EndpointSpec["status"]>("ready");
  const [readiness, setReadiness] = useState("0.8");

  const caseMap = useMemo(() => new Map(cases.map((item) => [item.caseId, item])), [cases]);
  const selectedSummary = selectedCaseId ? caseMap.get(selectedCaseId) ?? null : null;

  return (
    <section className="min-h-full bg-canvas-bg text-ink px-5 py-6 md:px-8 space-y-6">
      <header className="space-y-3 max-w-4xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-600">
          Evolution cycle control room
        </p>
        <h1 className="font-body text-3xl md:text-4xl leading-tight text-ink">
          Handoffs, promotion, and integration pressure in one runtime-backed surface
        </h1>
        <p className="max-w-3xl text-sm md:text-base text-ink-muted leading-7">
          The control room is UI-first, but the server snapshot is the authority. Beats, momentum,
          drift, gate status, collection rows, and timeline events are rendered directly from the
          evolution case runtime.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5">
        <aside className="space-y-5">
          <article className="glass-panel p-5 space-y-4">
            <h2 className="font-body text-sm font-medium text-ink">Open Evolution Case</h2>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.08em] text-ink-muted">Fixture</span>
              <select
                value={fixtureId}
                onChange={(event) => setFixtureId(event.target.value)}
                className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
              >
                {FIXTURE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.08em] text-ink-muted">Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
              />
            </label>
            <button
              onClick={() => void openCase({ fixtureId, label })}
              className="w-full rounded-xl bg-teal-500/15 border border-teal-500/30 px-4 py-3 text-sm text-teal-600"
            >
              Open case
            </button>
          </article>

          <article className="glass-panel p-5 space-y-4">
            <h2 className="font-body text-sm font-medium text-ink">Active Cases</h2>
            <div className="space-y-3">
              {cases.map((item) => (
                <button
                  key={item.caseId}
                  onClick={() => void selectCase(item.caseId)}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                    selectedCaseId === item.caseId
                      ? "border-teal-500/40 bg-teal-500/10"
                      : "border-border-color bg-surface-raised",
                  )}
                >
                  <p className="font-body text-sm text-ink">{item.label}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-muted">
                    {item.currentBeat} · {item.status}
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">
                    momentum {formatDecimal(item.momentum)} · drift{" "}
                    {formatDecimal(item.sidewalkDrift)}
                  </p>
                </button>
              ))}
            </div>
          </article>

          {selectedCaseId ? (
            <article className="glass-panel p-5 space-y-4">
              <h2 className="font-body text-sm font-medium text-ink">Runtime Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void advanceCase(selectedCaseId)}
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Advance
                </button>
                <button
                  onClick={() =>
                    void advanceCase(selectedCaseId, "return", "Manual control-room return")
                  }
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Return
                </button>
                <button
                  onClick={() => void recordSignal(selectedCaseId, "integration_call_succeeded")}
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Call success
                </button>
                <button
                  onClick={() => void recordSignal(selectedCaseId, "integration_call_failed")}
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Call failure
                </button>
                <button
                  onClick={() => void recordSignal(selectedCaseId, "heartbeat_stale")}
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Heartbeat stale
                </button>
                <button
                  onClick={() => void evaluatePromotion(selectedCaseId)}
                  className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-600"
                >
                  Evaluate promotion
                </button>
              </div>
            </article>
          ) : null}

          {selectedCaseId ? (
            <article className="glass-panel p-5 space-y-4">
              <h2 className="font-body text-sm font-medium text-ink">Quick Endpoint</h2>
              <div className="space-y-3">
                <input
                  value={endpointId}
                  onChange={(event) => setEndpointId(event.target.value)}
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                />
                <input
                  value={endpointLabel}
                  onChange={(event) => setEndpointLabel(event.target.value)}
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                />
                <input
                  value={endpointOwner}
                  onChange={(event) => setEndpointOwner(event.target.value)}
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                />
                <input
                  value={endpointContract}
                  onChange={(event) => setEndpointContract(event.target.value)}
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                />
                <select
                  value={endpointStatus}
                  onChange={(event) =>
                    setEndpointStatus(event.target.value as EndpointSpec["status"])
                  }
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  <option value="draft">draft</option>
                  <option value="ready">ready</option>
                  <option value="blocked">blocked</option>
                  <option value="verified">verified</option>
                </select>
                <input
                  value={readiness}
                  onChange={(event) => setReadiness(event.target.value)}
                  className="w-full rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                />
                <button
                  onClick={() =>
                    void upsertEndpoint(selectedCaseId, {
                      endpointId,
                      label: endpointLabel,
                      owner: endpointOwner,
                      contract: endpointContract,
                      status: endpointStatus,
                      required: true,
                      readiness: Number.parseFloat(readiness) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-600"
                >
                  Upsert endpoint
                </button>
              </div>
            </article>
          ) : null}

          {selectedCaseId ? (
            <article className="glass-panel p-5 space-y-4">
              <h2 className="font-body text-sm font-medium text-ink">Quick Handoff</h2>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() =>
                    void recordHandoff(selectedCaseId, {
                      from: "mapper",
                      to: "operator",
                      status: "submitted",
                      summary: "Submitted control-room handoff",
                    })
                  }
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Submit handoff
                </button>
                <button
                  onClick={() =>
                    void recordHandoff(selectedCaseId, {
                      from: "mapper",
                      to: "operator",
                      status: "accepted",
                      summary: "Accepted control-room handoff",
                    })
                  }
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Accept handoff
                </button>
                <button
                  onClick={() =>
                    void recordHandoff(selectedCaseId, {
                      from: "mapper",
                      to: "operator",
                      status: "rejected",
                      summary: "Rejected control-room handoff",
                    })
                  }
                  className="rounded-xl border border-border-color bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  Reject handoff
                </button>
              </div>
            </article>
          ) : null}
        </aside>

        <div className="space-y-5">
          {error ? (
            <DataError
              message={error}
              onRetry={() => void selectCase(selectedCaseId ?? snapshot?.caseRecord.caseId ?? "")}
            />
          ) : null}
          {loading && !snapshot ? (
            <div className="glass-panel p-5 text-sm text-ink-muted">Loading control room…</div>
          ) : null}
          {!snapshot ? (
            <div className="glass-panel p-6 text-sm text-ink-muted">
              Open a case or select an existing one to populate the control-room surfaces.
            </div>
          ) : (
            <>
              <article className="glass-panel p-5 space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-600">
                  Runtime-backed summary
                </p>
                <h2 className="font-body text-2xl text-ink">{snapshot.caseRecord.label}</h2>
                <p className="text-sm text-ink-muted leading-7">{snapshot.summary}</p>
                {selectedSummary ? (
                  <p className="font-mono text-[11px] text-ink-muted">
                    case {selectedSummary.caseId} · beat {selectedSummary.currentBeat} · updated{" "}
                    {formatTime(selectedSummary.updatedAt)}
                  </p>
                ) : null}
              </article>

              <BeatRailPanel beatRail={snapshot.beatRail} />
              <MomentumPanel momentum={snapshot.caseRecord.momentum} />
              <PromotionGatePanel gate={snapshot.caseRecord.latestPromotionDecision} />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <EndpointMatrixPanel endpointSpecs={snapshot.caseRecord.endpointSpecs} />
                <HandoffLanePanel snapshot={snapshot} />
                <NotesPanel title="Conditions" notes={snapshot.caseRecord.conditionNotes} />
                <NotesPanel title="Observations" notes={snapshot.caseRecord.observationNotes} />
              </div>

              <CollectionTablePanel snapshot={snapshot} />
              <TimelinePanel snapshot={snapshot} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
