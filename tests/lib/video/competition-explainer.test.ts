import { describe, expect, it } from "vitest";

import { MODELS } from "@/lib/llm/models";
import {
  buildCompetitionExplainerFacts,
  buildCompetitionExplainerPrompt,
  buildExplainerSlides,
  estimateExplainerCost,
  renderExplainerSlideHtml,
  validateExplainerData,
  validateExplainerScript,
} from "@/lib/video/competition-explainer";

import type { CompetitionExplainerData } from "@/lib/video/competition-explainer";

const sampleData: CompetitionExplainerData = {
  competition: {
    endDate: "2026-07-25",
    family: "nations-championship",
    id: "competition-1",
    name: "Nations Championship",
    nameJa: "ネーションズチャンピオンシップ",
    season: "2026",
    slug: "nations-championship-2026",
    startDate: "2026-07-04",
  },
  matches: [
    {
      awayScore: 17,
      awayTeam: {
        name: "England",
        nameJa: "イングランド",
        shortCode: "ENG",
        slug: "england",
      },
      homeScore: 24,
      homeTeam: {
        name: "Japan",
        nameJa: "日本",
        shortCode: "JPN",
        slug: "japan",
      },
      id: "match-1",
      kickoffAt: "2026-07-04T10:00:00.000Z",
      status: "finished",
      venue: "Tokyo",
    },
    {
      awayScore: null,
      awayTeam: {
        name: "South Africa",
        nameJa: "南アフリカ",
        shortCode: "RSA",
        slug: "south-africa",
      },
      homeScore: null,
      homeTeam: {
        name: "Ireland",
        nameJa: "アイルランド",
        shortCode: "IRE",
        slug: "ireland",
      },
      id: "match-2",
      kickoffAt: "2026-07-11T10:00:00.000Z",
      status: "scheduled",
      venue: "Dublin",
    },
  ],
};

describe("competition explainer video helpers", () => {
  it("adds a centralized TTS model id", () => {
    expect(MODELS.TTS).toBe("tts-1");
  });

  it("builds grounded facts and prompt from competition data", () => {
    const facts = buildCompetitionExplainerFacts(sampleData);
    const prompt = buildCompetitionExplainerPrompt(facts);

    expect(facts.competitionTitle).toBe("ネーションズチャンピオンシップ 2026");
    expect(facts.matchCount).toBe(2);
    expect(facts.teamCount).toBe(4);
    expect(facts.recentResults).toEqual(["日本 24-17 イングランド"]);
    expect(facts.upcomingMatches[0]).toContain("アイルランド vs 南アフリカ");
    expect(prompt).toContain("DB実測データ");
    expect(prompt).toContain("最大320字以内");
    expect(prompt).toContain("DB実測データにないチーム名");
  });

  it("rejects empty competition datasets before generation", () => {
    expect(() =>
      validateExplainerData({
        competition: sampleData.competition,
        matches: [],
      }),
    ).toThrow("No matches found");
  });

  it("rejects unsupported scorelines in the generated script", () => {
    expect(() =>
      validateExplainerScript(
        "ネーションズチャンピオンシップは日本が52-8で勝った流れを押さえる大会です。",
        sampleData,
      ),
    ).toThrow("unsupported score");
  });

  it("allows scorelines that exist in DB-backed match facts", () => {
    expect(
      validateExplainerScript(
        "ネーションズチャンピオンシップ2026は、登録2試合の短期大会です。日本 24-17 イングランドの結果と、アイルランド対南アフリカの今後のカードを押さえるだけで全体像が見えます。",
        sampleData,
      ),
    ).toContain("24-17");
  });

  it("renders vertical slide HTML with Japanese-safe font fallbacks", () => {
    const [slide] = buildExplainerSlides(
      buildCompetitionExplainerFacts(sampleData),
    );
    expect(slide).toBeDefined();

    const html = renderExplainerSlideHtml(slide!);

    expect(html).toContain("width: 1080px");
    expect(html).toContain("height: 1920px");
    expect(html).toContain("Hiragino Maru Gothic ProN");
    expect(html).toContain("Tryline Rugby");
  });

  it("estimates generation cost below the PoC threshold for small scripts", () => {
    const cost = estimateExplainerCost({
      inputTokens: 800,
      outputTokens: 160,
      ttsCharacters: 260,
    });

    expect(cost.totalUsd).toBeLessThan(0.05);
    expect(cost.ttsUsd).toBeCloseTo(0.0039);
  });
});
