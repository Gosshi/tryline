import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMocks = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMocks);

import {
  fetchJrfuScheduleResults,
  parseJrfuScheduleResultsHtml,
} from "@/lib/scrapers/jrfu-schedule-results";

const fixturePath = fileURLToPath(
  new URL("../fixtures/jrfu-schedule-2026.html", import.meta.url),
);

describe("JRFU schedule result scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a completed Japan fixture from the captured JRFU schedule structure", async () => {
    const html = await readFile(fixturePath, "utf8");

    expect(parseJrfuScheduleResultsHtml(html)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateJrfu: "2026-07-04",
          japanScore: 27,
          matchUrl: "https://www.rugby-japan.jp/match/29966",
          opponentName: "イタリア代表",
          opponentScore: 10,
        }),
      ]),
    );
  });

  it("keeps an unplayed fixture scoreless", async () => {
    const html = await readFile(fixturePath, "utf8");
    const canadaFixture = parseJrfuScheduleResultsHtml(html).find(
      (fixture) => fixture.dateJrfu === "2026-09-05",
    );

    expect(canadaFixture).toMatchObject({
      japanScore: null,
      opponentName: "カナダ代表",
      opponentScore: null,
    });
  });

  it("fetches the schedule once for every result list", async () => {
    const html = await readFile(fixturePath, "utf8");
    fetcherMocks.fetchWithPolicy.mockResolvedValue(new Response(html));

    await fetchJrfuScheduleResults();

    expect(fetcherMocks.fetchWithPolicy).toHaveBeenCalledTimes(1);
  });
});
