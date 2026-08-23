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

  it("keeps the foreign-player generation prompt unchanged", () => {
    const players = [
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
    ];
    const prompt = buildPlayerNameJaPrompt(players);

    expect(MODELS.FAST).toBeTruthy();
    expect(prompt).toBe(
      [
        "あなたは日本語ラグビーメディアの編集者です。各選手の安定した日本語表記を決めてください。",
        "英語読みだけで機械的にカタカナ化せず、所属チームの国からアフリカーンス語・マオリ語・パシフィカ系などの言語背景を考慮すること。",
        "例: Wilco Louw は「ラウ」、Paul de Villiers は「デ・ヴィリアーズ」、Ruan Nortjé は「ノルチェ」。",
        "既存の表記を変える処理ではない。渡された player_id ごとに1つだけ日本語表記を返すこと。",
        `入力: ${JSON.stringify(players.map(({ country, id, name }) => ({ country, id, name })))} `,
        'JSONのみで返答: {"names":[{"player_id":"...","name_ja":"..."}]}',
      ].join("\n\n"),
    );
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

  it("excludes candidates whose existing name already contains Japanese characters", async () => {
    const { db } = createDb([
      { id: "roman", name: "Romain Taofifénua", name_ja: null },
      { id: "katakana", name: "ハニテリ・ヴァイレア", name_ja: null },
      { id: "kanji", name: "安江祥光", name_ja: null },
    ]);
    const generate = vi.fn().mockResolvedValue({
      model: MODELS.FAST,
      names: [{ name_ja: "ロマン・タオフィフェヌア", player_id: "roman" }],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await runPlayerNameJaBackfill(
      { apply: false, limit: 20 },
      { db: db as never, generate },
    );

    expect(generate).toHaveBeenCalledWith([
      expect.objectContaining({ id: "roman" }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player_id: "katakana",
          reason: "name_contains_japanese",
        }),
        expect.objectContaining({
          player_id: "kanji",
          reason: "name_contains_japanese",
        }),
      ]),
    );
    expect(result.skipSummary).toEqual({
      name_contains_japanese: 2,
      non_katakana_output: 0,
    });
  });

  it("skips Han and hiragana generated output but retains katakana with middle dots and long vowels", () => {
    const candidates = [
      { country: null, id: "yasue", name: "Yoshimitsu Yasue", name_ja: null },
      { country: null, id: "valu", name: "AsaeliAi Valu", name_ja: null },
      {
        country: null,
        id: "taofifenua",
        name: "Romain Taofifénua",
        name_ja: null,
      },
      {
        country: null,
        id: "atissogbe",
        name: "Théo Attissogbé",
        name_ja: null,
      },
    ];

    const result = parseGeneratedPlayerNames(
      JSON.stringify({
        names: [
          { player_id: "yasue", name_ja: "安江祥光" },
          { player_id: "valu", name_ja: "アサエリ愛・ヴァル" },
          { player_id: "taofifenua", name_ja: "ロマン・タオフィフェヌア" },
          { player_id: "atissogbe", name_ja: "テオ・アティソグベ" },
        ],
      }),
      candidates,
    );

    expect(result.names).toEqual([
      { name_ja: "ロマン・タオフィフェヌア", player_id: "taofifenua" },
      { name_ja: "テオ・アティソグベ", player_id: "atissogbe" },
    ]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        player_id: "yasue",
        reason: "non_katakana_output",
      }),
      expect.objectContaining({
        player_id: "valu",
        reason: "non_katakana_output",
      }),
    ]);
  });

  it("does not update players whose generated names are skipped", async () => {
    const { db, update } = createDb([
      { id: "yasue", name: "Yoshimitsu Yasue", name_ja: null },
      { id: "valu", name: "AsaeliAi Valu", name_ja: null },
    ]);

    const result = await runPlayerNameJaBackfill(
      { apply: true, limit: 20 },
      {
        db: db as never,
        generate: async () => ({
          model: MODELS.FAST,
          names: [],
          skipped: [
            {
              name_ja: "安江祥光",
              player_id: "yasue",
              reason: "non_katakana_output",
            },
            {
              name_ja: "アサエリ愛・ヴァル",
              player_id: "valu",
              reason: "non_katakana_output",
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      },
    );

    expect(result.generated).toEqual([]);
    expect(result.skipSummary.non_katakana_output).toBe(2);
    expect(update).not.toHaveBeenCalled();
  });
});
