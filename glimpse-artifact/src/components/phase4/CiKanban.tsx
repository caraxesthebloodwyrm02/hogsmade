import type { PipelinePR } from "./types";
import { cn } from "@/lib/utils";
import { Bot, User, GitPullRequest, AlertTriangle } from "lucide-react";

interface CiKanbanProps {
  prs: PipelinePR[];
  loading: boolean;
}

type Lane = "pending" | "scanning" | "building" | "merged" | "fix-queue";

const LANES: { id: Lane; label: string; color: string; bgClass: string }[] = [
  { id: "pending", label: "Pending", color: "text-gray-600", bgClass: "bg-gray-50 border-gray-200" },
  { id: "scanning", label: "Scanning", color: "text-amber-600", bgClass: "bg-amber-50 border-amber-200" },
  { id: "building", label: "Building", color: "text-blue-600", bgClass: "bg-blue-50 border-blue-200" },
  { id: "merged", label: "Merged", color: "text-emerald-600", bgClass: "bg-emerald-50 border-emerald-200" },
  { id: "fix-queue", label: "Fix Queue", color: "text-rose-600", bgClass: "bg-rose-50 border-rose-200" },
];

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function PrCard({ pr }: { pr: PipelinePR }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-canvas-surface p-3 shadow-token-sm space-y-2",
        "hover:shadow-md transition-shadow",
      )}
    >
      <div className="flex items-start gap-2">
        <GitPullRequest className="w-3.5 h-3.5 text-ink-muted shrink-0 mt-0.5" />
        <span className="text-xs font-medium text-ink leading-tight line-clamp-2">
          {pr.title}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {pr.source === "dependabot" ? (
            <Bot className="w-3 h-3 text-blue-500" />
          ) : (
            <User className="w-3 h-3 text-purple-500" />
          )}
          <span className="text-[10px] text-ink-muted">{pr.author.replace("[bot]", "")}</span>
        </div>
        <span className="text-[10px] text-ink-muted">{timeAgo(pr.updatedAt)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {pr.labels.map((label) => (
          <span
            key={label}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              label === "agent:fix"
                ? "bg-rose-100 text-rose-700"
                : label === "dependencies"
                  ? "bg-blue-100 text-blue-700"
                  : label === "auto-merge"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-700",
            )}
          >
            {label}
          </span>
        ))}
        {pr.runnerType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
            {pr.runnerType}
          </span>
        )}
      </div>
    </div>
  );
}

export function CiKanban({ prs, loading }: CiKanbanProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        {LANES.map((lane) => (
          <div key={lane.id} className="space-y-2">
            <div className="h-6 w-20 rounded bg-surface-raised animate-pulse" />
            <div className="h-24 rounded-lg bg-surface-raised animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const byLane = (lane: Lane) => prs.filter((pr) => pr.status === lane);
  const fixCount = byLane("fix-queue").length;

  return (
    <div className="space-y-4">
      {fixCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          <AlertTriangle className="w-4 h-4" />
          {fixCount} PR{fixCount !== 1 ? "s" : ""} in fix queue awaiting agent:fix
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {LANES.map((lane) => {
          const items = byLane(lane.id);
          return (
            <div key={lane.id} className="min-w-0">
              <div className={cn(
                "flex items-center justify-between px-2.5 py-1.5 rounded-t-lg border-b-2 mb-2",
                lane.bgClass,
              )}>
                <span className={cn("text-xs font-bold", lane.color)}>{lane.label}</span>
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                  lane.bgClass,
                  lane.color,
                )}>
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {items.length === 0 ? (
                  <div className="text-[10px] text-ink-muted text-center py-6 border border-dashed border-border-color rounded-lg">
                    Empty
                  </div>
                ) : (
                  items.map((pr) => <PrCard key={pr.id} pr={pr} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-ink-muted text-center">
        {prs.length} total PR{prs.length !== 1 ? "s" : ""} across pipeline
      </div>
    </div>
  );
}
