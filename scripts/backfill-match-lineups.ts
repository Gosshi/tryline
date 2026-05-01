import { getSupabaseServerClient } from "@/lib/db/server";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers";
import {
  parseLineupFromTableHtml,
  type WikipediaMatchLineup,
} from "@/lib/scrapers/wikipedia-lineups";

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
  id: string;
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  match_lineups: Array<{ id: string }>;
};

type PlayerRow = {
  id: string;
  name: string;
};

type LineupRow = {
  match_id: string;
  team_id: string;
  player_id: string;
  jersey_number: number;
  announced_at: string;
  source_url: string;
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
      "Usage: node --env-file=.env.local tools/run-ts.cjs scripts/backfill-match-lineups.ts [--year=2025] [--dry-run]",
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
        match_lineups(id)
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
    (match) => match.match_lineups.length === 0,
  );
}

async function ensurePlayerIds(
  teamId: string,
  names: string[],
): Promise<Map<string, string>> {
  const db = getSupabaseServerClient();
  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const { data: existing, error: existingError } = await db
    .from("players")
    .select("id, name")
    .eq("team_id", teamId)
    .in("name", uniqueNames);

  if (existingError) {
    throw existingError;
  }

  const existingByName = new Map(
    ((existing ?? []) as PlayerRow[]).map((player) => [player.name, player.id]),
  );
  const missingNames = uniqueNames.filter((name) => !existingByName.has(name));

  if (missingNames.length > 0) {
    const { error: insertError } = await db.from("players").insert(
      missingNames.map((name) => ({
        team_id: teamId,
        name,
        external_ids: { wikipedia_title: name },
      })),
    );

    if (insertError) {
      throw insertError;
    }

    const { data: inserted, error: insertedError } = await db
      .from("players")
      .select("id, name")
      .eq("team_id", teamId)
      .in("name", missingNames);

    if (insertedError) {
      throw insertedError;
    }

    ((inserted ?? []) as PlayerRow[]).forEach((player) => {
      existingByName.set(player.name, player.id);
    });
  }

  return existingByName;
}

function buildLineupRows(params: {
  match: MatchRow;
  homePlayerIds: Map<string, string>;
  awayPlayerIds: Map<string, string>;
  lineup: WikipediaMatchLineup;
}) {
  const homeRows = params.lineup.home_players.flatMap((player) => {
    const playerId = params.homePlayerIds.get(player.name);

    if (!playerId) {
      return [];
    }

    return [
      {
        match_id: params.match.id,
        team_id: params.match.home_team_id,
        player_id: playerId,
        jersey_number: player.jersey_number,
        announced_at: params.lineup.announced_at,
        source_url: params.lineup.source_url,
      },
    ];
  });

  const awayRows = params.lineup.away_players.flatMap((player) => {
    const playerId = params.awayPlayerIds.get(player.name);

    if (!playerId) {
      return [];
    }

    return [
      {
        match_id: params.match.id,
        team_id: params.match.away_team_id,
        player_id: playerId,
        jersey_number: player.jersey_number,
        announced_at: params.lineup.announced_at,
        source_url: params.lineup.source_url,
      },
    ];
  });

  return { awayRows, homeRows };
}

async function upsertLineupRows(rows: LineupRow[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getSupabaseServerClient();
  const { error } = await db
    .from("match_lineups")
    .upsert(rows, { onConflict: "match_id,team_id,jersey_number" });

  if (error) {
    throw error;
  }
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
    `Target finished Six Nations matches without lineups: ${matches.length}`,
  );

  let withLineups = 0;
  let skipped = 0;
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

    let lineupTableByKey: Map<string, string | null>;
    try {
      const response = await fetchWithPolicy(pageUrl);
      const html = await response.text();
      const parsedMatches = parseWikipediaSixNationsHtml(html);
      lineupTableByKey = new Map(
        parsedMatches.map((m) => [
          `${m.homeTeamName}_${m.awayTeamName}`,
          m.lineupTableHtml,
        ]),
      );
    } catch (error) {
      console.warn(
        `Unable to fetch season page for ${competition.slug}:`,
        error,
      );
      skipped += competitionMatches.length;
      continue;
    }

    for (const match of competitionMatches) {
      const homeTeamName = match.home_team?.name;
      const awayTeamName = match.away_team?.name;

      if (!homeTeamName || !awayTeamName) {
        console.warn(`Skipping match with missing team data: ${match.id}`);
        skipped += 1;
        continue;
      }

      const lineupTableHtml = lineupTableByKey.get(
        `${homeTeamName}_${awayTeamName}`,
      );

      if (lineupTableHtml === undefined) {
        console.warn(
          `No vevent found for ${competition.season} ${homeTeamName} v ${awayTeamName}`,
        );
        skipped += 1;
        continue;
      }

      if (lineupTableHtml === null) {
        console.warn(
          `Lineup not found for ${competition.season} ${homeTeamName} v ${awayTeamName} (skipped)`,
        );
        skipped += 1;
        continue;
      }

      const lineup = parseLineupFromTableHtml(lineupTableHtml, pageUrl);

      if (!lineup) {
        console.warn(
          `Lineup not found for ${competition.season} ${homeTeamName} v ${awayTeamName} (skipped)`,
        );
        skipped += 1;
        continue;
      }

      if (options.dryRun) {
        withLineups += 1;
        console.log(
          `[dry-run] ${competition.season} ${homeTeamName} v ${awayTeamName}: home=${lineup.home_players.length} away=${lineup.away_players.length}`,
        );
        continue;
      }

      const homePlayerIds = await ensurePlayerIds(
        match.home_team_id,
        lineup.home_players.map((player) => player.name),
      );
      const awayPlayerIds = await ensurePlayerIds(
        match.away_team_id,
        lineup.away_players.map((player) => player.name),
      );
      const { awayRows, homeRows } = buildLineupRows({
        awayPlayerIds,
        homePlayerIds,
        lineup,
        match,
      });

      await upsertLineupRows([...homeRows, ...awayRows]);
      withLineups += 1;

      console.log(
        `Inserted lineups for ${competition.season} ${homeTeamName} v ${awayTeamName}: home=${homeRows.length} away=${awayRows.length}`,
      );
    }
  }

  console.log(
    `Backfill complete: target_matches=${matches.length} with_lineups=${withLineups} skipped=${skipped} dry_run=${options.dryRun}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
