import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

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
  const matches = await loadTargetMatches(competitions);

  const matchesByCompetition = new Map<string, MatchRow[]>();
  for (const match of matches) {
    const group = matchesByCompetition.get(match.competition_id) ?? [];
    group.push(match);
    matchesByCompetition.set(match.competition_id, group);
  }

  console.log(
    `Target finished Six Nations matches without events: ${matches.length}`,
  );

  let eventsFound = 0;
  let eventsInserted = 0;
  let firstSeason = true;

  for (const competition of competitions) {
    const competitionMatches = matchesByCompetition.get(competition.id) ?? [];

    if (competitionMatches.length === 0) {
      continue;
    }

    if (!firstSeason) {
      await sleep(1_000);
    }
    firstSeason = false;

    const year = competition.slug.replace("six-nations-", "");
    const pageUrl = `https://en.wikipedia.org/wiki/${year}_Six_Nations_Championship`;

    let veventByKey: Map<string, string>;
    try {
      const response = await fetchWithPolicy(pageUrl);
      const html = await response.text();
      const parsedMatches = parseWikipediaSixNationsHtml(html);
      veventByKey = new Map(
        parsedMatches.map((m) => [
          `${m.homeTeamName}_${m.awayTeamName}`,
          m.rawHtml,
        ]),
      );
    } catch (error) {
      console.warn(
        `Unable to fetch season page for ${competition.slug}:`,
        error,
      );
      continue;
    }

    for (const match of competitionMatches) {
      const homeTeamName = match.home_team?.name;
      const awayTeamName = match.away_team?.name;

      if (!homeTeamName || !awayTeamName) {
        console.warn(`Skipping match with missing team data: ${match.id}`);
        continue;
      }

      const rawHtml = veventByKey.get(`${homeTeamName}_${awayTeamName}`);

      if (!rawHtml) {
        console.warn(
          `No vevent found for ${competition.season} ${homeTeamName} v ${awayTeamName}`,
        );
        continue;
      }

      const events = parseMatchEventsFromVeventHtml(rawHtml);
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
