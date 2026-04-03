import { AnnotationNote } from "@/components/phase4/canvas/AnnotationNote";
import { BranchFork } from "@/components/phase4/canvas/BranchFork";
import { CanvasToolbar } from "@/components/phase4/canvas/CanvasToolbar";
import { GlimpseSnapshotCard } from "@/components/phase4/canvas/GlimpseSnapshotCard";
import { ScenarioCanvas } from "@/components/phase4/canvas/ScenarioCanvas";
import { ScenarioSeedCard } from "@/components/phase4/canvas/ScenarioSeedCard";
import type { TimelineMarker } from "@/components/phase4/canvas/TimelineRibbon";
import { TimelineRibbon } from "@/components/phase4/canvas/TimelineRibbon";
import type { Annotation, Branch, GlimpseSnapshot, ScenarioSeed } from "@/components/phase4/types";
import { useCanvasSeeds } from "@/hooks/useCanvasSeeds";
import { loadCanvasState, useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Seed shelf (C2: externalized to /data/seed-templates.json) ──── */

interface CanvasNode {
  type: "seed" | "glimpse";
  id: string;
  x: number;
  y: number;
}

interface ForkEdge {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
}

export function ScenarioCanvasView() {
  /* ── Seed templates (C2: fetched from /data/seed-templates.json) ─ */
  const { seeds: seedShelf } = useCanvasSeeds();

  /* ── Restore persisted state ────────────────────────────────────── */
  const restored = useRef(loadCanvasState());
  const initial = restored.current;

  /* ── State ─────────────────────────────────────────────────────── */
  const idCounter = useRef(initial?.idCounter ?? 100);
  const [seeds, setSeeds] = useState<ScenarioSeed[]>((initial?.seeds ?? []) as ScenarioSeed[]);
  const [branches, setBranches] = useState<Branch[]>((initial?.branches ?? []) as Branch[]);
  const [snapshots, setSnapshots] = useState<GlimpseSnapshot[]>(
    (initial?.snapshots ?? []) as GlimpseSnapshot[],
  );
  const [annotations, setAnnotations] = useState<Annotation[]>(
    (initial?.annotations ?? []) as Annotation[],
  );
  const [nodes, setNodes] = useState<CanvasNode[]>((initial?.nodes ?? []) as CanvasNode[]);
  const [edges, setEdges] = useState<ForkEdge[]>((initial?.edges ?? []) as ForkEdge[]);
  const [selectedGlimpses, setSelectedGlimpses] = useState<Set<string>>(new Set());
  const [showShelf, setShowShelf] = useState(false);
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  /* ── Auto-save to localStorage ─────────────────────────────────── */
  const { save } = useCanvasPersistence();
  useEffect(() => {
    save({ seeds, branches, snapshots, annotations, nodes, edges, idCounter: idCounter.current });
  }, [seeds, branches, snapshots, annotations, nodes, edges, save]);

  /* ── Actions ───────────────────────────────────────────────────── */
  const addSeed = useCallback(
    (template: ScenarioSeed) => {
      const seed: ScenarioSeed = {
        ...template,
        id: `seed-${++idCounter.current}`,
        createdAt: new Date().toISOString(),
      };
      const offsetX = nodes.length * 320 + 80;
      setSeeds((s: ScenarioSeed[]) => [...s, seed]);
      setNodes((n: CanvasNode[]) => [...n, { type: "seed", id: seed.id, x: offsetX, y: 80 }]);
      setShowShelf(false);
    },
    [nodes.length],
  );

  const forkFromSeed = useCallback(
    (seedId: string) => {
      const seedNode = nodes.find((n) => n.id === seedId);
      if (!seedNode) return;

      const branchId = `branch-${++idCounter.current}`;
      const snapshotId = `glimpse-${++idCounter.current}`;
      const branch: Branch = {
        id: branchId,
        seedId,
        label: `Branch ${branches.length + 1}`,
      };

      const branchCount = branches.filter((b: Branch) => b.seedId === seedId).length;
      const snapX = seedNode.x + (branchCount % 2 === 0 ? -160 : 160) + branchCount * 60;
      const snapY = seedNode.y + 240;

      const snapshot: GlimpseSnapshot = {
        id: snapshotId,
        branchId,
        title: `What if... (${branches.length + 1})`,
        content: "Describe what happens next in this branch. Click to edit.",
        annotations: [],
        createdAt: new Date().toISOString(),
      };

      const edge: ForkEdge = {
        from: seedId,
        to: snapshotId,
        fromX: seedNode.x + 128,
        fromY: seedNode.y + 140,
        toX: snapX + 144,
        toY: snapY,
        label: branch.label,
      };

      setBranches((b: Branch[]) => [...b, branch]);
      setSnapshots((s: GlimpseSnapshot[]) => [...s, snapshot]);
      setNodes((n: CanvasNode[]) => [
        ...n,
        { type: "glimpse", id: snapshotId, x: snapX, y: snapY },
      ]);
      setEdges((e: ForkEdge[]) => [...e, edge]);
    },
    [nodes, branches],
  );

  const addAnnotation = useCallback(() => {
    const note: Annotation = {
      id: `note-${++idCounter.current}`,
      text: "",
      x: 200 + Math.random() * 300,
      y: 200 + Math.random() * 200,
      color: "var(--amber-100)",
    };
    setAnnotations((a: Annotation[]) => [...a, note]);
  }, []);

  const updateAnnotation = useCallback((id: string, text: string) => {
    setAnnotations((a: Annotation[]) =>
      a.map((n: Annotation) => (n.id === id ? { ...n, text } : n)),
    );
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((a: Annotation[]) => a.filter((n: Annotation) => n.id !== id));
  }, []);

  const toggleGlimpseSelection = useCallback((id: string) => {
    setSelectedGlimpses((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  }, []);

  /* ── Timeline markers (C1: breadcrumb memory) ──────────────────── */
  const timelineMarkers: TimelineMarker[] = useMemo(
    () => [
      ...seeds.map((s: ScenarioSeed) => ({
        id: s.id,
        label: s.title,
        active: activeMarker === s.id,
      })),
      ...snapshots.map((g: GlimpseSnapshot) => ({
        id: g.id,
        label: g.title,
        active: activeMarker === g.id,
      })),
    ],
    [seeds, snapshots, activeMarker],
  );

  /* ── Memoized filtered nodes for performance ───────────────────── */
  const seedNodes = useMemo(() => nodes.filter((n: CanvasNode) => n.type === "seed"), [nodes]);
  const glimpseNodes = useMemo(
    () => nodes.filter((n: CanvasNode) => n.type === "glimpse"),
    [nodes],
  );

  /* ── Toolbar (C1: Hick's ceiling ≤4 buttons) ──────────────────── */
  const toolbarActions = [
    {
      id: "add-seed",
      label: "Add seed",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <circle cx="10" cy="10" r="3" />
          <path
            d="M10 2v4M10 14v4M2 10h4M14 10h4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      ),
      onClick: () => setShowShelf((v: boolean) => !v),
    },
    {
      id: "add-note",
      label: "Add note",
      icon: (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-5 h-5"
        >
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M7 7h6M7 10h4" />
        </svg>
      ),
      onClick: addAnnotation,
    },
    {
      id: "compare",
      label: `Compare (${selectedGlimpses.size}/3)`,
      icon: (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-5 h-5"
        >
          <rect x="2" y="4" width="6" height="12" rx="1" />
          <rect x="12" y="4" width="6" height="12" rx="1" />
        </svg>
      ),
      onClick: () => {},
      disabled: selectedGlimpses.size < 2,
    },
    {
      id: "export",
      label: "Export",
      icon: (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-5 h-5"
        >
          <path d="M10 3v10M6 9l4 4 4-4M4 15h12" />
        </svg>
      ),
      onClick: () => {
        const payload = {
          seeds,
          branches,
          snapshots,
          annotations,
          nodes,
          edges,
          exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `canvas-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    },
  ];

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="h-full min-h-0 flex flex-col bg-canvas-bg dot-grid font-body relative">
      {/* Toolbar — fixed top center */}
      <CanvasToolbar actions={toolbarActions} />

      {/* Seed shelf drawer (C2: low-tech, plain language) */}
      {showShelf && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl animate-fade-slide-up">
          <div className="glass-panel shadow-token-md p-5 mx-4">
            <h2 className="font-body text-[11px] font-medium uppercase tracking-[0.08em] text-ink mb-2">
              Choose a seed to start
            </h2>
            <p className="font-body text-sm text-ink-muted mb-5">
              A seed is a starting situation for your scenario. Pick one and explore what happens.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
              {seedShelf.map((template) => (
                <button
                  key={template.id}
                  onClick={() => addSeed(template)}
                  className="text-left rounded-lg border border-border-color bg-canvas-bg/80 p-4
                             hover:border-teal-500/50 hover:shadow-glow-emerald
                             transition-all duration-fast
                             focus:outline-none focus:ring-2 focus:ring-teal-500
                             min-h-touch group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-teal-500 group-hover:shadow-glow-emerald transition-shadow" />
                    <h3 className="font-heading text-sm font-bold text-ink">{template.title}</h3>
                  </div>
                  <p className="font-body text-xs text-ink-muted line-clamp-3">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowShelf(false)}
              className="mt-4 font-body text-sm text-ink-muted hover:text-ink
                         transition-colors duration-fast"
            >
              Close shelf
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        className={cn(
          "flex-1 min-h-0 relative",
          timelineMarkers.length > 0 && "pb-14",
          selectedGlimpses.size >= 2 && "pb-48",
        )}
      >
        <ScenarioCanvas className="w-full h-full">
          {/* Fork edges */}
          {edges.map((edge: ForkEdge) => (
            <BranchFork
              key={`${edge.from}-${edge.to}`}
              fromX={edge.fromX}
              fromY={edge.fromY}
              toX={edge.toX}
              toY={edge.toY}
              label={edge.label}
            />
          ))}

          {/* Seed cards */}
          {seedNodes.map((node: CanvasNode) => {
            const seed = seeds.find((s: ScenarioSeed) => s.id === node.id);
            if (!seed) return null;
            return (
              <ScenarioSeedCard
                key={seed.id}
                seed={seed}
                onFork={forkFromSeed}
                style={{ position: "absolute", left: node.x, top: node.y }}
              />
            );
          })}

          {/* Glimpse snapshots */}
          {glimpseNodes.map((node: CanvasNode) => {
            const snap = snapshots.find((s: GlimpseSnapshot) => s.id === node.id);
            if (!snap) return null;
            return (
              <GlimpseSnapshotCard
                key={snap.id}
                snapshot={snap}
                isSelected={selectedGlimpses.has(snap.id)}
                onSelect={toggleGlimpseSelection}
                style={{ position: "absolute", left: node.x, top: node.y }}
              />
            );
          })}

          {/* Annotation notes */}
          {annotations.map((note: Annotation) => (
            <AnnotationNote
              key={note.id}
              id={note.id}
              text={note.text}
              x={note.x}
              y={note.y}
              color={note.color}
              onUpdate={updateAnnotation}
              onDelete={deleteAnnotation}
            />
          ))}
        </ScenarioCanvas>

        {/* Empty state */}
        {seeds.length === 0 && !showShelf && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto max-w-sm animate-fade-in">
              <div
                className="w-20 h-20 mx-auto mb-5 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shadow-glow-emerald"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-9 h-9 text-teal-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
                </svg>
              </div>
              <h2 className="font-heading text-2xl font-bold text-ink mb-3">
                Your canvas is empty
              </h2>
              <p className="font-body text-sm text-ink-muted mb-6 leading-relaxed">
                Start by choosing a seed — a starting situation for your scenario. Then fork it to
                explore different paths and compare glimpses side by side.
              </p>
              <button
                onClick={() => setShowShelf(true)}
                className="font-body text-base font-medium text-canvas-bg bg-teal-500 hover:bg-teal-600
                           min-h-touch px-7 py-3 rounded-lg
                           transition-all duration-fast shadow-glow-emerald hover:shadow-glow-emerald
                           focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-canvas-bg"
              >
                Choose a seed
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline ribbon */}
      {timelineMarkers.length > 0 && (
        <TimelineRibbon markers={timelineMarkers} onSelect={(id) => setActiveMarker(id)} />
      )}

      {/* Comparison tray (C3: side-by-side, max 3) */}
      {selectedGlimpses.size >= 2 && (
        <div className="fixed bottom-14 left-0 right-0 z-20 px-4">
          <div className="max-w-5xl mx-auto glass-panel shadow-token-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm font-bold text-ink">
                Comparing {selectedGlimpses.size} glimpses
              </h3>
              <button
                onClick={() => setSelectedGlimpses(new Set())}
                className="font-body text-xs text-ink-muted hover:text-ink
                           transition-colors duration-fast
                           focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-2 py-1"
              >
                Clear comparison
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from(selectedGlimpses).map((gId) => {
                const snap = snapshots.find((s: GlimpseSnapshot) => s.id === gId);
                if (!snap) return null;
                return (
                  <div
                    key={snap.id}
                    className="rounded-md border border-teal-500/30 bg-teal-500/5 p-3"
                  >
                    <h4 className="font-heading text-xs font-bold text-ink mb-1 truncate">
                      {snap.title}
                    </h4>
                    <p className="font-body text-xs text-ink-muted line-clamp-4">{snap.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
