import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchesInRange, type CalendarMatch } from "@/lib/db/queries/matches";
import {
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
} from "@/lib/format/week";
import { parseMarkdown, splitRecapForPaywall } from "@/lib/match-content/markdown";
import { isSampleMatch } from "@/lib/sample-matches";
import { SITE_URL } from "@/lib/site";
import { truncateAtSentenceBoundary } from "@/lib/text";

import type {
  V1CalendarMatch,
  V1MatchStories,
  V1StoriesData,
  V1StoryItem,
  V1StoryItemType,
} from "@/lib/api/v1/types";
import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const MATCH_LIMIT = 12;

function parseDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcMs = Date.UTC(year!, month! - 1, day!);

  return new Date(utcMs).toISOString().slice(0, 10) === value ? utcMs : null;
}

function resolveRange(
  request: Request,
):
  | { endUtcIso: string; from: string; label: string; startUtcIso: string; to: string }
  | { error: string } {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from === null && to === null) {
    const range = getCurrentJstWeekRangeUtc();

    return {
      endUtcIso: range.endUtcIso,
      from: range.weekStartJst,
      label: formatJstWeekRangeLabel(range.weekStartJst),
      startUtcIso: range.startUtcIso,
      to: range.weekEndJst,
    };
  }

  if (from === null || to === null) {
    return { error: "from and to must be provided together" };
  }

  const fromMs = parseDate(from);
  const toMs = parseDate(to);

  if (fromMs === null || toMs === null) {
    return { error: "from and to must be valid ISO 8601 dates" };
  }

  if (fromMs > toMs) {
    return { error: "from must be on or before to" };
  }

  if ((toMs - fromMs) / DAY_MS > 31) {
    return { error: "date range must not exceed 31 days" };
  }

  return {
    endUtcIso: new Date(toMs + DAY_MS - JST_OFFSET_MS).toISOString(),
    from,
    label: formatJstWeekRangeLabel(from),
    startUtcIso: new Date(fromMs - JST_OFFSET_MS).toISOString(),
    to,
  };
}

function mapMatch(match: CalendarMatch): V1CalendarMatch {
  return {
    away_team: {
      flag_code: match.awayTeam.flagCode ?? null,
      id: match.awayTeam.id ?? null,
      name: match.awayTeam.name,
      score: match.awayScore,
      short_code: match.awayTeam.shortCode,
      slug: match.awayTeam.slug,
    },
    broadcast_jp_url: match.broadcastJpUrl ?? null,
    competition: {
      name: match.competition.nameJa ?? match.competition.name,
      season: match.competition.season,
      slug: match.competition.slug,
    },
    has_broadcasts: match.hasBroadcasts,
    has_preview: match.hasPreview,
    has_recap: match.hasRecap,
    home_team: {
      flag_code: match.homeTeam.flagCode ?? null,
      id: match.homeTeam.id ?? null,
      name: match.homeTeam.name,
      score: match.homeScore,
      short_code: match.homeTeam.shortCode,
      slug: match.homeTeam.slug,
    },
    id: match.id,
    kickoff_utc: match.kickoffAt,
    status: match.status,
  };
}

function matchupTitle(match: CalendarMatch): string {
  return `${match.homeTeam.name} vs ${match.awayTeam.name}`;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMarkdown(markdown: string): string | null {
  const firstParagraph = parseMarkdown(markdown).find(
    (block) => block.type === "paragraph",
  );
  const source =
    firstParagraph?.type === "paragraph" ? firstParagraph.text : markdown;
  const summary = truncateAtSentenceBoundary(stripInlineMarkdown(source), 120);

  return summary.length > 0 ? summary : null;
}

function buildImageUrls(
  matchId: string,
  type: V1StoryItemType,
  publishedAt: string,
): V1StoryItem["image"] {
  const version = Math.max(
    0,
    Math.floor(new Date(publishedAt).getTime() / 1_000),
  );
  const base = `/api/og?type=story&match=${encodeURIComponent(
    matchId,
  )}&item=${type}&v=${version}`;

  return {
    landscape_url: `${SITE_URL}${base}&orientation=landscape`,
    portrait_url: `${SITE_URL}${base}&orientation=portrait`,
  };
}

function buildContentItem(
  match: CalendarMatch,
  type: "preview" | "recap",
  content: PublishedMatchContent,
  premiumRequired: boolean,
  summaryMarkdown: string,
): V1StoryItem {
  const label = type === "preview" ? "プレビュー" : "レビュー";

  return {
    contains_result: type === "recap",
    destination: {
      type: "match",
      url: `${SITE_URL}/matches/${match.id}`,
    },
    id: `${match.id}:${type}`,
    image: buildImageUrls(match.id, type, content.generatedAt),
    premium_required: premiumRequired,
    published_at: content.generatedAt,
    summary: summarizeMarkdown(summaryMarkdown),
    title: `${label}｜${matchupTitle(match)}`,
    type,
  };
}

function buildResultItem(match: CalendarMatch): V1StoryItem | null {
  if (
    match.status !== "finished" ||
    match.homeScore === null ||
    match.awayScore === null
  ) {
    return null;
  }

  const publishedAt = match.updatedAt ?? match.kickoffAt;

  return {
    contains_result: true,
    destination: {
      type: "match",
      url: `${SITE_URL}/matches/${match.id}`,
    },
    id: `${match.id}:result`,
    image: buildImageUrls(match.id, "result", publishedAt),
    premium_required: false,
    published_at: publishedAt,
    summary: `${match.homeTeam.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam.name}`,
    title: `試合結果｜${matchupTitle(match)}`,
    type: "result",
  };
}

async function buildMatchStories(
  match: CalendarMatch,
): Promise<V1MatchStories | null> {
  if (match.status === "cancelled") {
    return null;
  }

  const content = await getPublishedContentForMatch(match.id);
  const items: V1StoryItem[] = [];

  if (content.preview) {
    items.push(
      buildContentItem(
        match,
        "preview",
        content.preview,
        false,
        content.preview.contentMdJa,
      ),
    );
  }

  if (match.status !== "postponed") {
    const result = buildResultItem(match);

    if (result) {
      items.push(result);
    }

    if (content.recap) {
      const sampleMatch = await isSampleMatch(match.id);
      const recapSplit = splitRecapForPaywall(content.recap.contentMdJa);
      const premiumRequired = Boolean(
        !sampleMatch && recapSplit.hasLocked && recapSplit.lockedMd,
      );

      items.push(
        buildContentItem(
          match,
          "recap",
          content.recap,
          premiumRequired,
          recapSplit.freeMd,
        ),
      );
    }
  }

  if (items.length === 0) {
    return null;
  }

  return {
    items,
    match: mapMatch(match),
    updated_at: items
      .map((item) => item.published_at)
      .sort((a, b) => b.localeCompare(a))[0]!,
  };
}

function isStoryCandidate(match: CalendarMatch): boolean {
  if (match.status === "cancelled") {
    return false;
  }

  if (match.status === "postponed") {
    return match.hasPreview;
  }

  return (
    match.hasPreview ||
    match.hasRecap ||
    (match.status === "finished" &&
      match.homeScore !== null &&
      match.awayScore !== null)
  );
}

export async function GET(request: Request) {
  const range = resolveRange(request);

  if ("error" in range) {
    return apiError(range.error, 400, PUBLIC_CACHE_CONTROL);
  }

  const matches = await getMatchesInRange(range.startUtcIso, range.endUtcIso);
  const candidates = matches.filter(isStoryCandidate).slice(0, MATCH_LIMIT);
  const matchStories = (
    await Promise.all(candidates.map((match) => buildMatchStories(match)))
  ).filter((story): story is V1MatchStories => story !== null);
  const data: V1StoriesData = {
    matches: matchStories,
    week: {
      from: range.from,
      label: range.label,
      to: range.to,
    },
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
