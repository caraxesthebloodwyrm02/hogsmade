/**
 * Record parsing utilities for the Glimpse engine.
 * Handles JSON and CSV input formats.
 */

import { normalizeScalar } from "./utils.js";

export function normalizeRecords(raw, type = "json") {
  if (type === "csv") return Array.isArray(raw) ? raw : raw?.rows || [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "object") return value;
    }
    return [raw];
  }
  return [];
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalizeScalar((cells[index] || "").trim());
    });
    return record;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
