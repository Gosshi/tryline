import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { getSupabaseServerClient } from "@/lib/db/server";
import { parseWikipediaSixNations2027Html } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import { upsertMatches } from "@/lib/ingestion/upsert";

import { ensureSupabaseTestEnvironment } from "../db/helpers";

import type { Json } from "@/lib/db/types";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

function toExternalIds(match: ParsedWikipediaMatch): Record<string, Json> {
  const externalIds: Record<string, Json> = {};

  if (match.round !== null) {
    externalIds.wikipedia_round = match.round;
  }

  if (match.eventId) {
    externalIds.wikipedia_event_id = match.eventId;
  }

  return externalIds;
}

async function resolveMatches(parsedMatches: ParsedWikipediaMatch[]) {
  const service = getSupabaseServerClient();
  const competition = await service
    .from("competitions")
    .select("id")
    .eq("slug", "six-nations-2027")
    .single();

  expect(competition.error).toBeNull();

  const teams = await service
    .from("teams")
    .select("id, name")
    .in(
      "name",
      parsedMatches.flatMap((match) => [
        match.homeTeamName,
        match.awayTeamName,
      ]),
    );

  expect(teams.error).toBeNull();

  const teamLookup = Object.fromEntries(
    (teams.data ?? []).map((team) => [team.name, team.id]),
  );

  return parsedMatches.map((match) => ({
    awayScore: match.awayScore,
    awayTeamId: teamLookup[match.awayTeamName]!,
    competitionId: competition.data!.id,
    externalIds: toExternalIds(match),
    homeScore: match.homeScore,
    homeTeamId: teamLookup[match.homeTeamName]!,
    kickoffAt: match.kickoffAt,
    status: match.status,
    venue: match.venue,
  }));
}

describe("upsertMatches", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("deduplicates repeated fixture ingestion and updates scores on later result ingestion", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-six-nations-2027.html",
    );
    const html = readFileSync(fixturePath, "utf8");
    const parsedMatches = parseWikipediaSixNations2027Html(html);
    const service = getSupabaseServerClient();

    const scheduledOnly = parsedMatches.map((match) => ({
      ...match,
      awayScore: null,
      homeScore: null,
      status: "scheduled" as const,
    }));
    const scheduledCandidates = await resolveMatches(scheduledOnly);

    const firstRun = await upsertMatches(scheduledCandidates);
    const secondRun = await upsertMatches(scheduledCandidates);

    expect(firstRun.matchesInserted).toBe(2);
    expect(firstRun.matchesUpdated).toBe(0);
    expect(secondRun.matchesInserted).toBe(0);
    expect(secondRun.matchesUpdated).toBe(2);

    const matchesAfterFixtures = await service
      .from("matches")
      .select("id")
      .eq("competition_id", scheduledCandidates[0]!.competitionId)
      .in(
        "home_team_id",
        scheduledCandidates.map((candidate) => candidate.homeTeamId),
      );

    expect(matchesAfterFixtures.error).toBeNull();
    expect(matchesAfterFixtures.data).toHaveLength(2);

    const finishedCandidates = await resolveMatches(parsedMatches);
    const resultsRun = await upsertMatches(finishedCandidates, {
      insertMissing: false,
    });

    expect(resultsRun.matchesInserted).toBe(0);
    expect(resultsRun.matchesUpdated).toBe(2);

    const updatedMatch = await service
      .from("matches")
      .select("home_score, away_score, status, external_ids")
      .eq("competition_id", scheduledCandidates[0]!.competitionId)
      .eq("venue", "Stade de France, Saint-Denis")
      .single();

    expect(updatedMatch.error).toBeNull();
    expect(updatedMatch.data).toMatchObject({
      away_score: 13,
      home_score: 27,
      status: "finished",
    });
    expect(updatedMatch.data?.external_ids).toMatchObject({
      wikipedia_event_id: "France_v_Wales",
      wikipedia_round: 1,
    });
  });
});
