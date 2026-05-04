import { describe, expect, it } from "vitest";
import { searchLocalSemantic, tokenizeSearchText } from "./local-search";

const bridgeState = {
  timestamp: "2026-05-04T00:00:00.000Z",
  session_id: "session-1",
  agent_state: "idle",
  threshold_state: "ground",
  progress: 0,
  voices: [],
  conversation: [],
  signals: {
    git_diff_lines: 0,
    iteration_count: 0,
    session_age_minutes: 0,
  },
  blocks: [
    {
      id: "block-auth",
      type: "code",
      language: "typescript",
      content: "export async function loginWithSessionToken() { throw new Error('auth failed'); }",
      position: { x: 10, y: 20 },
      origin: "agent",
    },
    {
      id: "block-note",
      type: "note",
      language: "markdown",
      content: "Ceremony threshold notes for the elevated voice sequence.",
      position: { x: 50, y: 60 },
      origin: "user",
    },
  ],
} as const;

describe("local semantic search", () => {
  it("tokenizes camelCase words and drops stop words", () => {
    expect(tokenizeSearchText("Searching the loginWithSessionTokens")).toEqual([
      "search",
      "login",
      "session",
      "token",
    ]);
  });

  it("ranks block matches using expanded auth terms", () => {
    const results = searchLocalSemantic("auth", bridgeState as any, [], 5);

    expect(results[0]).toMatchObject({
      id: "block-auth",
      source: "block",
      blockType: "code",
      language: "typescript",
    });
    expect(results[0].matchedTerms).toEqual(expect.arrayContaining(["auth", "session", "token"]));
  });

  it("searches inventory assets when no bridge state is available", () => {
    const results = searchLocalSemantic(
      "ceremony relic",
      null,
      [
        {
          ledger_id: "asset-1",
          label: "Ceremony Relic",
          category: "relic",
          rarity: "mythic",
          content: "Minted after the elevated threshold ceremony completed.",
          source_ceremony: "elevated",
          source_session: "session-1",
          acquired_at: "2026-05-04T12:00:00.000Z",
        },
      ] as any,
      5,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "asset-1", source: "asset", title: "Ceremony Relic" });
  });

  it("returns no results for an empty query", () => {
    expect(searchLocalSemantic("   ", bridgeState as any, [], 5)).toEqual([]);
  });
});
