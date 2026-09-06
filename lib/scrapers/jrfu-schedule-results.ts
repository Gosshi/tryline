import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type JrfuScheduleResult = {
  dateJrfu: string;
  japanScore: number | null;
  matchUrl: string | null;
  opponentName: string;
  opponentScore: number | null;
};

export const JRFU_SCHEDULE_URL = "https://www.rugby-japan.jp/schedule/";

function parseSelectedYear(html: string): number | null {
  const $ = load(html);
  const year = $("select option[selected]")
    .toArray()
    .map((option) => $(option).attr("value") ?? "")
    .map((value) => value.match(/[?&]y=(\d{4})/)?.[1])
    .find((value): value is string => value !== undefined);

  return year ? Number(year) : null;
}

function parseScore(value: string): number | null {
  const normalized = value.replace(/\s+/g, " ").trim();

  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

export function parseJrfuScheduleResultsHtml(
  html: string,
): JrfuScheduleResult[] {
  const $ = load(html);
  const year = parseSelectedYear(html);

  if (year === null) {
    return [];
  }

  return $(".game-card")
    .toArray()
    .flatMap((card) => {
      const date = $(card).find(".dates .date").first().text().trim();
      const dateParts = date.match(/^(\d{1,2})\.(\d{1,2})$/);
      const teams = $(card)
        .find(".game .team")
        .toArray()
        .map((team) => ({
          name: $(team).find(".name").first().text().trim(),
          side: $(team).hasClass("home") ? "home" : "away",
        }));
      const japan = teams.find((team) => team.name === "日本代表");
      const opponent = teams.find((team) => team.name !== "日本代表");
      const scores = $(card)
        .find(".scoreboard .score")
        .toArray()
        .map((score) => parseScore($(score).text()));
      const matchHref = $(card).find("a[href*='/match/']").first().attr("href");

      if (!dateParts || !japan || !opponent || scores.length !== 2) {
        return [];
      }

      const [homeScore, awayScore] = scores;

      return [
        {
          dateJrfu: `${year}-${dateParts[1]?.padStart(2, "0")}-${dateParts[2]?.padStart(2, "0")}`,
          japanScore: japan.side === "home" ? homeScore ?? null : awayScore ?? null,
          matchUrl: matchHref
            ? new URL(matchHref, JRFU_SCHEDULE_URL).toString()
            : null,
          opponentName: opponent.name,
          opponentScore:
            opponent.side === "home" ? homeScore ?? null : awayScore ?? null,
        },
      ];
    });
}

export async function fetchJrfuScheduleResults(): Promise<
  JrfuScheduleResult[]
> {
  const response = await fetchWithPolicy(JRFU_SCHEDULE_URL);

  return parseJrfuScheduleResultsHtml(await response.text());
}
