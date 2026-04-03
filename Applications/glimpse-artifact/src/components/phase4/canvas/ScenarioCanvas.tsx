import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ScenarioCanvasProps {
  children?: React.ReactNode;
  className?: string;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function ScenarioCanvas({ children, className }: ScenarioCanvasProps) {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-draggable]") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea")
    )
      return;

    setIsPanning(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setTransform((t: Transform) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    },
    [isPanning],
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setTransform((t: Transform) => {
      const newScale = Math.max(0.25, Math.min(3, t.scale * delta));
      return { ...t, scale: newScale };
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  return (
    <div
      ref={canvasRef}
      className={cn(
        "relative w-full h-full overflow-hidden select-none",
        "bg-canvas-bg",
        isPanning ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      role="application"
      aria-label="Scenario canvas. Click and drag to pan. Scroll to zoom."
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = 40;
        if (e.key === "ArrowLeft") setTransform((t: Transform) => ({ ...t, x: t.x + step }));
        if (e.key === "ArrowRight") setTransform((t: Transform) => ({ ...t, x: t.x - step }));
        if (e.key === "ArrowUp") setTransform((t: Transform) => ({ ...t, y: t.y + step }));
        if (e.key === "ArrowDown") setTransform((t: Transform) => ({ ...t, y: t.y - step }));
        if (e.key === "0" || e.key === "Home") resetView();
        if (e.key === "+" || e.key === "=")
          setTransform((t: Transform) => ({ ...t, scale: Math.min(3, t.scale * 1.1) }));
        if (e.key === "-")
          setTransform((t: Transform) => ({ ...t, scale: Math.max(0.25, t.scale * 0.9) }));
      }}
    >
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transition: isPanning ? "none" : `transform var(--duration-normal) var(--easing-default)`,
        }}
      >
        {children}
      </div>

      <div
        className="absolute bottom-3 right-3 font-body text-xs text-ink-muted bg-canvas-surface/80 
                    backdrop-blur-sm px-2 py-1 rounded-md pointer-events-none"
        aria-live="polite"
      >
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  );
}
