/**
 * GRUFF geometry box — deterministic SVG projection of the threat×project heatmap.
 *
 * Renders a stable, high-contrast grid for MCP consumers, Canvas, or static reports.
 * Palette is fixed (not theme-dependent) so automation and snapshots stay comparable over time.
 */

import type { HeatmapCell, ThreatProjectHeatmapPayload } from "./heatmap.js";

/** Accessible contrast on light backgrounds (GRID-adjacent: amber secondary, green/red signal). */
export const GRUFF_PALETTE = {
  healthy: "#15803d",
  mid: "#d97706",
  bad: "#b91c1c",
  unmapped: "#cbd5e1",
  gridStroke: "#0f172a",
  label: "#0f172a",
  mutedLabel: "#475569",
  bg: "#f8fafc",
} as const;

export interface GruffGeometryOptions {
  /** Pixel width/height of one data cell (excluding margins for labels). */
  cellPx?: number;
  /** Optional title in SVG (escaped). */
  title?: string;
  /** Max characters for axis tick text (ids are truncated with ellipsis). */
  maxLabelChars?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(id: string, max: number): string {
  if (id.length <= max) return id;
  return `${id.slice(0, Math.max(0, max - 1))}…`;
}

function fillForScore(score: number | null): string {
  if (score === null) return GRUFF_PALETTE.unmapped;
  if (score >= 1) return GRUFF_PALETTE.healthy;
  if (score <= 0) return GRUFF_PALETTE.bad;
  return GRUFF_PALETTE.mid;
}

function cellMap(cells: HeatmapCell[]): Map<string, HeatmapCell> {
  const m = new Map<string, HeatmapCell>();
  for (const c of cells) {
    m.set(`${c.row}\0${c.col}`, c);
  }
  return m;
}

/**
 * Build a compact SVG document for a heatmap payload (same truncation as the JSON payload).
 */
export function renderGruffGeometrySvg(
  payload: ThreatProjectHeatmapPayload,
  options: GruffGeometryOptions = {},
): string {
  const cellPx = options.cellPx ?? 14;
  const maxLabelChars = options.maxLabelChars ?? 12;
  const title = options.title ?? "Threat × project coverage (GRUFF)";

  const { rowIds, colIds } = payload.axes;
  const rows = rowIds.length;
  const cols = colIds.length;
  if (rows === 0 || cols === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <rect width="100%" height="100%" fill="${GRUFF_PALETTE.bg}"/>
  <text x="16" y="44" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" fill="${GRUFF_PALETTE.mutedLabel}">No grid data</text>
</svg>`;
  }

  const leftMargin = 120;
  const topMargin = 72;
  const foot = 28;
  const gridW = leftMargin + cols * cellPx + 24;
  /** Legend row needs ~400px; widen short grids so labels are not clipped. */
  const w = Math.max(gridW, 440);
  const h = topMargin + rows * cellPx + foot;

  const cmap = cellMap(payload.cells);
  const rects: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rowId = rowIds[r]!;
      const colId = colIds[c]!;
      const cell = cmap.get(`${rowId}\0${colId}`);
      const score = cell?.score ?? null;
      const fill = fillForScore(score);
      const x = leftMargin + c * cellPx;
      const y = topMargin + r * cellPx;
      rects.push(
        `<rect x="${x}" y="${y}" width="${cellPx}" height="${cellPx}" fill="${fill}" stroke="${
          GRUFF_PALETTE.gridStroke
        }" stroke-width="0.5" data-row="${escapeXml(rowId)}" data-col="${escapeXml(colId)}"/>`,
      );
    }
  }

  const colLabels: string[] = [];
  for (let c = 0; c < cols; c++) {
    const id = colIds[c]!;
    const t = truncateLabel(id, maxLabelChars);
    const x = leftMargin + c * cellPx + cellPx / 2;
    colLabels.push(
      `<text x="${x}" y="${topMargin - 8}" text-anchor="end" transform="rotate(-45 ${x} ${
        topMargin - 8
      })" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" fill="${
        GRUFF_PALETTE.mutedLabel
      }">${escapeXml(t)}</text>`,
    );
  }

  const rowLabels: string[] = [];
  for (let r = 0; r < rows; r++) {
    const id = rowIds[r]!;
    const t = truncateLabel(id, maxLabelChars);
    const y = topMargin + r * cellPx + cellPx / 2 + 4;
    rowLabels.push(
      `<text x="${
        leftMargin - 6
      }" y="${y}" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" fill="${
        GRUFF_PALETTE.mutedLabel
      }">${escapeXml(t)}</text>`,
    );
  }

  const legendY = h - 14;
  const leg = [
    `<text x="16" y="${legendY}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" fill="${GRUFF_PALETTE.label}">Legend:</text>`,
    `<rect x="64" y="${legendY - 10}" width="10" height="10" fill="${
      GRUFF_PALETTE.healthy
    }" stroke="${GRUFF_PALETTE.gridStroke}" stroke-width="0.3"/>`,
    `<text x="78" y="${legendY}" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${GRUFF_PALETTE.mutedLabel}">healthy</text>`,
    `<rect x="140" y="${legendY - 10}" width="10" height="10" fill="${GRUFF_PALETTE.mid}" stroke="${
      GRUFF_PALETTE.gridStroke
    }" stroke-width="0.3"/>`,
    `<text x="154" y="${legendY}" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${GRUFF_PALETTE.mutedLabel}">stale / degraded</text>`,
    `<rect x="270" y="${legendY - 10}" width="10" height="10" fill="${GRUFF_PALETTE.bad}" stroke="${
      GRUFF_PALETTE.gridStroke
    }" stroke-width="0.3"/>`,
    `<text x="284" y="${legendY}" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${GRUFF_PALETTE.mutedLabel}">failing</text>`,
    `<rect x="350" y="${legendY - 10}" width="10" height="10" fill="${
      GRUFF_PALETTE.unmapped
    }" stroke="${GRUFF_PALETTE.gridStroke}" stroke-width="0.3"/>`,
    `<text x="364" y="${legendY}" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${GRUFF_PALETTE.mutedLabel}">unmapped</text>`,
  ];

  const omittedNote =
    payload.truncated.threatsOmitted > 0 || payload.truncated.projectsOmitted > 0
      ? `<text x="16" y="${
          topMargin + rows * cellPx + 18
        }" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${
          GRUFF_PALETTE.mutedLabel
        }">Truncated: +${payload.truncated.threatsOmitted} threats, +${
          payload.truncated.projectsOmitted
        } projects omitted from cap</text>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(
    title,
  )}">
  <title>${escapeXml(title)}</title>
  <rect width="100%" height="100%" fill="${GRUFF_PALETTE.bg}"/>
  <text x="16" y="28" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="600" fill="${
    GRUFF_PALETTE.label
  }">${escapeXml(title)}</text>
  <text x="16" y="46" font-size="10" font-family="ui-sans-serif,system-ui,sans-serif" fill="${
    GRUFF_PALETTE.mutedLabel
  }">generated ${escapeXml(payload.generatedAt)}</text>
  ${rowLabels.join("\n  ")}
  ${colLabels.join("\n  ")}
  ${rects.join("\n  ")}
  ${leg.join("\n  ")}
  ${omittedNote}
</svg>`;
}
