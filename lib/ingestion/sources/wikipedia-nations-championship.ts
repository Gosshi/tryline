import { load } from "cheerio";
import { createHash } from "node:crypto";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  normalizeWhitespace,
  parseScoreText,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchNationsChampionship2026KickoffTimes } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";
import { FetchError } from "@/lib/scrapers/errors";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations";
import type { WorldRugbyNationsChampionshipTime } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "New Zealand": "new-zealand",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Wales: "wales",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Nations_Championship`;
}

function slugifyEventPart(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseRoundNumber(value: string) {
  const matched = normalizeWhitespace(value).match(/^Round\s+(\d+)$/i);

  return matched?.[1] ? Number(matched[1]) : null;
}

function getHtmlStructureDiagnostics(html: string) {
  const $ = load(html);
  const headings = $("div.mw-heading").toArray();
  let headingFollowedByDivWithTableCount = 0;
  let headingFollowedByTableCount = 0;
  let roundHeadingCount = 0;

  for (const heading of headings) {
    const roundName = normalizeWhitespace($(heading).text()).replace(
      /\[edit\]$/i,
      "",
    );

    if (!parseRoundNumber(roundName)) {
      continue;
    }

    roundHeadingCount += 1;

    const nextElement = $(heading).next();

    if (nextElement.is("table")) {
      headingFollowedByTableCount += 1;
    }

    if (nextElement.is("div") && nextElement.find("table").length > 0) {
      headingFollowedByDivWithTableCount += 1;
    }
  }

  return {
    headingFollowedByDivWithTableCount,
    headingFollowedByTableCount,
    mwHeadingCount: headings.length,
    mwHeadingTexts: headings.map((heading) =>
      normalizeWhitespace($(heading).text()),
    ),
    roundHeadingCount,
    sectionWithMwSectionIdCount: $("section[data-mw-section-id]").length,
  };
}

function getRuntimeDiagnostics() {
  return {
    scraperUserAgentIncludesMobile: process.env.SCRAPER_USER_AGENT
      ?.toLowerCase()
      .includes("mobile") ?? false,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    vercelRegion: process.env.VERCEL_REGION,
  };
}

function getResponseHeaderDiagnostics(response: Response) {
  return {
    age: response.headers.get("age"),
    contentEncoding: response.headers.get("content-encoding"),
    contentLength: response.headers.get("content-length"),
    contentType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    vary: response.headers.get("vary"),
    xCache: response.headers.get("x-cache"),
  };
}

function logEmptyWikipediaParse(response: Response, html: string) {
  console.warn("Nations Championship 2026 Wikipedia diagnostics", {
    ...getResponseHeaderDiagnostics(response),
    ...getHtmlStructureDiagnostics(html),
    ...getRuntimeDiagnostics(),
    htmlByteLength: Buffer.byteLength(html, "utf8"),
    htmlSha256: createHash("sha256").update(html).digest("hex"),
    httpStatus: response.status,
    reason: "empty-parse-result",
    responseRedirected: response.redirected,
    responseUrl: response.url,
    source: "wikipedia",
  });
}

function logMissingSource(source: "wikipedia" | "world-rugby", error: FetchError) {
  if (source === "wikipedia") {
    console.warn("Nations Championship 2026 Wikipedia diagnostics", {
      age: null,
      contentEncoding: null,
      contentLength: null,
      contentType: null,
      etag: null,
      headingFollowedByDivWithTableCount: null,
      headingFollowedByTableCount: null,
      htmlByteLength: null,
      htmlSha256: null,
      httpStatus: error.status,
      lastModified: null,
      mwHeadingCount: null,
      mwHeadingTexts: null,
      reason: "missing-page",
      requestUrl: error.url,
      responseRedirected: null,
      responseUrl: null,
      roundHeadingCount: null,
      sectionWithMwSectionIdCount: null,
      source,
      vary: null,
      xCache: null,
      ...getRuntimeDiagnostics(),
    });
    return;
  }

  console.warn("Nations Championship 2026 source fetch diagnostics", {
    httpStatus: error.status,
    reason: "missing-page",
    requestUrl: error.url,
    source,
  });
}

function parseRoundTableMatches(
  html: string,
  wikipediaUrl: string | null,
): ParsedWikipediaMatch[] {
  const $ = load(html);
  const matches: ParsedWikipediaMatch[] = [];

  for (const heading of $("div.mw-heading").toArray()) {
    const roundName = normalizeWhitespace($(heading).text()).replace(
      /\[edit\]$/i,
      "",
    );
    const round = parseRoundNumber(roundName);

    if (!round) {
      continue;
    }

    let cursor = $(heading).next();

    while (cursor.length > 0 && !cursor.is("div.mw-heading")) {
      if (cursor.is("table")) {
        cursor.find("tr").each((index, row) => {
          if (index === 0) {
            return;
          }

          const cells = $(row).find("th, td");

          if (cells.length < 5) {
            return;
          }

          const dateText = normalizeWhitespace(cells.eq(0).text());
          const homeTeamName = normalizeWhitespace(cells.eq(1).text());
          const score = parseScoreText(cells.eq(2).text());
          const awayTeamName = normalizeWhitespace(cells.eq(3).text());
          const venue = normalizeWhitespace(cells.eq(4).text()) || null;

          if (!dateText || !homeTeamName || !awayTeamName) {
            return;
          }

          matches.push({
            awayScore: score.awayScore,
            awayTeamName,
            eventId: [
              `round_${round}`,
              slugifyEventPart(homeTeamName),
              "v",
              slugifyEventPart(awayTeamName),
            ].join("_"),
            homeScore: score.homeScore,
            homeTeamName,
            kickoffAt: buildUtcIsoString({ dateText }),
            lineupTableHtml: null,
            rawHtml: $.html(row),
            round,
            roundName: null,
            status: score.status,
            venue,
            wikipediaUrl,
          });
        });
      }

      cursor = cursor.next();
    }
  }

  return matches;
}

function parseFinalsMatches(
  html: string,
  wikipediaUrl: string | null,
): ParsedWikipediaMatch[] {
  return toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );
}

export function parseNationsChampionshipLiveHtml(
  html: string,
  kickoffTimes: WorldRugbyNationsChampionshipTime[] = [],
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = [
    ...parseRoundTableMatches(html, wikipediaUrl),
    ...parseFinalsMatches(html, wikipediaUrl),
  ];
  const kickoffTimeByTeams = new Map(
    kickoffTimes.map((match) => [
      `${match.homeTeamSlug}:${match.awayTeamSlug}`,
      match,
    ]),
  );
  const resolvedMatches = mapWithTeamSlugs(
    parsedMatches,
    TEAM_SLUG_BY_WIKIPEDIA_NAME,
  );

  return resolvedMatches.map((match) => {
    const kickoffTime = kickoffTimeByTeams.get(
      `${match.homeTeamSlug}:${match.awayTeamSlug}`,
    );

    if (!kickoffTime) {
      return match;
    }

    return {
      ...match,
      kickoffAt: kickoffTime.kickoffAt,
      round: kickoffTime.round,
      venue: kickoffTime.venue ?? match.venue,
    };
  });
}

export async function fetchNationsChampionship2026(): Promise<
  ParsedLiveMatch[]
> {
  const sourceUrl = buildWikipediaUrl("2026");

  const [wikipediaResult, worldRugbyResult] = await Promise.allSettled([
    fetchWithPolicy(sourceUrl),
    fetchNationsChampionship2026KickoffTimes(),
  ]);

  if (wikipediaResult.status === "rejected") {
    if (wikipediaResult.reason instanceof FetchError && isMissingWikipediaPage(wikipediaResult.reason)) {
      logMissingSource("wikipedia", wikipediaResult.reason);
      return [];
    }

    throw wikipediaResult.reason;
  }

  if (worldRugbyResult.status === "rejected") {
    if (worldRugbyResult.reason instanceof FetchError && isMissingWikipediaPage(worldRugbyResult.reason)) {
      logMissingSource("world-rugby", worldRugbyResult.reason);
      return [];
    }

    throw worldRugbyResult.reason;
  }

  const html = await wikipediaResult.value.text();
  const matches = parseNationsChampionshipLiveHtml(
    html,
    worldRugbyResult.value,
    sourceUrl,
  );

  if (matches.length === 0) {
    logEmptyWikipediaParse(wikipediaResult.value, html);
  }

  return matches;
}
