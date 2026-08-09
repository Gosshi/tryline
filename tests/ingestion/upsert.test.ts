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
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
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
    expect(resultsRun.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previousStatus: "scheduled",
          status: "finished",
          statusChangedToFinished: true,
        }),
      ]),
    );

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

  it("keeps repeated Wikipedia fixtures between the same teams distinct", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-six-nations-2027.html",
    );
    const html = readFileSync(fixturePath, "utf8");
    const [baseCandidate] = await resolveMatches(
      parseWikipediaSixNations2027Html(html),
    );
    const service = getSupabaseServerClient();
    const eventIds = ["First_test", "Second_test", "Third_test", "Fourth_test"];
    const kickoffDates = ["22", "29", "05", "12"];
    const repeatedCandidates = eventIds.map((eventId, index) => ({
      ...baseCandidate!,
      externalIds: {
        wikipedia_event_id: eventId,
      },
      kickoffAt:
        index < 2
          ? `2029-08-${kickoffDates[index]}T15:10:00.000Z`
          : `2029-09-${kickoffDates[index]}T15:10:00.000Z`,
      status: "scheduled" as const,
    }));

    const firstRun = await upsertMatches(repeatedCandidates);
    const secondRun = await upsertMatches(repeatedCandidates);

    expect(firstRun.matchesInserted).toBe(4);
    expect(firstRun.matchesUpdated).toBe(0);
    expect(secondRun.matchesInserted).toBe(0);
    expect(secondRun.matchesUpdated).toBe(4);

    const repeatedMatches = await service
      .from("matches")
      .select("kickoff_at, external_ids")
      .eq("competition_id", baseCandidate!.competitionId)
      .eq("home_team_id", baseCandidate!.homeTeamId)
      .eq("away_team_id", baseCandidate!.awayTeamId)
      .in("kickoff_at", repeatedCandidates.map((candidate) => candidate.kickoffAt));

    expect(repeatedMatches.error).toBeNull();
    expect(repeatedMatches.data).toHaveLength(4);
    expect(
      repeatedMatches.data?.map(
        (match) =>
          (match.external_ids as Record<string, Json>).wikipedia_event_id,
      ),
    ).toEqual(expect.arrayContaining(eventIds));
  });

  it("preserves finished scores when a later source has no score", async () => {
    const [baseCandidate] = await resolveMatches(
      parseWikipediaSixNations2027Html(
        readFileSync(
          path.join(
            process.cwd(),
            "tests/fixtures/wikipedia-six-nations-2027.html",
          ),
          "utf8",
        ),
      ),
    );
    const service = getSupabaseServerClient();
    const finishedCandidate = {
      ...baseCandidate!,
      awayScore: 35,
      externalIds: { wikipedia_event_id: "lipovitan-score-preservation" },
      homeScore: 32,
      kickoffAt: "2030-08-08T10:05:00.000Z",
      status: "finished" as const,
    };

    await upsertMatches([finishedCandidate]);
    await upsertMatches([
      {
        ...finishedCandidate,
        awayScore: null,
        homeScore: null,
        status: "scheduled",
      },
    ]);

    const { data, error } = await service
      .from("matches")
      .select("away_score, home_score, status")
      .contains("external_ids", {
        wikipedia_event_id: "lipovitan-score-preservation",
      })
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      away_score: 35,
      home_score: 32,
      status: "finished",
    });
  });
});
