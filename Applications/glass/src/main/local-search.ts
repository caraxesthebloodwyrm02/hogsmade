import type {
  AssetMeta,
  BridgeBlock,
  BridgeState,
  SemanticSearchResult,
} from "../../bridge/schema";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const TERM_SYNONYMS: Record<string, string[]> = {
  auth: ["login", "token", "credential", "session"],
  bug: ["error", "failure", "issue", "regression"],
  ceremony: ["threshold", "voice", "elevated"],
  note: ["memo", "text", "annotation"],
  search: ["find", "lookup", "query", "similarity"],
};

interface SearchDocument {
  id: string;
  source: "block" | "asset";
  title: string;
  snippetSource: string;
  titleTerms: Set<string>;
  keywordTerms: Set<string>;
  contentTerms: Set<string>;
  blockType?: BridgeBlock["type"];
  language?: string;
  position?: BridgeBlock["position"];
  asset?: AssetMeta;
}

function normalizeToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (normalized.length > 4 && normalized.endsWith("ing")) {
    return normalized.slice(0, -3);
  }
  if (normalized.length > 3 && normalized.endsWith("ed")) {
    return normalized.slice(0, -2);
  }
  if (normalized.length > 3 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function tokenizeSearchText(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function expandSearchTerms(query: string): string[] {
  const expanded = new Set<string>();
  for (const token of tokenizeSearchText(query)) {
    expanded.add(token);
    for (const synonym of TERM_SYNONYMS[token] ?? []) {
      expanded.add(synonym);
    }
  }
  return [...expanded];
}

function toTermSet(parts: Array<string | undefined>): Set<string> {
  return new Set(parts.flatMap((part) => tokenizeSearchText(part ?? "")));
}

function createBlockDocument(block: BridgeBlock): SearchDocument {
  return {
    id: block.id,
    source: "block",
    title: `${block.type.toUpperCase()} ${block.language}`,
    snippetSource: block.content,
    titleTerms: toTermSet([block.type, block.language]),
    keywordTerms: toTermSet([block.origin]),
    contentTerms: toTermSet([block.content]),
    blockType: block.type,
    language: block.language,
    position: block.position,
    asset: block.asset,
  };
}

interface InventoryAssetRecord {
  ledger_id?: unknown;
  category?: unknown;
  rarity?: unknown;
  label?: unknown;
  glyph?: unknown;
  content?: unknown;
  source_ceremony?: unknown;
  source_session?: unknown;
  acquired_at?: unknown;
  created_at?: unknown;
}

function normalizeAsset(record: InventoryAssetRecord): {
  id: string;
  asset: AssetMeta;
  content: string;
} {
  const acquiredAt =
    typeof record.acquired_at === "string"
      ? record.acquired_at
      : typeof record.created_at === "string"
        ? record.created_at
        : new Date(0).toISOString();
  return {
    id:
      typeof record.ledger_id === "string"
        ? record.ledger_id
        : `asset:${String(record.label ?? "untitled")}`,
    asset: {
      category:
        typeof record.category === "string"
          ? (record.category as AssetMeta["category"])
          : "fragment",
      rarity: typeof record.rarity === "string" ? (record.rarity as AssetMeta["rarity"]) : "common",
      label: typeof record.label === "string" ? record.label : "Untitled Asset",
      glyph: typeof record.glyph === "string" ? record.glyph : undefined,
      acquired_at: acquiredAt,
      source_ceremony:
        typeof record.source_ceremony === "string"
          ? (record.source_ceremony as AssetMeta["source_ceremony"])
          : "ground",
      source_session: typeof record.source_session === "string" ? record.source_session : "",
      ledger_id: typeof record.ledger_id === "string" ? record.ledger_id : undefined,
    },
    content: typeof record.content === "string" ? record.content : "",
  };
}

function createAssetDocument(record: InventoryAssetRecord): SearchDocument {
  const normalized = normalizeAsset(record);
  return {
    id: normalized.id,
    source: "asset",
    title: normalized.asset.label,
    snippetSource: normalized.content,
    titleTerms: toTermSet([normalized.asset.label, normalized.asset.glyph]),
    keywordTerms: toTermSet([
      normalized.asset.category,
      normalized.asset.rarity,
      normalized.asset.source_ceremony,
      normalized.asset.source_session,
    ]),
    contentTerms: toTermSet([normalized.content]),
    asset: normalized.asset,
  };
}

function buildSnippet(source: string, matchedTerms: string[]): string {
  const compact = source.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  const hit = matchedTerms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .find((index) => index >= 0);
  if (hit === undefined) {
    return compact.slice(0, 160);
  }
  const start = Math.max(0, hit - 48);
  const end = Math.min(compact.length, hit + 112);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compact.length ? "..." : "";
  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

function scoreDocument(
  terms: string[],
  doc: SearchDocument,
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    let termScore = 0;
    if (doc.titleTerms.has(term)) termScore += 5;
    if (doc.keywordTerms.has(term)) termScore += 2;
    if (doc.contentTerms.has(term)) termScore += 1;
    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  if (matchedTerms.length > 1) score += matchedTerms.length;
  if (doc.source === "block") score += 5;

  return { score, matchedTerms };
}

export function searchLocalSemantic(
  query: string,
  bridgeState: BridgeState | null,
  inventoryAssets: InventoryAssetRecord[],
  limit = 8,
): SemanticSearchResult[] {
  const terms = expandSearchTerms(query);
  if (terms.length === 0) return [];

  const documents: SearchDocument[] = [];
  for (const block of bridgeState?.blocks ?? []) {
    documents.push(createBlockDocument(block));
  }
  for (const asset of inventoryAssets) {
    documents.push(createAssetDocument(asset));
  }

  return documents
    .map((doc) => {
      const { score, matchedTerms } = scoreDocument(terms, doc);
      return {
        id: doc.id,
        source: doc.source,
        title: doc.title,
        snippet: buildSnippet(doc.snippetSource, matchedTerms),
        score,
        matchedTerms,
        blockType: doc.blockType,
        language: doc.language,
        position: doc.position,
        asset: doc.asset,
      } satisfies SemanticSearchResult;
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);
}
