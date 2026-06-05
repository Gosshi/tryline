import { beforeEach, describe, expect, it, vi } from "vitest";

import { FetchError } from "@/lib/scrapers/errors";
import { fetchLeagueOneMatchDetail } from "@/lib/scrapers/league-one-match";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

function response(html: string) {
  return new Response(html, { status: 200 });
}

function notFound(url: string) {
  return new FetchError({ attempt: 1, status: 404, url });
}

describe("fetchLeagueOneMatchDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back from finished-only print pages to scheduled t1=1 pages", async () => {
    fetcherMock.fetchWithPolicy
      .mockRejectedValueOnce(
        notFound("https://league-one.jp/match/29559/print"),
      )
      .mockResolvedValueOnce(
        response(`
          <ol class="match-member match-member-left">
            <li id="h21"><a>流 大<br><span class="player-info">166cm/71kg/32歳</span></a></li>
            <li id="h22"><a>中村 亮土<br><span class="player-info">178cm/92kg/34歳</span></a></li>
          </ol>
          <ol class="match-member match-member-right">
            <li id="a9"><a>埼玉 選手<br><span class="player-info">170cm/80kg/28歳</span></a></li>
          </ol>
        `),
      );

    const detail = await fetchLeagueOneMatchDetail(29559, {
      allowEmptyLineups: true,
    });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      1,
      "https://league-one.jp/match/29559/print",
    );
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      2,
      "https://league-one.jp/match/29559?t1=1",
    );
    expect(detail.sourceUrl).toBe("https://league-one.jp/match/29559?t1=1");
    expect(detail.players).toContainEqual({
      jersey_number: 21,
      player_name: "流大",
      team_side: "home",
    });
    expect(detail.players).toContainEqual({
      jersey_number: 22,
      player_name: "中村亮土",
      team_side: "home",
    });
  });

  it("returns no lineup instead of throwing when both lineup sources are 404", async () => {
    fetcherMock.fetchWithPolicy
      .mockRejectedValueOnce(
        notFound("https://league-one.jp/match/99999/print"),
      )
      .mockRejectedValueOnce(
        notFound("https://league-one.jp/match/99999?t1=1"),
      );

    const detail = await fetchLeagueOneMatchDetail(99999, {
      allowEmptyLineups: true,
    });

    expect(detail).toEqual({
      events: [],
      players: [],
      sourceUrl: "https://league-one.jp/match/99999?t1=1",
    });
  });
});
