import { computeClusters } from "./engine.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function forceLayout(nodes, edges, width, height) {
  const count = nodes.length;
  if (!count) return;

  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / count;
    const radius = Math.min(width, height) * 0.32;
    node.x = width / 2 + Math.cos(angle) * radius;
    node.y = height / 2 + Math.sin(angle) * radius;
    node.vx = 0;
    node.vy = 0;
  });

  const k = Math.sqrt((width * height) / Math.max(count, 1));
  const iterations = Math.min(170, Math.max(40, 240 - count * 2));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (let iter = 0; iter < iterations; iter += 1) {
    const cool = 1 - iter / iterations;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const force = ((k * k) / dist) * cool * 0.7;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const force = (dist / k) * cool * edge.weight * 0.3;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });
    nodes.forEach((node) => {
      node.vx += (width / 2 - node.x) * 0.003;
      node.vy += (height / 2 - node.y) * 0.003;
      node.x = Math.max(38, Math.min(width - 38, node.x + node.vx * 0.25));
      node.y = Math.max(38, Math.min(height - 38, node.y + node.vy * 0.25));
      node.vx *= 0.84;
      node.vy *= 0.84;
    });
  }
}

function scoreViewBase(id, context, preset, config) {
  const profile = context.profile;
  const preference = context.viewPreferences[id] || 0;
  const presetBias = preset?.view_bias?.[id] || 1;
  const configBase = config.view_specs?.[id]?.base_weight || 1;

  let support = 0.4;
  if (id === "timeline") support = profile.flags.has_time_dimension ? 0.95 : 0;
  if (id === "map") support = profile.flags.has_space_dimension ? (profile.flags.has_geo_coordinates ? 0.95 : 0.8) : 0;
  if (id === "explorer") support = 0.95;
  if (id === "matrix") support = profile.flags.has_metric_dimension || context.relations.length ? 0.85 : 0.35;
  if (id === "flow") support = context.relations.some((relation) => relation.type === "influenced") ? 0.92 : 0.2;
  if (id === "constellation") support = context.relations.length ? 0.88 : 0.28;
  if (id === "clusters") support = context.entities.length > 2 ? 0.8 : 0.25;

  return support * configBase * presetBias + preference;
}

function renderConstellation(context, state) {
  const width = 900;
  const height = 480;
  const focus = state.focus;
  const nodeIds = new Set();
  if (focus) {
    nodeIds.add(focus);
    context.relations.forEach((relation) => {
      if (relation.source === focus || relation.target === focus) {
        nodeIds.add(relation.source);
        nodeIds.add(relation.target);
      }
    });
  } else {
    context.entities.forEach((entity) => nodeIds.add(entity.id));
  }

  const nodes = context.entities.filter((entity) => nodeIds.has(entity.id)).map((entity) => ({
    id: entity.id,
    name: entity.name,
    score: Object.keys(entity.metrics).length + context.relations.filter((relation) => relation.source === entity.id || relation.target === entity.id).length,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }));
  const edges = context.relations.filter((relation) => nodeIds.has(relation.source) && nodeIds.has(relation.target)).map((relation) => ({
    source: relation.source,
    target: relation.target,
    weight: relation.weight || 0.3,
    type: relation.type,
  }));
  forceLayout(nodes, edges, width, height);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const svg = [];
  svg.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Constellation view of ${nodes.length} entities and ${edges.length} relations">`);
  svg.push('<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--teal-500)" opacity="0.7"/></marker></defs>');
  edges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return;
    const cls = edge.type === "influenced" ? "edge-line edge-influenced" : edge.type === "shared-space" ? "edge-line edge-shared-space" : edge.type === "shared-domain" ? "edge-line edge-shared-domain" : "edge-line edge-shared-era";
    if (edge.type === "influenced") {
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      const nx = -(target.y - source.y) * 0.08;
      const ny = (target.x - source.x) * 0.08;
      svg.push(`<path class="${cls}" d="M${source.x},${source.y} Q${mx + nx},${my + ny} ${target.x},${target.y}" marker-end="url(#arrowhead)"/>`);
    } else {
      svg.push(`<line class="${cls}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"/>`);
    }
  });
  nodes.forEach((node) => {
    const radius = Math.min(18, 7 + node.score * 0.6);
    svg.push(`<g data-eid="${node.id}" data-name="${esc(node.name)}"><circle class="node-circle" cx="${node.x}" cy="${node.y}" r="${radius}" fill="var(--teal-500)" opacity="0.84"/><text class="node-label" x="${node.x}" y="${node.y + radius + 13}">${esc(node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name)}</text></g>`);
  });
  svg.push("</svg>");
  return svg.join("");
}

function renderTimeline(context) {
  const timeEntities = context.entities.filter((entity) => typeof entity.dimensions.time === "number");
  if (!timeEntities.length) {
    return '<div class="empty-state">No time-rich records were detected for timeline mode.</div>';
  }
  const width = 940;
  const lanes = {};
  timeEntities.forEach((entity) => {
    const lane = entity.dimensions.domain || context.primaryLens?.label || entity.type;
    lanes[lane] ||= [];
    lanes[lane].push(entity);
  });
  const laneNames = Object.keys(lanes);
  const height = Math.max(360, 120 + laneNames.length * 64);
  const pad = { l: 130, r: 32, t: 44, b: 30 };
  const years = timeEntities.map((entity) => entity.dimensions.time);
  const minYear = Math.floor(Math.min(...years) / 10) * 10;
  const maxYear = Math.ceil(Math.max(...years) / 10) * 10 + 10;
  const scale = (year) => pad.l + ((year - minYear) / (maxYear - minYear)) * (width - pad.l - pad.r);

  const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Timeline view of ${timeEntities.length} entities">`, '<defs><marker id="timelineArrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0, 7 2.5, 0 5" fill="var(--teal-500)" opacity="0.7"/></marker></defs>'];
  for (let decade = minYear; decade < maxYear; decade += 10) {
    const x = scale(decade);
    const w = scale(decade + 10) - x;
    svg.push(`<rect class="era-band" x="${x}" y="${pad.t}" width="${w}" height="${height - pad.t - pad.b}" fill="${(decade / 10) % 2 === 0 ? "var(--teal-500)" : "var(--amber-400)"}"/>`);
    svg.push(`<text class="era-label" x="${x + w / 2}" y="${pad.t - 10}">${decade}s</text>`);
  }

  laneNames.forEach((lane, index) => {
    const y = pad.t + index * ((height - pad.t - pad.b) / Math.max(laneNames.length, 1)) + 22;
    svg.push(`<text class="lane-label" x="${pad.l - 12}" y="${y + 4}">${esc(lane)}</text>`);
    svg.push(`<line x1="${pad.l}" y1="${y}" x2="${width - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`);
  });

  context.relations.filter((relation) => relation.type === "influenced").forEach((relation) => {
    const source = timeEntities.find((entity) => entity.id === relation.source);
    const target = timeEntities.find((entity) => entity.id === relation.target);
    if (!source || !target) return;
    const sourceLane = laneNames.indexOf(source.dimensions.domain || context.primaryLens?.label || source.type);
    const targetLane = laneNames.indexOf(target.dimensions.domain || context.primaryLens?.label || target.type);
    const laneHeight = (height - pad.t - pad.b) / Math.max(laneNames.length, 1);
    const x1 = scale(source.dimensions.time);
    const x2 = scale(target.dimensions.time);
    const y1 = pad.t + sourceLane * laneHeight + laneHeight / 2;
    const y2 = pad.t + targetLane * laneHeight + laneHeight / 2;
    svg.push(`<line class="timeline-connector" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#timelineArrow)"/>`);
  });

  const countBySlot = {};
  timeEntities.forEach((entity) => {
    const lane = entity.dimensions.domain || context.primaryLens?.label || entity.type;
    const laneIndex = laneNames.indexOf(lane);
    const laneHeight = (height - pad.t - pad.b) / Math.max(laneNames.length, 1);
    const x = scale(entity.dimensions.time);
    const key = `${Math.round(x / 12)}-${laneIndex}`;
    countBySlot[key] = (countBySlot[key] || 0) + 1;
    const jitter = (countBySlot[key] - 1) * 14 - 7;
    const y = pad.t + laneIndex * laneHeight + laneHeight / 2 + jitter;
    svg.push(`<g data-eid="${entity.id}" data-name="${esc(entity.name)}"><circle class="node-circle" cx="${x}" cy="${y}" r="8" fill="var(--amber-400)" opacity="0.9"/><text class="node-label" x="${x}" y="${y + 20}">${esc(entity.name.length > 14 ? `${entity.name.slice(0, 13)}…` : entity.name)}</text></g>`);
  });

  svg.push("</svg>");
  return svg.join("");
}

function renderClusters(context, state) {
  const clusters = computeClusters(context, state.clusterBy || context.clusterBy || "domain");
  const width = 860;
  const height = Math.max(420, clusters.length * 120);
  const cols = Math.ceil(Math.sqrt(clusters.length || 1));
  const cellW = (width - 60) / cols;
  const rows = Math.ceil(clusters.length / cols);
  const cellH = (height - 60) / Math.max(rows, 1);
  const svg = [`<svg viewBox="0 0 ${width} ${height}">`];
  clusters.forEach((cluster, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = 30 + col * cellW + cellW / 2;
    const cy = 30 + row * cellH + cellH / 2;
    const radius = Math.min(cellW, cellH) * 0.32;
    svg.push(`<circle class="cluster-boundary" cx="${cx}" cy="${cy}" r="${radius}" stroke="var(--teal-500)" fill="var(--teal-100)"/>`);
    svg.push(`<text class="cluster-label" x="${cx}" y="${cy - radius - 8}">${esc(cluster.label)} (${cluster.size})</text>`);
    cluster.entities.slice(0, 12).forEach((entityId, entityIndex) => {
      const entity = context.entities.find((item) => item.id === entityId);
      if (!entity) return;
      const angle = (2 * Math.PI * entityIndex) / Math.max(cluster.entities.length, 1);
      const ex = cx + Math.cos(angle) * radius * 0.64;
      const ey = cy + Math.sin(angle) * radius * 0.64;
      svg.push(`<g data-eid="${entity.id}" data-name="${esc(entity.name)}"><circle class="node-circle" cx="${ex}" cy="${ey}" r="9" fill="var(--emerald-500)" opacity="0.9"/>${cluster.entities.length <= 8 ? `<text class="node-label" x="${ex}" y="${ey + 18}">${esc(entity.name.length > 12 ? `${entity.name.slice(0, 11)}…` : entity.name)}</text>` : ""}</g>`);
    });
  });
  svg.push("</svg>");
  return svg.join("");
}

function renderExplorer(context, state) {
  const headers = context.profile.columns.slice(0, 12);
  let rows = [...context.records];
  if (state.tableFilter) {
    const q = state.tableFilter.toLowerCase();
    rows = rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(q)));
  }
  if (state.sortCol) {
    rows.sort((a, b) => {
      const left = a[state.sortCol];
      const right = b[state.sortCol];
      if (typeof left === "number" && typeof right === "number") return (left - right) * state.sortDir;
      return String(left || "").localeCompare(String(right || "")) * state.sortDir;
    });
  }
  const previewRows = rows.slice(0, 50);
  const arrow = (column) => state.sortCol === column ? (state.sortDir > 0 ? " ▲" : " ▼") : "";
  return `<input class="table-search" id="tableSearch" placeholder="Filter records..." value="${esc(state.tableFilter || "")}"><div style="max-height:420px;overflow:auto"><table class="data-table"><thead><tr>${headers.map((header) => `<th data-col="${esc(header)}">${esc(header)}${arrow(header)}</th>`).join("")}</tr></thead><tbody>${previewRows.map((row) => `<tr>${headers.map((header) => {
    const value = row[header];
    return `<td class="${typeof value === "number" ? "cell-num" : ""}">${esc(value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderMatrix(context) {
  const entities = context.entities.slice(0, 8);
  if (entities.length < 2) {
    return '<div class="empty-state">Matrix mode needs at least two entities.</div>';
  }
  const cellSize = 72;
  const pad = 140;
  const width = pad + entities.length * cellSize + 40;
  const height = pad + entities.length * cellSize + 40;
  const pairScore = (left, right) => {
    const relation = context.relations.find((item) => (item.source === left.id && item.target === right.id) || (item.source === right.id && item.target === left.id));
    let score = relation ? relation.weight : 0;
    if (left.dimensions.space && right.dimensions.space && String(left.dimensions.space).toLowerCase() === String(right.dimensions.space).toLowerCase()) score += 0.25;
    if (left.dimensions.domain && right.dimensions.domain && String(left.dimensions.domain).toLowerCase() === String(right.dimensions.domain).toLowerCase()) score += 0.3;
    return Math.min(1, score);
  };
  const svg = [`<svg viewBox="0 0 ${width} ${height}">`];
  entities.forEach((entity, index) => {
    const x = pad + index * cellSize + cellSize / 2;
    const y = pad - 22;
    svg.push(`<text class="node-label" x="${x}" y="${y}" transform="rotate(-25 ${x} ${y})">${esc(entity.name.length > 12 ? `${entity.name.slice(0, 11)}…` : entity.name)}</text>`);
    svg.push(`<text class="lane-label" x="${pad - 10}" y="${pad + index * cellSize + cellSize / 2 + 4}">${esc(entity.name.length > 14 ? `${entity.name.slice(0, 13)}…` : entity.name)}</text>`);
    entities.forEach((other, j) => {
      const score = pairScore(entity, other);
      const shade = Math.round(240 - score * 110);
      svg.push(`<rect x="${pad + j * cellSize}" y="${pad + index * cellSize}" width="${cellSize - 4}" height="${cellSize - 4}" rx="10" fill="rgb(${shade}, ${250 - score * 90}, ${248 - score * 40})" stroke="var(--border)"/>`);
      svg.push(`<text class="cluster-label" x="${pad + j * cellSize + (cellSize - 4) / 2}" y="${pad + index * cellSize + cellSize / 2 + 4}">${score.toFixed(2)}</text>`);
    });
  });
  svg.push("</svg>");
  return svg.join("");
}

function renderFlow(context) {
  const influences = context.relations.filter((relation) => relation.type === "influenced");
  if (!influences.length) {
    return '<div class="empty-state">Flow mode needs explicit influence links.</div>';
  }
  const incoming = new Set(influences.map((relation) => relation.target));
  const roots = unique(influences.map((relation) => relation.source)).filter((source) => !incoming.has(source));
  const layers = [];
  let frontier = roots.length ? roots : [influences[0].source];
  const seen = new Set();
  while (frontier.length) {
    layers.push(frontier);
    frontier.forEach((id) => seen.add(id));
    frontier = influences.filter((relation) => frontier.includes(relation.source)).map((relation) => relation.target).filter((id) => !seen.has(id));
  }
  const width = Math.max(780, layers.length * 220);
  const height = 420;
  const svg = [`<svg viewBox="0 0 ${width} ${height}">`, '<defs><marker id="flowArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--teal-500)"/></marker></defs>'];
  const positions = {};
  layers.forEach((layer, layerIndex) => {
    const x = 120 + layerIndex * 210;
    layer.forEach((id, index) => {
      const entity = context.entities.find((item) => item.id === id);
      if (!entity) return;
      const y = 90 + index * 110;
      positions[id] = { x, y };
      svg.push(`<rect x="${x - 70}" y="${y - 24}" width="140" height="48" rx="16" fill="var(--surface-raised)" stroke="var(--teal-200)"/>`);
      svg.push(`<text class="cluster-label" x="${x}" y="${y + 4}">${esc(entity.name.length > 18 ? `${entity.name.slice(0, 17)}…` : entity.name)}</text>`);
    });
  });
  influences.forEach((relation) => {
    const source = positions[relation.source];
    const target = positions[relation.target];
    if (!source || !target) return;
    svg.push(`<line x1="${source.x + 70}" y1="${source.y}" x2="${target.x - 70}" y2="${target.y}" stroke="var(--teal-500)" stroke-width="2.2" marker-end="url(#flowArrow)"/>`);
  });
  svg.push("</svg>");
  return svg.join("");
}

function unique(values) {
  return [...new Set(values)];
}

function renderMap(context) {
  const width = 900;
  const height = 460;
  const entities = context.entities.filter((entity) => entity.dimensions.space);
  if (!entities.length) {
    return '<div class="empty-state">Map mode needs place-based data.</div>';
  }
  const groups = {};
  entities.forEach((entity) => {
    const key = String(entity.dimensions.space);
    groups[key] ||= [];
    groups[key].push(entity);
  });
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const svg = [`<svg viewBox="0 0 ${width} ${height}">`, '<rect x="0" y="0" width="900" height="460" rx="20" fill="url(#mapBg)"/>', '<defs><linearGradient id="mapBg" x1="0" x2="1"><stop offset="0%" stop-color="#ecfeff"/><stop offset="100%" stop-color="#f8fafc"/></linearGradient></defs>'];
  const cols = Math.ceil(Math.sqrt(entries.length));
  const cellW = (width - 80) / Math.max(cols, 1);
  const rows = Math.ceil(entries.length / cols);
  const cellH = (height - 80) / Math.max(rows, 1);
  entries.forEach(([place, members], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = 40 + col * cellW + cellW / 2;
    const cy = 40 + row * cellH + cellH / 2;
    const radius = Math.max(20, Math.min(54, 18 + members.length * 6));
    svg.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="var(--teal-100)" stroke="var(--teal-500)" stroke-width="2"/>`);
    svg.push(`<text class="cluster-label" x="${cx}" y="${cy - 4}">${esc(place)}</text>`);
    svg.push(`<text class="node-label" x="${cx}" y="${cy + 14}">${members.length} records</text>`);
  });
  svg.push("</svg>");
  return svg.join("");
}

export const VIEW_SPECS = [
  { id: "constellation", label: "Constellation", render: renderConstellation },
  { id: "timeline", label: "Timeline", render: renderTimeline },
  { id: "clusters", label: "Clusters", render: renderClusters },
  { id: "explorer", label: "Explorer", render: renderExplorer },
  { id: "matrix", label: "Matrix", render: renderMatrix },
  { id: "flow", label: "Flow", render: renderFlow },
  { id: "map", label: "Map", render: renderMap },
];

export function rankViews(context, config, presetId) {
  const preset = config.presets?.[presetId] || {};
  return VIEW_SPECS.filter((spec) => config.view_specs?.[spec.id]?.enabled !== false)
    .map((spec) => ({
      id: spec.id,
      label: spec.label,
      score: Number(scoreViewBase(spec.id, context, preset, config).toFixed(3)),
    }))
    .filter((view) => view.score >= (config.defaults?.view_rank_floor || 0.2))
    .sort((a, b) => b.score - a.score);
}

export function renderView(viewId, context, state) {
  const spec = VIEW_SPECS.find((item) => item.id === viewId) || VIEW_SPECS[0];
  return spec.render(context, state);
}
