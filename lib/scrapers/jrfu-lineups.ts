import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type JrfuLineupPlayer = {
  is_starter: boolean;
  jrfu_player_id: string | null;
  jersey_number: number;
  name: string;
};

export type JrfuMatchLineup = {
  announced_at: string;
  japan_players: JrfuLineupPlayer[];
  opponent_name: string;
  opponent_players: JrfuLineupPlayer[];
  source_url: string;
};

const JRFU_ORIGIN = "https://www.rugby-japan.jp";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatJstDate(kickoffAt: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date(kickoffAt));
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get("year")}${valueByType.get("month")}${valueByType.get("day")}`;
}

function parseJrfuTeamPlayers(
  $: ReturnType<typeof load>,
  section: ReturnType<ReturnType<typeof load>>,
  selector: string,
  isStarter: boolean,
) {
  return section
    .find(`${selector} tr`)
    .toArray()
    .flatMap((row) => {
      const jerseyNumber = Number(
        normalizeWhitespace($(row).find("td.num").text()),
      );
      const name = normalizeWhitespace(
        $(row).find("td").eq(2).find("a").text(),
      );
      const playerHref = $(row).find("td").eq(2).find("a").attr("href");
      const jrfuPlayerId = playerHref?.match(/^\/player\/(\d+)$/)?.[1] ?? null;

      if (
        !Number.isInteger(jerseyNumber) ||
        jerseyNumber < 1 ||
        jerseyNumber > 23 ||
        !name
      ) {
        return [];
      }

      return [
        {
          is_starter: isStarter,
          jrfu_player_id: jrfuPlayerId,
          jersey_number: jerseyNumber,
          name,
        },
      ];
    });
}

export function buildJrfuBraveBlossomsMatchUrl(kickoffAt: string) {
  return `${JRFU_ORIGIN}/braveblossoms/match/${formatJstDate(kickoffAt)}`;
}

export function findJrfuMatchUrl(landingHtml: string) {
  const $ = load(landingHtml);
  const href = $("a")
    .toArray()
    .map((element) => ({
      href: $(element).attr("href"),
      text: normalizeWhitespace($(element).text()),
    }))
    .find((link) =>
      link.text.includes("試合登録メンバー/試合記録はこちら"),
    )?.href;

  if (!href) {
    return null;
  }

  const url = new URL(href, JRFU_ORIGIN);

  if (url.origin !== JRFU_ORIGIN || !/^\/match\/\d+$/.test(url.pathname)) {
    return null;
  }

  return url.toString();
}

export function parseJrfuMatchLineupHtml(
  html: string,
  sourceUrl: string,
): JrfuMatchLineup | null {
  const $ = load(html);
  const teamSections = $("div.home, div.away")
    .toArray()
    .map((element) => ({
      name: normalizeWhitespace($(element).find("h3").first().text()),
      section: $(element),
    }))
    .filter((team) => team.name);
  const japan = teamSections.find((team) => team.name === "日本代表");
  const opponent = teamSections.find((team) => team.name !== "日本代表");

  if (!japan || !opponent) {
    return null;
  }

  const japanPlayers = [
    ...parseJrfuTeamPlayers($, japan.section, ".starting", true),
    ...parseJrfuTeamPlayers($, japan.section, ".reserve", false),
  ];
  const opponentPlayers = [
    ...parseJrfuTeamPlayers($, opponent.section, ".starting", true),
    ...parseJrfuTeamPlayers($, opponent.section, ".reserve", false),
  ];

  if (japanPlayers.length === 0 || opponentPlayers.length === 0) {
    return null;
  }

  return {
    announced_at: new Date().toISOString(),
    japan_players: japanPlayers,
    opponent_name: opponent.name,
    opponent_players: opponentPlayers,
    source_url: sourceUrl,
  };
}

export async function fetchJrfuMatchLineup(kickoffAt: string) {
  const landingUrl = buildJrfuBraveBlossomsMatchUrl(kickoffAt);
  const landingResponse = await fetchWithPolicy(landingUrl);
  const matchUrl = findJrfuMatchUrl(await landingResponse.text());

  if (!matchUrl) {
    return null;
  }

  const matchResponse = await fetchWithPolicy(matchUrl);

  return parseJrfuMatchLineupHtml(await matchResponse.text(), matchUrl);
}
