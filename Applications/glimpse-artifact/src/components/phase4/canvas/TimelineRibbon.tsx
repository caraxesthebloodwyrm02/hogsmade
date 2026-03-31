import { cn } from "@/lib/utils";

export interface TimelineMarker {
  id: string;
  label: string;
  active?: boolean;
}

interface TimelineRibbonProps {
  markers: TimelineMarker[];
  onSelect?: (id: string) => void;
  className?: string;
}

export function TimelineRibbon({
  markers,
  onSelect,
  className,
}: TimelineRibbonProps) {
  if (markers.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30",
        "bg-canvas-surface/90 backdrop-blur-sm border-t border-border-color",
        "px-4 py-2",
        className,
      )}
      role="navigation"
      aria-label="Scenario timeline"
    >
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        <div
          className="w-full h-0.5 absolute top-1/2 left-0 right-0 bg-border-color -translate-y-1/2"
          aria-hidden="true"
        />

        {markers.map((marker) => (
          <button
            key={marker.id}
            onClick={() => onSelect?.(marker.id)}
            className={cn(
              "relative shrink-0 flex flex-col items-center gap-1 px-3 py-1 rounded-md",
              "min-h-touch min-w-[60px]",
              "font-body text-xs font-medium",
              "transition-colors duration-fast",
              "focus:outline-none focus:ring-2 focus:ring-teal-500",
              marker.active
                ? "text-teal-600 bg-teal-100"
                : "text-ink-muted hover:text-ink hover:bg-surface-raised",
            )}
            aria-current={marker.active ? "step" : undefined}
            aria-label={`Go to ${marker.label}`}
          >
            <span
              className={cn(
                "w-3 h-3 rounded-full border-2",
                marker.active
                  ? "border-teal-500 bg-teal-500"
                  : "border-ink-muted bg-canvas-surface",
              )}
              aria-hidden="true"
            />
            <span className="truncate max-w-[80px]">{marker.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
