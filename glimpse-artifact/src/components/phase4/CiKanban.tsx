import type { PipelinePR } from "./types";
import { cn } from "@/lib/utils";
import { Bot, User, GitPullRequest, AlertTriangle } from "lucide-react";

interface CiKanbanProps {
  prs: PipelinePR[];
  loading: boolean;
}

type Lane = "pending" | "scanning" | "building" | "merged" | "fix-queue";

const LANES: { id: Lane; label: string; color: string; bgClass: string }[] = [
  { id: "pending", label: "Pending", color: "text-gray-400", bgClass: "bg-gray-500/10 border-gray-500/20" },
  { id: "scanning", label: "Scanning", color: "text-amber-400", bgClass: "bg-amber-400/10 border-amber-400/20" },
  { id: "building", label: "Building", color: "text-blue-400", bgClass: "bg-blue-400/10 border-blue-400/20" },
  { id: "merged", label: "Merged", color: "text-emerald-400", bgClass: "bg-emerald-500/10 border-emerald-500/20" },
  { id: "fix-queue", label: "Fix Queue", color: "text-rose-400", bgClass: "bg-rose-500/10 border-rose-500/20" },
];

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function PrCard({ pr }: { pr: PipelinePR }) {
  const Wrapper = pr.url ? "a" : "div";
  const linkProps = pr.url ? { href: pr.url, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Wrapper
      {...linkProps}
      className={cn(
        "block glass-panel p-3 space-y-2",
        "hover:border-teal-500/30 transition-all",
        pr.url && "cursor-pointer",
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
                ? "bg-rose-500/15 text-rose-400"
                : label === "dependencies"
                  ? "bg-blue-400/15 text-blue-400"
                  : label === "auto-merge"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-gray-500/15 text-gray-400",
            )}
          >
            {label}
          </span>
        ))}
        {pr.runnerType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">
            {pr.runnerType}
          </span>
        )}
      </div>
      {pr.repo && (
        <div className="text-[10px] text-ink-muted font-mono truncate">
          {pr.repo}
        </div>
      )}
    </Wrapper>
  );
}

export function CiKanban({ prs, loading }: CiKanbanProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        {LANES.map((lane) => (
          <div key={lane.id} className="space-y-2">
            <div className="h-6 w-20 rounded skeleton-shimmer" />
            <div className="h-24 rounded-lg skeleton-shimmer" />
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
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
