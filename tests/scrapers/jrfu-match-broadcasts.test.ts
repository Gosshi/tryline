import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  fetchJrfuMatchPage,
  listJrfuMatchUrls,
  parseJrfuMatchPageHtml,
  parseJrfuScheduleHtml,
} from "@/lib/scrapers/jrfu-match-broadcasts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

describe("JRFU match broadcast scraper", () => {
  it("parses the selected schedule year and match URLs from the JRFU schedule structure", async () => {
    const html = await readFile(fixturePath("jrfu-schedule-2026.html"), "utf8");

    expect(parseJrfuScheduleHtml(html)).toEqual({
      matchUrls: [
        "https://www.rugby-japan.jp/match/29986",
        "https://www.rugby-japan.jp/match/29968",
      ],
      year: 2026,
    });
  });

  it("extracts unchanged service names and URLs from broadcast anchors", async () => {
    const sourceUrl = "https://www.rugby-japan.jp/match/29968";
    const html = await readFile(fixturePath("jrfu-match-29968.html"), "utf8");

    expect(parseJrfuMatchPageHtml(html, sourceUrl)).toEqual({
      broadcasts: [
        {
          serviceName: "BS日テレ",
          url: "https://www.bs4.jp/rugbycharengecup2026/",
        },
        {
          serviceName: "J SPORTS 1",
          url: "https://www.jsports.co.jp/program_guide/03/04/111627_1310012/?utm_source=JRFU&utm_medium=referral&utm_campaign=js_JRFU_referral_rugby_JAPAN",
        },
        { serviceName: "Hulu", url: "https://www.hulu.jp/livetv/283" },
        {
          serviceName: "J SPORTSオンデマンド",
          url: "https://jod.jsports.co.jp/p/rugby/japan_rugby/111627-L?utm_source=JRFU&utm_medium=referral&utm_campaign=js_JRFU_referral_rugby_JAPAN",
        },
      ],
      dateLabel: "08.08 Sat",
      sourceUrl,
    });
  });

  it("uses the policy-aware fetcher for both the schedule and a match page", async () => {
    fetcherMock.fetchWithPolicy
      .mockResolvedValueOnce(
        new Response(
          '<select><option selected>2026年</option></select><div class="game-card"><a href="/match/29968">試合</a></div>',
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          '<div class="gameInfo"><span class="dates">08.08 Sat</span></div><div class="broadcast"><a href="https://www.hulu.jp/livetv/283">Hulu</a></div>',
        ),
      );

    await expect(listJrfuMatchUrls()).resolves.toEqual([
      "https://www.rugby-japan.jp/match/29968",
    ]);
    await expect(
      fetchJrfuMatchPage("https://www.rugby-japan.jp/match/29968"),
    ).resolves.toMatchObject({ dateLabel: "08.08 Sat" });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      1,
      "https://www.rugby-japan.jp/schedule/",
    );
    expect(fetcherMock.fetchWithPolicy).toHaveBeenNthCalledWith(
      2,
      "https://www.rugby-japan.jp/match/29968",
    );
  });
});
