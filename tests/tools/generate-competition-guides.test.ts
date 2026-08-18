import { describe, expect, it, vi } from "vitest";

import {
  FAMILIES,
  generateCompetitionGuides,
  getOutputPath,
  resolveTargetFamilies,
} from "@/tools/generate-competition-guides";

function createClients() {
  const exa = {
    searchAndContents: vi.fn().mockResolvedValue({ results: [] }),
  };
  const openai = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "ガイド" } }],
        }),
      },
    },
  };

  return { exa, openai };
}

describe("generate-competition-guides", () => {
  it("defines greatest-rivalry with the confirmed tour context", () => {
    const greatestRivalry = FAMILIES.find(
      (family) => family.family === "greatest-rivalry",
    );

    expect(greatestRivalry).toMatchObject({
      family: "greatest-rivalry",
      nameJa: "グレイテスト・ライバルリー・ツアー",
    });
    expect(greatestRivalry?.context).toContain(
      "南アフリカ代表とのテストマッチ4戦",
    );
    expect(greatestRivalry?.context).toContain(
      "フランチャイズとのツアー戦4戦",
    );
    expect(greatestRivalry?.context).toContain("M&T Bank Stadium");
    expect(greatestRivalry?.context).toContain("J SPORTS");
    expect(greatestRivalry?.context).toContain(
      "ツアーの歴史ではなく両国の対戦史を扱う",
    );
  });

  it("uses every family and the existing all-families output path without arguments", async () => {
    const { exa, openai } = createClients();
    const generate = vi.fn().mockResolvedValue("ガイド");
    const writeFile = vi.fn();

    await generateCompetitionGuides({
      client: openai as never,
      cwd: "/tmp/tryline",
      exa: exa as never,
      familyNames: [],
      generate,
      logger: { log: vi.fn() },
      mkdir: vi.fn() as never,
      writeFile: writeFile as never,
    });

    expect(generate).toHaveBeenCalledTimes(FAMILIES.length);
    expect(generate.mock.calls.map((call) => call[2])).toEqual(
      FAMILIES.map((family) => family.family),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/tryline/supabase/seeds/competition-guides.sql",
      expect.any(String),
      "utf-8",
    );
  });

  it("generates only greatest-rivalry and keeps the all-families SQL file untouched", async () => {
    const { exa, openai } = createClients();
    const writeFile = vi.fn();

    await generateCompetitionGuides({
      client: openai as never,
      cwd: "/tmp/tryline",
      exa: exa as never,
      familyNames: ["greatest-rivalry"],
      logger: { log: vi.fn() },
      mkdir: vi.fn() as never,
      writeFile: writeFile as never,
    });

    expect(exa.searchAndContents).toHaveBeenCalledTimes(1);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/tryline/supabase/seeds/competition-guides-greatest-rivalry.sql",
      expect.stringContaining("'greatest-rivalry'"),
      "utf-8",
    );
    expect(writeFile).not.toHaveBeenCalledWith(
      "/tmp/tryline/supabase/seeds/competition-guides.sql",
      expect.anything(),
      expect.anything(),
    );
  });

  it("fails before generation for an unknown family", async () => {
    const { exa, openai } = createClients();
    const writeFile = vi.fn();

    await expect(
      generateCompetitionGuides({
        client: openai as never,
        exa: exa as never,
        familyNames: ["not-a-family"],
        logger: { log: vi.fn() },
        mkdir: vi.fn() as never,
        writeFile: writeFile as never,
      }),
    ).rejects.toThrow("Unknown competition family: not-a-family");

    expect(exa.searchAndContents).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("allows multiple known families and gives them a separate output file", () => {
    expect(resolveTargetFamilies(["greatest-rivalry", "six-nations"])).toEqual([
      expect.objectContaining({ family: "greatest-rivalry" }),
      expect.objectContaining({ family: "six-nations" }),
    ]);
    expect(
      getOutputPath({
        cwd: "/tmp/tryline",
        familyNames: ["greatest-rivalry", "six-nations"],
      }),
    ).toBe(
      "/tmp/tryline/supabase/seeds/competition-guides-greatest-rivalry-six-nations.sql",
    );
  });
});
