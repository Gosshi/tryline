import { getSupabaseServerClient } from "@/lib/db/server";
import {
  fetchJrfuMatchPage,
  fetchJrfuSchedule,
  type JrfuMatchPage,
  type JrfuSchedule,
} from "@/lib/scrapers/jrfu-match-broadcasts";

import type { MatchBroadcastKind } from "@/lib/db/queries/match-broadcasts";
import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type BroadcastMatch = {
  awayTeam: { name: string; slug: string } | null;
  homeTeam: { name: string; slug: string } | null;
  id: string;
  kickoffAt: string;
};

type BroadcastMatchRow = {
  away_team: BroadcastMatch["awayTeam"];
  home_team: BroadcastMatch["homeTeam"];
  id: string;
  kickoff_at: string;
};

type UpsertBroadcast = {
  kind: MatchBroadcastKind;
  matchId: string;
  serviceName: string;
  sourceUrl: string;
  url: string;
};

export type BroadcastIngestResult = {
  generatedAt: string;
  linked: Array<{
    kind: MatchBroadcastKind;
    label: string;
    matchId: string;
    serviceName: string;
  }>;
  matchesStillMissing: Array<{
    kickoffAt: string;
    label: string;
    matchId: string;
  }>;
  unknownServices: Array<{
    serviceName: string;
    sourceUrl: string;
    url: string;
  }>;
  unlinkedPages: Array<{
    dateLabel: string;
    reason: string;
    sourceUrl: string;
  }>;
};

export type BroadcastIngestDependencies = {
  dryRun?: boolean;
  fetchMatchPage?: (url: string) => Promise<JrfuMatchPage>;
  fetchSchedule?: () => Promise<JrfuSchedule>;
  listScheduledMatches?: (params: {
    now: Date;
    scheduleYear: number | null;
  }) => Promise<BroadcastMatch[]>;
  listMatchIdsWithBroadcasts?: (matchIds: string[]) => Promise<Set<string>>;
  now?: () => Date;
  upsertBroadcasts?: (broadcasts: UpsertBroadcast[]) => Promise<void>;
};

const KIND_BY_SERVICE_NAME: Readonly<Record<string, MatchBroadcastKind>> = {
  BS日テレ: "tv",
  Hulu: "streaming",
  "J SPORTS 1": "tv",
  "J SPORTS 2": "tv",
  "J SPORTS 3": "tv",
  "J SPORTS 4": "tv",
  "J SPORTSオンデマンド": "streaming",
  WOWOWライブ: "tv",
  WOWOWオンデマンド: "streaming",
  日本テレビ系全国ネット: "tv",
  WOWOWプライム: "tv",
};

function removeServiceNameSpaces(serviceName: string) {
  return serviceName.trim().replace(/[ \u3000]/g, "");
}

function resolveBroadcastService(serviceName: string) {
  const normalizedName = removeServiceNameSpaces(serviceName);
  const canonicalName = Object.keys(KIND_BY_SERVICE_NAME).find(
    (name) => removeServiceNameSpaces(name) === normalizedName,
  );

  return {
    kind: canonicalName ? KIND_BY_SERVICE_NAME[canonicalName] : undefined,
    serviceName: canonicalName ?? normalizedName,
  };
}

function getJstDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getJstYear(value: string) {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
    }).format(new Date(value)),
  );
}

function parseJrfuDate(dateLabel: string, year: number | null) {
  const match = dateLabel.match(/(\d{1,2})\.(\d{1,2})/);

  if (!match || year === null) {
    return null;
  }

  return `${year}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

function isJapanMatch(match: BroadcastMatch) {
  return match.homeTeam?.slug === "japan" || match.awayTeam?.slug === "japan";
}

function getMatchLabel(match: BroadcastMatch) {
  return `${match.homeTeam?.name ?? "Unknown"} 対 ${match.awayTeam?.name ?? "Unknown"}`;
}

function mapBroadcastMatch(row: BroadcastMatchRow): BroadcastMatch {
  return {
    awayTeam: row.away_team,
    homeTeam: row.home_team,
    id: row.id,
    kickoffAt: row.kickoff_at,
  };
}

function getScheduleEnd(now: Date, scheduleYear: number | null) {
  if (scheduleYear === null) {
    return new Date(now.getTime() + 366 * 24 * 60 * 60 * 1_000);
  }

  return new Date(`${scheduleYear}-12-31T23:59:59.999Z`);
}

async function loadScheduledMatches(
  db: SupabaseClient<Database>,
  params: { now: Date; scheduleYear: number | null },
): Promise<BroadcastMatch[]> {
  const { data, error } = await db
    .from("matches")
    .select(
      "id, kickoff_at, home_team:teams!matches_home_team_id_fkey(name, slug), away_team:teams!matches_away_team_id_fkey(name, slug)",
    )
    .eq("status", "scheduled")
    .gte("kickoff_at", params.now.toISOString())
    .lte(
      "kickoff_at",
      getScheduleEnd(params.now, params.scheduleYear).toISOString(),
    )
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as BroadcastMatchRow[])
    .map(mapBroadcastMatch)
    .filter(
      (match) =>
        params.scheduleYear === null ||
        getJstYear(match.kickoffAt) === params.scheduleYear,
    );
}

async function loadMatchIdsWithBroadcasts(
  db: SupabaseClient<Database>,
  matchIds: string[],
): Promise<Set<string>> {
  if (matchIds.length === 0) {
    return new Set();
  }

  const { data, error } = await db
    .from("match_broadcasts")
    .select("match_id")
    .in("match_id", matchIds);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.match_id));
}

async function upsertMatchBroadcasts(
  db: SupabaseClient<Database>,
  broadcasts: UpsertBroadcast[],
): Promise<void> {
  if (broadcasts.length === 0) {
    return;
  }

  const verifiedAt = new Date().toISOString();
  const displayOrderByMatchId = new Map<string, number>();
  const rows = broadcasts.map((broadcast) => {
    const displayOrder = displayOrderByMatchId.get(broadcast.matchId) ?? 0;
    displayOrderByMatchId.set(broadcast.matchId, displayOrder + 1);

    return {
      display_order: displayOrder,
      kind: broadcast.kind,
      match_id: broadcast.matchId,
      service_name: broadcast.serviceName,
      source_url: broadcast.sourceUrl,
      url: broadcast.url,
      verified_at: verifiedAt,
    };
  });
  const { error } = await db
    .from("match_broadcasts")
    .upsert(rows, { onConflict: "match_id,service_name" });

  if (error) {
    throw error;
  }
}

export async function runBroadcastIngest(
  dependencies: BroadcastIngestDependencies = {},
): Promise<BroadcastIngestResult> {
  let db: SupabaseClient<Database> | null = null;
  const getDb = () => {
    db ??= getSupabaseServerClient();

    return db;
  };
  const now = dependencies.now?.() ?? new Date();
  const schedule = await (dependencies.fetchSchedule ?? fetchJrfuSchedule)();
  const scheduledMatches = await (
    dependencies.listScheduledMatches ??
    ((params) => loadScheduledMatches(getDb(), params))
  )({ now, scheduleYear: schedule.year });
  const linked: BroadcastIngestResult["linked"] = [];
  const unknownServices: BroadcastIngestResult["unknownServices"] = [];
  const unlinkedPages: BroadcastIngestResult["unlinkedPages"] = [];
  const broadcastsToUpsert: UpsertBroadcast[] = [];

  for (const url of schedule.matchUrls) {
    try {
      const page = await (dependencies.fetchMatchPage ?? fetchJrfuMatchPage)(
        url,
      );
      const date = parseJrfuDate(page.dateLabel, schedule.year);

      if (date && date < getJstDate(now.toISOString())) {
        continue;
      }
      const candidates = date
        ? scheduledMatches.filter(
            (match) =>
              isJapanMatch(match) && getJstDate(match.kickoffAt) === date,
          )
        : [];

      if (candidates.length !== 1) {
        unlinkedPages.push({
          dateLabel: page.dateLabel,
          reason:
            date === null
              ? "JRFUページの日付または一覧ページの年を解釈できません"
              : `一致する日本代表戦が${candidates.length}件です`,
          sourceUrl: page.sourceUrl,
        });
        continue;
      }

      const match = candidates[0]!;

      for (const broadcast of page.broadcasts) {
        const { kind, serviceName } = resolveBroadcastService(
          broadcast.serviceName,
        );

        if (!kind) {
          unknownServices.push({
            serviceName,
            sourceUrl: page.sourceUrl,
            url: broadcast.url,
          });
          continue;
        }

        broadcastsToUpsert.push({
          kind,
          matchId: match.id,
          serviceName,
          sourceUrl: page.sourceUrl,
          url: broadcast.url,
        });
        linked.push({
          kind,
          label: getMatchLabel(match),
          matchId: match.id,
          serviceName,
        });
      }
    } catch (error) {
      console.error("[broadcast-ingest] failed to process JRFU match page", {
        error,
        url,
      });
    }
  }

  if (!dependencies.dryRun && broadcastsToUpsert.length > 0) {
    await (
      dependencies.upsertBroadcasts ??
      ((broadcasts) => upsertMatchBroadcasts(getDb(), broadcasts))
    )(broadcastsToUpsert);
  }

  const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000);
  const nearTermMatches = scheduledMatches.filter(
    (match) => new Date(match.kickoffAt) <= fourteenDaysLater,
  );
  const matchIdsWithBroadcasts = await (
    dependencies.listMatchIdsWithBroadcasts ??
    ((matchIds) => loadMatchIdsWithBroadcasts(getDb(), matchIds))
  )(nearTermMatches.map((match) => match.id));
  const linkedMatchIds = new Set(linked.map((broadcast) => broadcast.matchId));

  return {
    generatedAt: now.toISOString(),
    linked,
    matchesStillMissing: nearTermMatches
      .filter(
        (match) =>
          !matchIdsWithBroadcasts.has(match.id) &&
          !linkedMatchIds.has(match.id),
      )
      .map((match) => ({
        kickoffAt: match.kickoffAt,
        label: getMatchLabel(match),
        matchId: match.id,
      })),
    unknownServices,
    unlinkedPages,
  };
}
