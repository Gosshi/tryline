import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMocks = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMocks);

import {
  fetchJrfuMatchEvents,
  normalizeJrfuMatchUrl,
  parseJrfuMatchEventsHtml,
} from "@/lib/scrapers/jrfu-match-events";

const fixturePath = fileURLToPath(
  new URL("../fixtures/jrfu-match-29975.html", import.meta.url),
);

async function readFixture() {
  return readFile(fixturePath, "utf8");
}

describe("JRFU match event scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses scoring entries from the captured Japan v Canada page", async () => {
    const result = parseJrfuMatchEventsHtml(await readFixture());

    expect(result.hasUnsupportedScoringEvent).toBe(false);
    expect(result.events).toHaveLength(18);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minute: 5,
          playerName: "岡部崇人",
          teamSide: "home",
          type: "try",
        }),
        expect.objectContaining({
          minute: 16,
          playerName: "松永拓朗",
          teamSide: "home",
          type: "conversion",
        }),
        expect.objectContaining({
          minute: 19,
          playerName: "タコダ・マクマリン",
          teamSide: "away",
          type: "try",
        }),
      ]),
    );
  });

  it.each([
    ["icon-try", "try"],
    ["icon-conversion", "conversion"],
    ["icon-pg", "penalty_goal"],
    ["icon-dg", "drop_goal"],
  ] as const)(
    "maps the real timeline structure's %s class to %s",
    async (icon, type) => {
      const html = (await readFixture()).replace(
        "home icon-try",
        `home ${icon}`,
      );

      expect(parseJrfuMatchEventsHtml(html).events[0]).toMatchObject({ type });
    },
  );

  it("rejects a penalty try label instead of recording a five-point try", async () => {
    const html = (await readFixture()).replace("岡部崇人", "ペナルティトライ");

    const result = parseJrfuMatchEventsHtml(html);

    expect(result.hasUnsupportedScoringEvent).toBe(true);
    expect(result.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minute: 5, type: "try" }),
      ]),
    );
  });

  it("normalizes a schedule href to the www host and fetches through policy", async () => {
    const html = await readFixture();
    fetcherMocks.fetchWithPolicy.mockResolvedValue(new Response(html));

    expect(normalizeJrfuMatchUrl("https://rugby-japan.jp/match/29975")).toBe(
      "https://www.rugby-japan.jp/match/29975",
    );
    await expect(
      fetchJrfuMatchEvents("https://rugby-japan.jp/match/29975"),
    ).resolves.toMatchObject({ events: expect.any(Array) });
    expect(fetcherMocks.fetchWithPolicy).toHaveBeenCalledWith(
      "https://www.rugby-japan.jp/match/29975",
    );
  });
});
