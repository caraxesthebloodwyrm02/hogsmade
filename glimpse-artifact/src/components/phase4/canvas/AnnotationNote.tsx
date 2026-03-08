import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AnnotationNoteProps {
  id: string;
  text: string;
  x: number;
  y: number;
  color?: string;
  onUpdate?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function AnnotationNote({
  id,
  text,
  x,
  y,
  color = 'var(--amber-100)',
  onUpdate,
  onDelete,
  className,
}: AnnotationNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = () => {
    setIsEditing(false);
    if (draft.trim() !== text) {
      onUpdate?.(id, draft.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(text);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        'absolute w-48 rounded-md shadow-token-md p-3',
        'font-body text-sm text-ink',
        className
      )}
      style={{
        left: x,
        top: y,
        backgroundColor: color,
      }}
      data-draggable
      role="note"
      aria-label={`Note: ${text.slice(0, 40)}`}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent resize-none border-none outline-none font-body text-sm text-ink min-h-[60px]"
          autoFocus
          aria-label="Edit note"
        />
      ) : (
        <div
          className="whitespace-pre-wrap cursor-text min-h-[24px]"
          onClick={() => setIsEditing(true)}
          role="button"
          tabIndex={0}
          aria-label="Click to edit note"
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') setIsEditing(true);
          }}
        >
          {text || 'Click to add a note...'}
        </div>
      )}

      {onDelete && (
        <button
          onClick={() => onDelete(id)}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-canvas-surface border border-border-color
                     flex items-center justify-center text-ink-muted hover:text-rose-500
                     transition-colors duration-fast
                     focus:outline-none focus:ring-2 focus:ring-teal-500"
          aria-label="Delete this note"
        >
          <span aria-hidden="true" className="text-xs font-bold">&times;</span>
        </button>
      )}
    </div>
  );
}
