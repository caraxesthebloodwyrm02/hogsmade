import React from 'react';
import { cn } from '@/lib/utils';
import type { ScenarioSeed } from '../types';

interface ScenarioSeedCardProps {
  seed: ScenarioSeed;
  onFork?: (seedId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function ScenarioSeedCard({ seed, onFork, className, style }: ScenarioSeedCardProps) {
  return (
    <div
      className={cn(
        'w-64 glass-panel border-2 border-teal-500/50 p-4 shadow-token-md card-glow',
        className
      )}
      style={style}
      data-draggable
      role="article"
      aria-label={`Seed: ${seed.title}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full bg-teal-500 shadow-glow-emerald shrink-0"
          aria-hidden="true"
        />
        <h3 className="font-heading text-base font-bold text-ink leading-snug truncate">
          {seed.title}
        </h3>
      </div>

      <p className="font-body text-sm text-ink-muted line-clamp-3 mb-3">
        {seed.description}
      </p>

      {onFork && (
        <button
          onClick={() => onFork(seed.id)}
          className="font-body text-sm font-medium text-teal-500 hover:text-teal-600
                     min-h-touch px-3 py-2 rounded-md w-full text-center
                     border border-teal-500/30 hover:bg-teal-500/10 hover:shadow-glow-emerald
                     transition-all duration-fast
                     focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          Fork here
        </button>
      )}
    </div>
  );
}
