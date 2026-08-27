import { getSupabaseServerClient } from "@/lib/db/server";
import { sendExpoPushNotifications } from "@/lib/push/expo";

import type { CalendarMatch, MatchListItem } from "@/lib/db/queries/matches";
import type { Database } from "@/lib/db/types";
import type { PushMessage } from "@/lib/push/expo";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushNotificationKind = "prematch" | "preview" | "recap";

type PushTokenRow = {
  team_slugs: string[] | null;
  token: string;
};

type PushMatch = {
  awayTeam: MatchListItem["awayTeam"];
  competition: {
    name: string;
    nameJa?: string | null;
  };
  homeTeam: MatchListItem["homeTeam"];
  id: string;
  kickoffAt: string;
};

type ContentNotificationRow = {
  content_type: PushNotificationKind;
  generated_at: string;
  match: {
    away_team: {
      name: string;
      name_ja?: string | null;
      slug: string;
    } | null;
    competition: {
      name: string;
      name_ja?: string | null;
    } | null;
    home_team: {
      name: string;
      name_ja?: string | null;
      slug: string;
    } | null;
    id: string;
    kickoff_at: string;
  } | null;
  match_id: string;
};

export type PushCronSummary = {
  deletedInvalidTokens: number;
  failedMatches: number;
  sentMatches: number;
  sentNotifications: number;
  skippedAlreadyLogged: number;
};

const EMPTY_SUMMARY: PushCronSummary = {
  deletedInvalidTokens: 0,
  failedMatches: 0,
  sentMatches: 0,
  sentNotifications: 0,
  skippedAlreadyLogged: 0,
};

function displayTeamName(team: { name: string; nameJa?: string | null }) {
  return team.nameJa ?? team.name;
}

function displayCompetitionName(competition: {
  name: string;
  nameJa?: string | null;
}) {
  return competition.nameJa ?? competition.name;
}

function formatKickoffJst(iso: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function teamsForMatch(match: PushMatch) {
  return [match.homeTeam.slug, match.awayTeam.slug];
}

function buildTitle(kind: PushNotificationKind) {
  if (kind === "prematch") return "まもなくキックオフ";
  if (kind === "preview") return "プレビュー公開";

  return "試合レビュー公開";
}

function buildBody(match: PushMatch, kind: PushNotificationKind) {
  const home = displayTeamName(match.homeTeam);
  const away = displayTeamName(match.awayTeam);

  if (kind === "prematch") {
    return `${home} v ${away}（${displayCompetitionName(match.competition)}）${formatKickoffJst(match.kickoffAt)}`;
  }

  if (kind === "preview") {
    return `プレビュー公開: ${home} v ${away}`;
  }

  return `試合レビュー公開: ${home} v ${away}（スコアは開いてから）`;
}

async function getLoggedKeys(
  client: SupabaseClient<Database>,
  matchIds: string[],
  kinds: PushNotificationKind[],
) {
  if (matchIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await client
    .from("push_notification_log")
    .select("match_id, kind")
    .in("match_id", matchIds)
    .in("kind", kinds);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => `${row.match_id}:${row.kind}`));
}

async function getTokensForMatch(
  client: SupabaseClient<Database>,
  match: PushMatch,
  column: "notify_content" | "notify_prematch",
) {
  const { data, error } = await client
    .from("expo_push_tokens")
    .select("token, team_slugs")
    .eq(column, true);

  if (error) {
    throw error;
  }

  const matchTeams = teamsForMatch(match);

  return ((data ?? []) as PushTokenRow[]).filter((row) => {
    const teamSlugs = row.team_slugs ?? [];

    if (teamSlugs.length === 0) {
      return column === "notify_content";
    }

    return matchTeams.some((slug) => teamSlugs.includes(slug));
  });
}

async function deleteInvalidTokens(
  client: SupabaseClient<Database>,
  tokens: string[],
) {
  if (tokens.length === 0) {
    return 0;
  }

  const { error } = await client
    .from("expo_push_tokens")
    .delete()
    .in("token", tokens);

  if (error) {
    throw error;
  }

  console.warn(
    `[push] Deleted ${tokens.length} Expo push token(s) after DeviceNotRegistered.`,
  );

  return tokens.length;
}

async function sendForMatch(
  client: SupabaseClient<Database>,
  match: PushMatch,
  kind: PushNotificationKind,
  tokens: PushTokenRow[],
): Promise<{ deletedInvalidTokens: number; sentNotifications: number }> {
  const messages: PushMessage[] = tokens.map((row) => ({
    to: row.token,
    title: buildTitle(kind),
    body: buildBody(match, kind),
    data: {
      matchId: match.id,
      url: `/matches/${match.id}`,
    },
  }));
  const result = await sendExpoPushNotifications(messages);
  const deletedInvalidTokens = await deleteInvalidTokens(
    client,
    result.deviceNotRegisteredTokens,
  );

  const { error } = await client.from("push_notification_log").insert({
    kind,
    match_id: match.id,
    sent_count: result.sentCount,
  });

  if (error) {
    throw error;
  }

  return {
    deletedInvalidTokens,
    sentNotifications: result.sentCount,
  };
}

function addSummary(a: PushCronSummary, b: Partial<PushCronSummary>) {
  return {
    deletedInvalidTokens:
      a.deletedInvalidTokens + (b.deletedInvalidTokens ?? 0),
    failedMatches: a.failedMatches + (b.failedMatches ?? 0),
    sentMatches: a.sentMatches + (b.sentMatches ?? 0),
    sentNotifications: a.sentNotifications + (b.sentNotifications ?? 0),
    skippedAlreadyLogged:
      a.skippedAlreadyLogged + (b.skippedAlreadyLogged ?? 0),
  };
}

export async function sendPrematchPushNotifications(
  matches: CalendarMatch[],
  client: SupabaseClient<Database> = getSupabaseServerClient(),
): Promise<PushCronSummary> {
  const loggedKeys = await getLoggedKeys(
    client,
    matches.map((match) => match.id),
    ["prematch"],
  );
  let summary = { ...EMPTY_SUMMARY };

  for (const match of matches) {
    if (loggedKeys.has(`${match.id}:prematch`)) {
      summary = addSummary(summary, { skippedAlreadyLogged: 1 });
      continue;
    }

    const tokens = await getTokensForMatch(client, match, "notify_prematch");

    try {
      const result = await sendForMatch(client, match, "prematch", tokens);
      summary = addSummary(summary, {
        deletedInvalidTokens: result.deletedInvalidTokens,
        sentMatches: 1,
        sentNotifications: result.sentNotifications,
      });
    } catch (error) {
      console.error("[push] Failed to send prematch notification.", error);
      summary = addSummary(summary, { failedMatches: 1 });
    }
  }

  return summary;
}

function mapContentRow(row: ContentNotificationRow): PushMatch | null {
  if (
    !row.match ||
    !row.match.home_team ||
    !row.match.away_team ||
    !row.match.competition
  ) {
    return null;
  }

  return {
    id: row.match.id,
    kickoffAt: row.match.kickoff_at,
    homeTeam: {
      slug: row.match.home_team.slug,
      name: row.match.home_team.name,
      nameJa: row.match.home_team.name_ja,
      shortCode: "",
    },
    awayTeam: {
      slug: row.match.away_team.slug,
      name: row.match.away_team.name,
      nameJa: row.match.away_team.name_ja,
      shortCode: "",
    },
    competition: {
      name: row.match.competition.name,
      nameJa: row.match.competition.name_ja,
    },
  };
}

export async function getRecentPublishedContentRows(
  client: SupabaseClient<Database>,
  now: Date,
) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        match_id,
        content_type,
        generated_at,
        match:matches!match_content_match_id_fkey (
          id,
          kickoff_at,
          home_team:teams!matches_home_team_id_fkey (
            slug,
            name,
            name_ja
          ),
          away_team:teams!matches_away_team_id_fkey (
            slug,
            name,
            name_ja
          ),
          competition:competitions!matches_competition_id_fkey (
            name,
            name_ja
          )
        )
      `,
    )
    .eq("language", "ja")
    .eq("status", "published")
    .gte("generated_at", since)
    .in("content_type", ["preview", "recap"])
    .order("generated_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as ContentNotificationRow[];
}

export async function sendContentPushNotifications(
  now = new Date(),
  client: SupabaseClient<Database> = getSupabaseServerClient(),
): Promise<PushCronSummary> {
  const rows = await getRecentPublishedContentRows(client, now);
  const loggedKeys = await getLoggedKeys(
    client,
    rows.map((row) => row.match_id),
    ["preview", "recap"],
  );
  let summary = { ...EMPTY_SUMMARY };

  for (const row of rows) {
    const kind = row.content_type;

    if (kind !== "preview" && kind !== "recap") {
      continue;
    }

    if (loggedKeys.has(`${row.match_id}:${kind}`)) {
      summary = addSummary(summary, { skippedAlreadyLogged: 1 });
      continue;
    }

    const match = mapContentRow(row);

    if (!match) {
      summary = addSummary(summary, { failedMatches: 1 });
      continue;
    }

    const tokens = await getTokensForMatch(client, match, "notify_content");

    try {
      const result = await sendForMatch(client, match, kind, tokens);
      summary = addSummary(summary, {
        deletedInvalidTokens: result.deletedInvalidTokens,
        sentMatches: 1,
        sentNotifications: result.sentNotifications,
      });
    } catch (error) {
      console.error("[push] Failed to send content notification.", error);
      summary = addSummary(summary, { failedMatches: 1 });
    }
  }

  return summary;
}
