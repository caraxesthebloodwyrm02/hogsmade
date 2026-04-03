import React from "react";
import { cn } from "@/lib/utils";

interface CanvasToolbarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface CanvasToolbarProps {
  actions: CanvasToolbarAction[];
  className?: string;
}

export function CanvasToolbar({ actions, className }: CanvasToolbarProps) {
  const visibleActions = actions.slice(0, 4);

  return (
    <div
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-30",
        "flex items-center gap-2 px-3 py-2",
        "glass-panel shadow-token-md",
        className,
      )}
      role="toolbar"
      aria-label="Canvas tools"
    >
      {visibleActions.map((action) => (
        <button
          key={action.id}
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md",
            "min-h-touch min-w-touch",
            "font-body text-sm font-medium",
            "transition-colors duration-fast",
            "focus:outline-none focus:ring-2 focus:ring-teal-500",
            action.disabled
              ? "text-ink-muted cursor-not-allowed opacity-50"
              : "text-ink hover:bg-surface-raised active:bg-teal-100",
          )}
          aria-label={action.label}
          title={action.label}
        >
          <span className="w-5 h-5 flex items-center justify-center" aria-hidden="true">
            {action.icon}
          </span>
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
