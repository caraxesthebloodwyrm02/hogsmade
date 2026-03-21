import React from 'react';
import { cn } from '@/lib/utils';
import type { GlimpseSnapshot } from '../types';

interface GlimpseSnapshotCardProps {
  snapshot: GlimpseSnapshot;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function GlimpseSnapshotCard({
  snapshot,
  isSelected,
  onSelect,
  className,
  style,
}: GlimpseSnapshotCardProps) {
  return (
    <div
      className={cn(
        'w-72 glass-panel p-4 shadow-token-sm',
        'transition-all duration-fast',
        isSelected
          ? 'border-teal-500 ring-2 ring-teal-200 shadow-token-md'
          : 'border-border-color hover:shadow-token-md',
        className
      )}
      style={style}
      data-draggable
      role="article"
      aria-label={`Glimpse: ${snapshot.title}`}
      aria-selected={isSelected}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-heading text-sm font-bold text-ink truncate">
          {snapshot.title}
        </h4>
        {onSelect && (
          <button
            onClick={() => onSelect(snapshot.id)}
            className="font-body text-xs font-medium text-teal-600 hover:text-teal-700
                       min-h-[32px] min-w-[32px] px-2 py-1 rounded
                       transition-colors duration-fast
                       focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label={isSelected ? 'Deselect this glimpse' : 'Select for comparison'}
          >
            {isSelected ? 'Selected' : 'Compare'}
          </button>
        )}
      </div>

      <div className="font-body text-sm text-ink leading-relaxed whitespace-pre-wrap line-clamp-6 mb-2">
        {snapshot.content}
      </div>

      {snapshot.annotations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-color">
          <span className="font-body text-xs text-ink-muted">
            {snapshot.annotations.length} note{snapshot.annotations.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="mt-2 font-body text-xs text-ink-muted">
        {new Date(snapshot.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}
