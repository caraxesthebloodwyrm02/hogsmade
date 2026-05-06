import type {
  AssetMeta,
  BridgeBlock,
  BridgeState,
  SemanticSearchResult,
} from "../../bridge/schema";

const STOP_WORDS = new Set([
  "a", "an", "and", "for", "in", "is", "of", "on", "or", "the", "to", "with",
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

// Inverted index: term -> { docId -> term frequency in that doc }
type PostingList = Map<string, number>;
type InvertedIndex = Map<string, PostingList>;

let currentIndex: InvertedIndex = new Map();
let currentDocs: Map<string, SearchDocument> = new Map();
let totalDocCount = 0;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

function clearCurrentIndex(): void {
  currentIndex = new Map();
  currentDocs = new Map();
  totalDocCount = 0;
}

function addTermToIndex(term: string, docId: string): void {
  if (!currentIndex.has(term)) {
    currentIndex.set(term, new Map());
  }
  const postings = currentIndex.get(term)!;
  postings.set(docId, (postings.get(docId) || 0) + 1);
}

function indexDocument(doc: SearchDocument): void {
  currentDocs.set(doc.id, doc);
  totalDocCount++;

  const allTerms = new Set([
    ...doc.titleTerms,
    ...doc.keywordTerms,
    ...doc.contentTerms,
  ]);

  for (const term of allTerms) {
    let count = 0;
    if (doc.titleTerms.has(term)) count += 3; // title weight
    if (doc.keywordTerms.has(term)) count += 2; // keyword weight
    if (doc.contentTerms.has(term)) count += 1; // content weight

    if (!currentIndex.has(term)) {
      currentIndex.set(term, new Map());
    }
    currentIndex.get(term)!.set(doc.id, count);
  }
}

// Term Frequency: raw count of term in document
function tf(term: string, docId: string): number {
  return currentIndex.get(term)?.get(docId) ?? 0;
}

// Inverse Document Frequency: log(totalDocs / docsWithTerm)
function idf(term: string): number {
  const postings = currentIndex.get(term);
  if (!postings || postings.size === 0) return 0;
  return Math.log(totalDocCount / postings.size);
}

// TF-IDF score for a term in a document
function tfidfScore(term: string, docId: string): number {
  const t = tf(term, docId);
  const i = idf(term);
  return t * i;
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

function scoreDocumentTFIDF(
  terms: string[],
  doc: SearchDocument,
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    const termScore = tfidfScore(term, doc.id);
    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  // Bonus for multi-term matches (relevance signal)
  if (matchedTerms.length > 1) score += matchedTerms.length * 0.5;
  // Blocks get slight boost (more likely to be current workspace artifacts)
  if (doc.source === "block") score += 0.2;

  return { score, matchedTerms };
}

function rebuildIndex(
  bridgeState: BridgeState | null,
  inventoryAssets: InventoryAssetRecord[],
): void {
  clearCurrentIndex();

  for (const block of bridgeState?.blocks ?? []) {
    indexDocument(createBlockDocument(block));
  }
  for (const asset of inventoryAssets) {
    indexDocument(createAssetDocument(asset));
  }
}

export function rebuildIndexDebounced(
  bridgeState: BridgeState | null,
  inventoryAssets: InventoryAssetRecord[],
): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  // Build immediately on first call, debounce subsequent
  if (totalDocCount === 0) {
    rebuildIndex(bridgeState, inventoryAssets);
  }
  rebuildTimer = setTimeout(() => {
    rebuildIndex(bridgeState, inventoryAssets);
    rebuildTimer = null;
  }, 2000);
}

export function searchLocalSemantic(
  query: string,
  bridgeState: BridgeState | null,
  inventoryAssets: InventoryAssetRecord[],
  limit = 8,
): SemanticSearchResult[] {
  const terms = expandSearchTerms(query);
  if (terms.length === 0) return [];

  // Rebuild index on every search if no prior build or stale
  if (totalDocCount === 0) {
    rebuildIndex(bridgeState, inventoryAssets);
  }

  const scored: Array<{ doc: SearchDocument; score: number; matchedTerms: string[] }> = [];

  for (const doc of currentDocs.values()) {
    const { score, matchedTerms } = scoreDocumentTFIDF(terms, doc);
    if (score > 0) {
      scored.push({ doc, score, matchedTerms });
    }
  }

  return scored
    .sort((left, right) => right.score - left.score || left.doc.title.localeCompare(right.doc.title))
    .slice(0, limit)
    .map(({ doc, score, matchedTerms }) => ({
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
    }));
}
