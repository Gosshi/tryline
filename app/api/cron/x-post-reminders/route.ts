import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { formatCompetitionTitle, getCompetitionDisplayName } from "@/lib/format/competition";
import { getTeamDisplayName } from "@/lib/format/team";
import { buildMatchShareUrl } from "@/lib/x/match-url";
import {
  isInternationalCompetitionFamily,
  prematchReminderDueAt,
} from "@/lib/x/post-reminders";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TaskKind = "prematch" | "postmatch";
type TaskStatus = "pending" | "posted" | "skipped" | "missed";
type Relation<T> = T | T[] | null;

type TeamRow = {
  name: string;
  name_ja: string | null;
  slug: string | null;
};

type CompetitionRow = {
  family: string | null;
  name: string;
  name_ja: string | null;
  season: string;
};

type ReminderMatch = {
  away_team: Relation<TeamRow>;
  competition: Relation<CompetitionRow>;
  home_team: Relation<TeamRow>;
  id: string;
  kickoff_at: string;
  status: string;
};

type CandidateMatch = ReminderMatch & {
  competition: Relation<CompetitionRow>;
};

type ReminderTask = {
  discord_message_id: string | null;
  due_at: string;
  id: string;
  kind: TaskKind;
  match: Relation<ReminderMatch>;
  match_id: string;
  re_reminded_at: string | null;
  reminded_at: string | null;
  resolved_at: string | null;
  status: TaskStatus;
};

type ReminderCredentials = {
  botToken: string;
  channelId: string;
  ownerId: string;
};

type DiscordButton = {
  custom_id: string;
  label: string;
  style: 2;
  type: 2;
};

const REMINDER_LIMIT = 10;
const MATCH_WINDOW_PAST_MS = 6 * 60 * 60 * 1000;
const MATCH_WINDOW_FUTURE_MS = 48 * 60 * 60 * 1000;
const POSTMATCH_FALLBACK_DELAY_MS = 6 * 60 * 60 * 1000;
const POSTMATCH_TASK_EXPIRY_MS = 72 * 60 * 60 * 1000;
const REREMINDER_DELAY_MS = 2 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function firstRelation<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function getJstHour(date: Date): number {
  return new Date(date.getTime() + JST_OFFSET_MS).getUTCHours();
}

function isQuietHours(date: Date): boolean {
  return getJstHour(date) < 8;
}

function formatJstDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function formatResolvedTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function competitionLabel(competition: CompetitionRow | null): string {
  const name = getCompetitionDisplayName(
    {
      family: competition?.family ?? null,
      name: competition?.name ?? "",
      nameJa: competition?.name_ja ?? null,
    },
    "ja",
  );

  return formatCompetitionTitle(name, competition?.season ?? "", "ja");
}

function getTeamName(team: TeamRow | null, fallback: string): string {
  return getTeamDisplayName(
    {
      name: team?.name ?? fallback,
      nameJa: team?.name_ja,
      slug: team?.slug,
    },
    "ja",
  );
}

function getCredentials(): ReminderCredentials | null {
  const { DISCORD_BOT_TOKEN, DISCORD_OWNER_USER_ID, DISCORD_X_REMINDER_CHANNEL_ID } =
    getServerEnv();

  if (!DISCORD_BOT_TOKEN || !DISCORD_OWNER_USER_ID || !DISCORD_X_REMINDER_CHANNEL_ID) {
    return null;
  }

  return {
    botToken: DISCORD_BOT_TOKEN,
    channelId: DISCORD_X_REMINDER_CHANNEL_ID,
    ownerId: DISCORD_OWNER_USER_ID,
  };
}

function discordMessageUrl(channelId: string, messageId: string): string {
  return `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
}

async function removeReminderButtons(
  credentials: ReminderCredentials,
  messageId: string,
): Promise<void> {
  const response = await fetch(discordMessageUrl(credentials.channelId, messageId), {
    body: JSON.stringify({ components: [] }),
    headers: {
      Authorization: `Bot ${credentials.botToken}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(`Discord message edit failed: ${response.status}`);
  }
}

function reminderContent(
  task: ReminderTask,
  match: ReminderMatch,
  credentials: ReminderCredentials,
  recapExists: boolean,
  isRereminder: boolean,
): string {
  const home = getTeamName(firstRelation(match.home_team), "ホーム");
  const away = getTeamName(firstRelation(match.away_team), "アウェイ");
  const competition = competitionLabel(firstRelation(match.competition));
  const contentType = task.kind === "prematch" ? "preview" : "recap";
  const title = task.kind === "prematch" ? "X投稿（試合前）" : "X投稿（試合後）";
  const lines = [
    `<@${credentials.ownerId}>`,
    `${isRereminder ? "【再】" : ""}${title}`,
    `${home} vs ${away}（${competition}）`,
    `キックオフ: ${formatJstDateTime(match.kickoff_at)} JST`,
    buildMatchShareUrl(match.id, {
      contentType,
      language: "ja",
      source: "x",
    }),
  ];

  if (task.kind === "postmatch" && !recapExists) {
    lines.push("記事はまだありません");
  }

  return lines.join("\n");
}

function reminderComponents(taskId: string): Array<{ components: DiscordButton[]; type: 1 }> {
  return [
    {
      components: [
        {
          custom_id: `x_post:${taskId}:posted`,
          label: "投稿した",
          style: 2,
          type: 2,
        },
        {
          custom_id: `x_post:${taskId}:skipped`,
          label: "今回は見送る",
          style: 2,
          type: 2,
        },
      ],
      type: 1,
    },
  ];
}

async function createDiscordReminder(
  task: ReminderTask,
  match: ReminderMatch,
  credentials: ReminderCredentials,
  recapExists: boolean,
  isRereminder: boolean,
): Promise<string> {
  const response = await fetch(
    `https://discord.com/api/v10/channels/${credentials.channelId}/messages`,
    {
      body: JSON.stringify({
        allowed_mentions: { users: [credentials.ownerId] },
        components: reminderComponents(task.id),
        content: reminderContent(
          task,
          match,
          credentials,
          recapExists,
          isRereminder,
        ),
      }),
      headers: {
        Authorization: `Bot ${credentials.botToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Discord message create failed: ${response.status}`);
  }

  const message = (await response.json()) as { id?: unknown };
  if (typeof message.id !== "string") {
    throw new Error("Discord message create response has no message id.");
  }

  return message.id;
}

async function createTasks(
  db: SupabaseClient<Database>,
  now: Date,
): Promise<number> {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_team:teams!matches_home_team_id_fkey ( name, name_ja, slug ),
        away_team:teams!matches_away_team_id_fkey ( name, name_ja, slug ),
        competition:competitions!matches_competition_id_fkey ( family, name, name_ja, season )
      `,
    )
    .gte("kickoff_at", new Date(now.getTime() - MATCH_WINDOW_PAST_MS).toISOString())
    .lte("kickoff_at", new Date(now.getTime() + MATCH_WINDOW_FUTURE_MS).toISOString())
    .in("status", ["scheduled", "finished"]);

  if (error) {
    throw error;
  }

  const matches = (data ?? []) as unknown as CandidateMatch[];
  const tasks = matches.flatMap((match) => {
    const competition = firstRelation(match.competition);
    if (
      (match.status !== "scheduled" && match.status !== "finished") ||
      !isInternationalCompetitionFamily(competition?.family ?? null)
    ) {
      return [];
    }

    const kickoffAt = new Date(match.kickoff_at);
    return [
      {
        due_at: prematchReminderDueAt(kickoffAt).toISOString(),
        kind: "prematch" as const,
        match_id: match.id,
      },
      {
        due_at: new Date(kickoffAt.getTime() + POSTMATCH_FALLBACK_DELAY_MS).toISOString(),
        kind: "postmatch" as const,
        match_id: match.id,
      },
    ];
  });

  if (tasks.length === 0) {
    return 0;
  }

  const { error: upsertError } = await db
    .from("x_post_tasks")
    .upsert(tasks, { ignoreDuplicates: true, onConflict: "match_id,kind" });

  if (upsertError) {
    throw upsertError;
  }

  return tasks.length;
}

async function advancePostmatchDueTimes(
  db: SupabaseClient<Database>,
): Promise<Map<string, boolean>> {
  const { data: taskData, error: taskError } = await db
    .from("x_post_tasks")
    .select("id, match_id, reminded_at")
    .eq("kind", "postmatch")
    .eq("status", "pending");

  if (taskError) {
    throw taskError;
  }

  const postmatchTasks = (taskData ?? []) as Array<{
    id: string;
    match_id: string;
    reminded_at: string | null;
  }>;
  const matchIds = [...new Set(postmatchTasks.map((task) => task.match_id))];
  const recapExistsByMatch = new Map<string, boolean>();
  if (matchIds.length === 0) {
    return recapExistsByMatch;
  }

  const { data: recapData, error: recapError } = await db
    .from("match_content")
    .select("match_id, generated_at")
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .in("match_id", matchIds)
    .order("generated_at", { ascending: false });

  if (recapError) {
    throw recapError;
  }

  const recaps = (recapData ?? []) as Array<{ generated_at: string; match_id: string }>;
  const latestRecapByMatch = new Map<string, string>();
  for (const recap of recaps) {
    if (!latestRecapByMatch.has(recap.match_id)) {
      latestRecapByMatch.set(recap.match_id, recap.generated_at);
      recapExistsByMatch.set(recap.match_id, true);
    }
  }

  for (const task of postmatchTasks) {
    const generatedAt = latestRecapByMatch.get(task.match_id);
    if (!generatedAt || task.reminded_at !== null) {
      continue;
    }

    const { error } = await db
      .from("x_post_tasks")
      .update({ due_at: generatedAt })
      .eq("id", task.id)
      .eq("status", "pending")
      .is("reminded_at", null);

    if (error) {
      throw error;
    }
  }

  return recapExistsByMatch;
}

async function loadPendingTasks(
  db: SupabaseClient<Database>,
): Promise<ReminderTask[]> {
  const { data, error } = await db
    .from("x_post_tasks")
    .select(
      `
        id,
        match_id,
        kind,
        status,
        due_at,
        reminded_at,
        re_reminded_at,
        discord_message_id,
        resolved_at,
        match:matches!x_post_tasks_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_team:teams!matches_home_team_id_fkey ( name, name_ja, slug ),
          away_team:teams!matches_away_team_id_fkey ( name, name_ja, slug ),
          competition:competitions!matches_competition_id_fkey ( family, name, name_ja, season )
        )
      `,
    )
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as ReminderTask[];
}

async function markExpiredTasks(
  db: SupabaseClient<Database>,
  tasks: ReminderTask[],
  credentials: ReminderCredentials,
  now: Date,
): Promise<{ failed: number; missed: number }> {
  let missed = 0;
  let failed = 0;

  for (const task of tasks) {
    if (task.status !== "pending") {
      continue;
    }

    const match = firstRelation(task.match);
    if (!match) {
      continue;
    }

    const kickoffAt = new Date(match.kickoff_at).getTime();
    const expired = task.kind === "prematch"
      ? now.getTime() >= kickoffAt
      : now.getTime() >= kickoffAt + POSTMATCH_TASK_EXPIRY_MS;
    if (!expired) {
      continue;
    }

    try {
      if (task.discord_message_id) {
        await removeReminderButtons(credentials, task.discord_message_id);
      }
      const { error } = await db
        .from("x_post_tasks")
        .update({ resolved_at: now.toISOString(), status: "missed" })
        .eq("id", task.id)
        .eq("status", "pending");

      if (error) {
        throw error;
      }
      task.status = "missed";
      task.resolved_at = now.toISOString();
      missed += 1;
    } catch (error) {
      console.error("[x-post-reminders] Failed to mark an expired task missed.", error);
      failed += 1;
    }
  }

  return { failed, missed };
}

async function sendReminders(
  db: SupabaseClient<Database>,
  tasks: ReminderTask[],
  recapExistsByMatch: Map<string, boolean>,
  credentials: ReminderCredentials,
  now: Date,
): Promise<{ failed: number; sent: number }> {
  let failed = 0;
  let sent = 0;
  const candidates = tasks.filter((task) => {
    const match = firstRelation(task.match);
    if (!match || task.status !== "pending") {
      return false;
    }

    const kickoffAt = new Date(match.kickoff_at).getTime();
    if (task.kind === "prematch" && now.getTime() >= kickoffAt) {
      return false;
    }

    return task.reminded_at === null && new Date(task.due_at).getTime() <= now.getTime();
  });

  const initial = candidates.filter((task) => task.reminded_at === null);
  const rereminders = isQuietHours(now)
    ? []
    : tasks.filter((task) => {
        const match = firstRelation(task.match);
        return (
          task.status === "pending" &&
          task.reminded_at !== null &&
          task.re_reminded_at === null &&
          new Date(task.reminded_at).getTime() <= now.getTime() - REREMINDER_DELAY_MS &&
          match !== null &&
          (task.kind !== "prematch" || now.getTime() < new Date(match.kickoff_at).getTime())
        );
      });

  const send = async (task: ReminderTask, isRereminder: boolean) => {
    const match = firstRelation(task.match);
    if (!match) {
      return;
    }

    try {
      const messageId = await createDiscordReminder(
        task,
        match,
        credentials,
        recapExistsByMatch.get(task.match_id) ?? false,
        isRereminder,
      );
      const update = isRereminder
        ? { re_reminded_at: now.toISOString() }
        : {
            discord_message_id: messageId,
            reminded_at: now.toISOString(),
          };
      const { error } = await db
        .from("x_post_tasks")
        .update(update)
        .eq("id", task.id)
        .eq("status", "pending");

      if (error) {
        throw error;
      }
      sent += 1;
    } catch (error) {
      console.error("[x-post-reminders] Failed to send an X post reminder.", error);
      failed += 1;
    }
  };

  for (const task of initial) {
    if (sent + failed >= REMINDER_LIMIT) {
      break;
    }
    await send(task, false);
  }
  for (const task of rereminders) {
    if (sent + failed >= REMINDER_LIMIT) {
      break;
    }
    await send(task, true);
  }

  return { failed, sent };
}

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const now = new Date();
  const db = getSupabaseServerClient();

  try {
    const created = await createTasks(db, now);
    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json({ created, failed: 0, missed: 0, sent: 0 });
    }

    const recapExistsByMatch = await advancePostmatchDueTimes(db);
    const pendingTasks = await loadPendingTasks(db);
    const missed = await markExpiredTasks(db, pendingTasks, credentials, now);
    const reminders = await sendReminders(
      db,
      pendingTasks,
      recapExistsByMatch,
      credentials,
      now,
    );
    const failed = missed.failed + reminders.failed;
    const summary = {
      created,
      failed,
      missed: missed.missed,
      sent: reminders.sent,
    };

    if (failed > 0) {
      return NextResponse.json(
        { data: summary, error: "x_post_reminder_failed", success: false },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: summary, success: true });
  } catch (error) {
    console.error("[x-post-reminders] Failed to run X post reminders.", error);
    return NextResponse.json(
      { data: null, error: "x_post_reminder_failed", success: false },
      { status: 500 },
    );
  }
}
