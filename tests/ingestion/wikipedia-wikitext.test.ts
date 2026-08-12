import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import { parseScoreText } from "@/lib/ingestion/sources/live-source-utils";
import {
  fetchPremiership,
  parsePremiershipLiveWikitext,
} from "@/lib/ingestion/sources/wikipedia-premiership";
import {
  fetchWikipediaWikitext,
  normalizeWikitextTeam,
  parseWikitextTemplates,
  stripWikitextMarkup,
} from "@/lib/ingestion/sources/wikipedia-wikitext";
import { FetchError } from "@/lib/scrapers/errors";

const PREMIERSHIP_RUGBYBOX = `{{Rugbybox
|id = Northampton v Leicester
|date = [[East Midlands Derby (rugby union)|11 October 2025]]
|time = 15:05
|home = (1 BP) [[Northampton Saints]]
|score = 32–26
|away = [[Leicester Tigers]] (1 BP)
}}`;

const SIX_NATIONS_RUGBYBOX = `{{rugbybox
|date = 5 February 2026
|time = 21:10 [[Central European Time|CET]]
|team1 = (1 BP) {{ru-rt|FRA}}
|score = 36–14
|team2 = {{ru|IRE}}
|stadium = [[Stade de France]], [[Saint-Denis, Seine-Saint-Denis|Saint-Denis]]
}}`;

const URC_TEAM_VALUES = `{{rugbybox
|team1 = (1 BP) [[Stormers]] {{flagicon|RSA}}
|team2 = {{flagicon|IRE|rugby union}} [[Leinster Rugby|Leinster]]
}}`;

const PREMIERSHIP_PLAYOFF_TEAM_VALUES = `{{Rugbybox
|home = [[Northampton Saints]] (1)
|away = (4) [[Leicester Tigers]]
}}`;

function rawResponse(wikitext: string) {
  return new Response(wikitext, {
    headers: { "Content-Type": "text/x-wiki" },
  });
}

describe("Wikipedia wikitext ingestion", () => {
  beforeEach(() => {
    fetcherMock.fetchWithPolicy.mockReset();
  });

  it("parses the real Premiership home and away rugbybox form", () => {
    const matches = parsePremiershipLiveWikitext(PREMIERSHIP_RUGBYBOX);

    expect(matches).toEqual([
      expect.objectContaining({
        awayScore: 26,
        awayTeamName: "Leicester Tigers",
        awayTeamSlug: "leicester-tigers",
        homeScore: 32,
        homeTeamName: "Northampton Saints",
        homeTeamSlug: "northampton-saints",
        kickoffAt: "2025-10-11T14:05:00.000Z",
        status: "finished",
      }),
    ]);
  });

  it("accepts the team1 and team2 alias form used by Six Nations", () => {
    const [rugbybox] = parseWikitextTemplates(SIX_NATIONS_RUGBYBOX, "rugbybox");

    expect(normalizeWikitextTeam(rugbybox?.params.team1 ?? "")).toBe("FRA");
    expect(normalizeWikitextTeam(rugbybox?.params.team2 ?? "")).toBe("IRE");
  });

  it("finds Rugbybox templates without case sensitivity", () => {
    expect(
      parseWikitextTemplates(
        `${PREMIERSHIP_RUGBYBOX}\n${SIX_NATIONS_RUGBYBOX}`,
        "rugbybox",
      ),
    ).toHaveLength(2);
  });

  it("uses link display text instead of its target", () => {
    expect(stripWikitextMarkup("[[Saracens F.C.|Saracens]]")).toBe(
      "Saracens",
    );
  });

  it("keeps a linked team when a flagicon template is also present", () => {
    const [rugbybox] = parseWikitextTemplates(URC_TEAM_VALUES, "rugbybox");

    expect(normalizeWikitextTeam(rugbybox?.params.team1 ?? "")).toBe(
      "Stormers",
    );
    expect(normalizeWikitextTeam(rugbybox?.params.team2 ?? "")).toBe(
      "Leinster",
    );
  });

  it("removes bonus points on both sides of the linked team", () => {
    const [rugbybox] = parseWikitextTemplates(PREMIERSHIP_RUGBYBOX, "rugbybox");

    expect(normalizeWikitextTeam(rugbybox?.params.home ?? "")).toBe(
      "Northampton Saints",
    );
    expect(normalizeWikitextTeam(rugbybox?.params.away ?? "")).toBe(
      "Leicester Tigers",
    );
  });

  it("removes real Premiership play-off seeding on either side of a team", () => {
    const [rugbybox] = parseWikitextTemplates(
      PREMIERSHIP_PLAYOFF_TEAM_VALUES,
      "rugbybox",
    );

    expect(normalizeWikitextTeam(rugbybox?.params.home ?? "")).toBe(
      "Northampton Saints",
    );
    expect(normalizeWikitextTeam(rugbybox?.params.away ?? "")).toBe(
      "Leicester Tigers",
    );
  });

  it("interprets an en-dash score and an empty score", () => {
    expect(parseScoreText("32–26")).toEqual({
      awayScore: 26,
      homeScore: 32,
      status: "finished",
    });
    expect(parseScoreText("")).toEqual({
      awayScore: null,
      homeScore: null,
      status: "scheduled",
    });
  });

  it("throws instead of returning an empty result when rugbyboxes are absent", () => {
    expect(() => parsePremiershipLiveWikitext("== Fixtures ==")).toThrow(
      "No rugbybox templates found in Premiership wikitext.",
    );
  });

  it("keeps the existing missing-page behavior for a raw page 404", async () => {
    fetcherMock.fetchWithPolicy.mockRejectedValue(
      new FetchError({
        attempt: 1,
        status: 404,
        url: "https://en.wikipedia.org/wiki/missing?action=raw",
      }),
    );

    await expect(fetchPremiership("2027-28")).resolves.toEqual([]);
  });

  it("fetches raw wikitext via the allowed wiki URL and common policy", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(rawResponse(PREMIERSHIP_RUGBYBOX));

    await expect(fetchPremiership("2025-26")).resolves.toHaveLength(1);
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2025%E2%80%9326_Premiership_Rugby?action=raw",
    );
  });

  it("joins multiple raw pages sequentially for later competition migrations", async () => {
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(rawResponse(PREMIERSHIP_RUGBYBOX))
      .mockResolvedValueOnce(rawResponse(SIX_NATIONS_RUGBYBOX));

    await expect(
      fetchWikipediaWikitext(["First page", "Second page"]),
    ).resolves.toBe(`${PREMIERSHIP_RUGBYBOX}\n${SIX_NATIONS_RUGBYBOX}`);
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      1,
      "https://en.wikipedia.org/wiki/First_page?action=raw",
    );
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      2,
      "https://en.wikipedia.org/wiki/Second_page?action=raw",
    );
  });
});
