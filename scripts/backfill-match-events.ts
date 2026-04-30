import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import {
  buildMatchWikipediaUrl,
  scrapeMatchEvents,
} from "@/lib/scrapers/wikipedia-match-events";

type CliOptions = {
  dryRun: boolean;
  year: string | null;
};

type CompetitionRow = {
  id: string;
  season: string;
  slug: string;
};

type MatchRow = {
  away_team_id: string;
  away_team: { name: string } | null;
  competition_id: string;
  home_team_id: string;
  home_team: { name: string } | null;
  id: string;
  match_events: Array<{ id: string }>;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseOptions(argv: string[]): CliOptions {
  let year: string | null = null;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--year") {
      year = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--year=")) {
      year = arg.slice("--year=".length);
      continue;
    }

    console.error(
      "Usage: pnpm tsx scripts/backfill-match-events.ts [--year=2022] [--dry-run]",
    );
    process.exit(1);
  }

  if (year !== null && !/^\d{4}$/.test(year)) {
    console.error(`Invalid --year value: ${year}`);
    process.exit(1);
  }

  return { dryRun, year };
}

async function loadCompetitions(year: string | null) {
  const db = getSupabaseServerClient();
  let query = db
    .from("competitions")
    .select("id, season, slug")
    .like("slug", "six-nations-%");

  if (year) {
    query = query.eq("season", year);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as CompetitionRow[];
}

async function loadTargetMatches(competitions: CompetitionRow[]) {
  if (competitions.length === 0) {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        competition_id,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id)
      `,
    )
    .eq("status", "finished")
    .in(
      "competition_id",
      competitions.map((competition) => competition.id),
    )
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MatchRow[]).filter(
    (match) => match.match_events.length === 0,
  );
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const competitions = await loadCompetitions(options.year);
  const competitionById = new Map(
    competitions.map((competition) => [competition.id, competition]),
  );
  const matches = await loadTargetMatches(competitions);
  let eventsFound = 0;
  let eventsInserted = 0;

  console.log(
    `Target finished Six Nations matches without events: ${matches.length}`,
  );

  for (const [index, match] of matches.entries()) {
    const competition = competitionById.get(match.competition_id);
    const homeTeamName = match.home_team?.name;
    const awayTeamName = match.away_team?.name;

    if (!competition || !homeTeamName || !awayTeamName) {
      console.warn(`Skipping match with missing competition/team data: ${match.id}`);
      continue;
    }

    const matchUrl = buildMatchWikipediaUrl({
      awayTeamName,
      homeTeamName,
      year: competition.season,
    });
    const events = await scrapeMatchEvents(matchUrl);

    eventsFound += events.length;

    if (options.dryRun) {
      console.log(
        `[dry-run] ${competition.season} ${homeTeamName} v ${awayTeamName}: ${events.length} events`,
      );
    } else {
      const result = await upsertMatchEvents({
        awayTeamId: match.away_team_id,
        events,
        homeTeamId: match.home_team_id,
        matchId: match.id,
      });

      eventsInserted += result.inserted;
      console.log(
        `Inserted ${result.inserted} events for ${competition.season} ${homeTeamName} v ${awayTeamName}`,
      );
    }

    if (index < matches.length - 1) {
      await sleep(1_000);
    }
  }

  console.log(
    `Backfill match events complete: target_matches=${matches.length} events_found=${eventsFound} events_inserted=${eventsInserted} dry_run=${options.dryRun}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
