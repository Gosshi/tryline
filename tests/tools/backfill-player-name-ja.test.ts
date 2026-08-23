import { describe, expect, it, vi } from "vitest";

import { MODELS } from "@/lib/llm/models";
import {
  buildPlayerNameJaPrompt,
  parseGeneratedPlayerNames,
  parseOptions,
  runPlayerNameJaBackfill,
} from "@/tools/backfill-player-name-ja";

function createDb(
  rows: Array<{ id: string; name: string; name_ja: string | null }>,
) {
  const update = vi.fn();
  const updateOr = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockReturnValue({ or: updateOr });
  update.mockReturnValue({ eq: updateEq });
  const limit = vi.fn().mockResolvedValue({
    data: rows.map((row) => ({
      ...row,
      team: { country: "South Africa" },
    })),
    error: null,
  });
  const order = vi.fn().mockReturnValue({ limit });
  const or = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ or });

  return {
    db: { from: vi.fn().mockReturnValue({ select, update }) },
    limit,
    or,
    update,
    updateOr,
  };
}

describe("backfill-player-name-ja", () => {
  it("defaults to a 20-player trial and only applies after Owner confirmation", () => {
    expect(parseOptions([])).toEqual({ apply: false, limit: 20 });
    expect(parseOptions(["--limit=7"])).toEqual({ apply: false, limit: 7 });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      apply: true,
      limit: 20,
    });
    expect(() => parseOptions(["--limit=0"])).toThrow("Usage:");
  });

  it("asks MODELS.FAST-guided generation to use rugby language backgrounds", () => {
    const prompt = buildPlayerNameJaPrompt([
      {
        country: "South Africa",
        id: "louw",
        name: "Wilco Louw",
        name_ja: null,
      },
      {
        country: "South Africa",
        id: "de-villiers",
        name: "Paul de Villiers",
        name_ja: null,
      },
      {
        country: "South Africa",
        id: "nortje",
        name: "Ruan Nortjé",
        name_ja: null,
      },
    ]);

    expect(MODELS.FAST).toBeTruthy();
    expect(prompt).toContain("アフリカーンス語・マオリ語・パシフィカ系");
    expect(prompt).toContain("Wilco Louw は「ラウ」");
    expect(prompt).toContain("Paul de Villiers は「デ・ヴィリアーズ」");
    expect(prompt).toContain("Ruan Nortjé は「ノルチェ」");
    expect(prompt).toContain('"country":"South Africa"');
  });

  it("keeps trial output deterministic for the selected candidates and does not write by default", async () => {
    const { db, update } = createDb([
      { id: "louw", name: "Wilco Louw", name_ja: null },
      { id: "de-villiers", name: "Paul de Villiers", name_ja: null },
      { id: "nortje", name: "Ruan Nortjé", name_ja: null },
    ]);
    const generate = vi.fn().mockResolvedValue({
      model: MODELS.FAST,
      names: [
        { name_ja: "ラウ", player_id: "louw" },
        { name_ja: "デ・ヴィリアーズ", player_id: "de-villiers" },
        { name_ja: "ノルチェ", player_id: "nortje" },
      ],
      usage: { inputTokens: 100, outputTokens: 30 },
    });

    const result = await runPlayerNameJaBackfill(
      { apply: false, limit: 20 },
      { db: db as never, generate },
    );

    expect(result.applied).toBe(false);
    expect(result.generated).toEqual([
      { name_ja: "ラウ", player_id: "louw" },
      { name_ja: "デ・ヴィリアーズ", player_id: "de-villiers" },
      { name_ja: "ノルチェ", player_id: "nortje" },
    ]);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30 });
    expect(update).not.toHaveBeenCalled();
  });

  it("only updates candidates with an empty value, preserving existing Japanese names", async () => {
    const { db, update, updateOr } = createDb([
      { id: "missing", name: "Wilco Louw", name_ja: null },
    ]);

    await runPlayerNameJaBackfill(
      { apply: true, limit: 1 },
      {
        db: db as never,
        generate: async () => ({
          model: MODELS.FAST,
          names: [{ name_ja: "ラウ", player_id: "missing" }],
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      },
    );

    expect(update).toHaveBeenCalledWith({ name_ja: "ラウ" });
    expect(updateOr).toHaveBeenCalledWith("name_ja.is.null,name_ja.eq.");
  });

  it("rejects incomplete or unknown model output instead of persisting it", () => {
    const candidates = [
      {
        country: "South Africa",
        id: "louw",
        name: "Wilco Louw",
        name_ja: null,
      },
      {
        country: "South Africa",
        id: "nortje",
        name: "Ruan Nortjé",
        name_ja: null,
      },
    ];

    expect(() =>
      parseGeneratedPlayerNames(
        JSON.stringify({ names: [{ player_id: "louw", name_ja: "ラウ" }] }),
        candidates,
      ),
    ).toThrow("did not return every requested player");
  });
});
