/**
 * Backfill competition standings from Wikipedia.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-standings.ts --family=urc --season=2025-26 --dry-run
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertCompetitionStandings } from "@/lib/ingestion/standings";
import {
  scrapeCompetitionStandings,
  type ParsedStandingsRow,
} from "@/lib/scrapers/wikipedia-standings";
import {
  mapWikipediaTeamName,
  normalizeWikipediaTeamName,
} from "@/lib/scrapers/wikipedia-team-name-map";

export type SupportedFamily =
  | "autumn-nations"
  | "league-one"
  | "nations-championship"
  | "pnc"
  | "premiership"
  | "rugby-championship"
  | "six-nations"
  | "super-rugby-pacific"
  | "top-14"
  | "urc";

type CliOptions = {
  dryRun: boolean;
  family: SupportedFamily;
  ownerApproved: boolean;
  season: string;
};

type CompetitionRow = {
  id: string;
  slug: string;
};

export type StandingsTeamRow = {
  englishName: string | null;
  id: string;
  name: string;
  slug: string;
};

type MatchTeamIdsDbRow = {
  away_team_id: string;
  home_team_id: string;
};

type TeamDbRow = {
  english_name: string | null;
  id: string;
  name: string;
  slug: string;
};

export const SUPPORTED_FAMILIES = new Set<SupportedFamily>([
  "autumn-nations",
  "league-one",
  "nations-championship",
  "pnc",
  "premiership",
  "rugby-championship",
  "six-nations",
  "super-rugby-pacific",
  "top-14",
  "urc",
]);

const USAGE =
  "Usage: pnpm tsx scripts/backfill-standings.ts --family=<family> --season=<season> [--dry-run] [--confirm-owner-approved]";

function comparisonKey(value: string) {
  return normalizeWikipediaTeamName(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function resolveWikipediaStandingsUrl(
  family: SupportedFamily,
  season: string,
) {
  const rangeSeason = season.replace("-", "–");

  switch (family) {
    case "autumn-nations":
      return Number(season.slice(0, 4)) >= 2025
        ? `https://en.wikipedia.org/wiki/${season}_end-of-year_rugby_union_internationals`
        : `https://en.wikipedia.org/wiki/${season}_Autumn_Nations_Series`;
    case "league-one":
      return `https://es.wikipedia.org/wiki/Japan_Rugby_League_One_${season}`;
    case "nations-championship":
      return `https://en.wikipedia.org/wiki/${season}_Nations_Championship`;
    case "pnc":
      return `https://en.wikipedia.org/wiki/${season}_World_Rugby_Pacific_Nations_Cup`;
    case "premiership":
      return `https://en.wikipedia.org/wiki/${rangeSeason}_Premiership_Rugby`;
    case "rugby-championship":
      return `https://en.wikipedia.org/wiki/${season}_Rugby_Championship`;
    case "six-nations":
      return `https://en.wikipedia.org/wiki/${season}_Six_Nations_Championship`;
    case "super-rugby-pacific":
      return `https://en.wikipedia.org/wiki/${season}_Super_Rugby_Pacific_season`;
    case "top-14":
      return `https://en.wikipedia.org/wiki/${rangeSeason}_Top_14_season`;
    case "urc":
      return `https://en.wikipedia.org/wiki/${rangeSeason}_United_Rugby_Championship`;
  }
}

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let family: string | null = null;
  let ownerApproved = false;
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      continue;
    }

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length);
      continue;
    }

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length);
      continue;
    }

    throw new Error(USAGE);
  }

  if (!family || !SUPPORTED_FAMILIES.has(family as SupportedFamily)) {
    throw new Error(USAGE);
  }

  if (!season || !/^\d{4}(?:-\d{2})?$/.test(season)) {
    throw new Error(USAGE);
  }

  return {
    dryRun,
    family: family as SupportedFamily,
    ownerApproved,
    season,
  };
}

export function buildStandingsTeamLookup(
  rows: ParsedStandingsRow[],
  teams: StandingsTeamRow[],
) {
  const teamByAlias = new Map<string, string>();

  for (const team of teams) {
    const aliases = [
      team.name,
      team.englishName,
      team.slug.replace(/-/g, " "),
    ].filter((value): value is string => Boolean(value));

    for (const alias of aliases) {
      teamByAlias.set(comparisonKey(alias), team.id);
    }
  }

  return Object.fromEntries(
    rows.flatMap((row) => {
      const rawKey = comparisonKey(row.teamName);
      const mappedKey = comparisonKey(mapWikipediaTeamName(row.teamName));
      const teamId = teamByAlias.get(rawKey) ?? teamByAlias.get(mappedKey);

      return teamId ? [[row.teamName, teamId]] : [];
    }),
  );
}

export function collectCompetitionTeamIds(matches: MatchTeamIdsDbRow[]) {
  const teamIds = new Set<string>();

  for (const match of matches) {
    teamIds.add(match.home_team_id);
    teamIds.add(match.away_team_id);
  }

  return [...teamIds];
}

export function selectStandingsTeamCandidates(
  rows: ParsedStandingsRow[],
  teams: StandingsTeamRow[],
  competitionTeamIds: string[],
) {
  const competitionTeamIdSet = new Set(competitionTeamIds);
  const selectedTeams = new Map<string, StandingsTeamRow>();

  for (const row of rows) {
    const rawKey = comparisonKey(row.teamName);
    const mappedKey = comparisonKey(mapWikipediaTeamName(row.teamName));
    const rawCandidates: StandingsTeamRow[] = [];
    const mappedCandidates: StandingsTeamRow[] = [];

    for (const team of teams) {
      const aliasKeys = [
        team.name,
        team.englishName,
        team.slug.replace(/-/g, " "),
      ]
        .filter((value): value is string => Boolean(value))
        .map(comparisonKey);

      if (aliasKeys.includes(rawKey)) {
        rawCandidates.push(team);
      }

      if (mappedKey !== rawKey && aliasKeys.includes(mappedKey)) {
        mappedCandidates.push(team);
      }
    }

    const candidates =
      rawCandidates.length > 0 ? rawCandidates : mappedCandidates;
    const competitionCandidates = candidates.filter((team) =>
      competitionTeamIdSet.has(team.id),
    );
    const selected =
      candidates.length === 1
        ? candidates[0]
        : competitionCandidates.length === 1
          ? competitionCandidates[0]
          : null;

    if (selected) {
      selectedTeams.set(selected.id, selected);
    }
  }

  return [...selectedTeams.values()];
}

export function buildResolvedStandingsTeamLookup(
  rows: ParsedStandingsRow[],
  teams: StandingsTeamRow[],
  competitionTeamIds: string[],
) {
  return Object.assign(
    {},
    ...rows.map((row) =>
      buildStandingsTeamLookup(
        [row],
        selectStandingsTeamCandidates([row], teams, competitionTeamIds),
      ),
    ),
  ) as Record<string, string>;
}

export function warnUnmatchedStandingsTeams(
  rows: ParsedStandingsRow[],
  teamLookup: Record<string, string>,
) {
  for (const row of rows) {
    if (!teamLookup[row.teamName]) {
      console.warn("[standings] unmatched team", {
        name: row.teamName,
      });
    }
  }
}

export function buildCompetitionPoolAssignments(
  rows: ParsedStandingsRow[],
  teamLookup: Record<string, string>,
) {
  const assignments = new Map<string, { poolName: string; teamId: string }>();

  for (const row of rows) {
    if (!row.poolName) {
      continue;
    }

    const teamId = teamLookup[row.teamName];
    if (!teamId) {
      continue;
    }

    assignments.set(teamId, {
      poolName: row.poolName,
      teamId,
    });
  }

  return [...assignments.values()];
}

export async function upsertCompetitionPoolsForStandings(params: {
  competitionId: string;
  rows: ParsedStandingsRow[];
  teamLookup: Record<string, string>;
}) {
  const assignments = buildCompetitionPoolAssignments(
    params.rows,
    params.teamLookup,
  );

  if (assignments.length === 0) {
    return { upserted: 0 };
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competition_pools")
    .upsert(
      assignments.map((assignment) => ({
        competition_id: params.competitionId,
        pool_name: assignment.poolName,
        team_id: assignment.teamId,
      })),
      { onConflict: "competition_id,team_id" },
    )
    .select("id");

  if (error) {
    throw error;
  }

  return { upserted: data?.length ?? 0 };
}

async function loadCompetition(
  family: SupportedFamily,
  season: string,
): Promise<CompetitionRow> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competitions")
    .select("id, slug")
    .eq("family", family)
    .eq("season", season)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Competition not found: ${family} ${season}`);
  }

  return data;
}

async function loadStandingsTeamResolutionData(
  competitionId: string,
) {
  const db = getSupabaseServerClient();
  const [
    { data: matches, error: matchesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    db
      .from("matches")
      .select("home_team_id, away_team_id")
      .eq("competition_id", competitionId),
    db.from("teams").select("id, name, english_name, slug"),
  ]);

  if (matchesError) {
    throw matchesError;
  }

  if (teamsError) {
    throw teamsError;
  }

  return {
    competitionTeamIds: collectCompetitionTeamIds(
      (matches ?? []) as MatchTeamIdsDbRow[],
    ),
    teams: ((teams ?? []) as TeamDbRow[]).map((team) => ({
      englishName: team.english_name,
      id: team.id,
      name: team.name,
      slug: team.slug,
    })),
  };
}

export async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.dryRun && !options.ownerApproved) {
    throw new Error(
      "Standings backfill requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  const sourceUrl = resolveWikipediaStandingsUrl(
    options.family,
    options.season,
  );
  const [competition, rows] = await Promise.all([
    loadCompetition(options.family, options.season),
    scrapeCompetitionStandings(sourceUrl),
  ]);
  const { competitionTeamIds, teams } =
    await loadStandingsTeamResolutionData(competition.id);
  const teamLookup = buildResolvedStandingsTeamLookup(
    rows,
    teams,
    competitionTeamIds,
  );
  const matchedRows = rows.filter((row) => teamLookup[row.teamName]);

  console.log(
    `Standings target: family=${options.family} season=${options.season} parsed=${rows.length} matched=${matchedRows.length} source=${sourceUrl} dry_run=${options.dryRun}`,
  );

  warnUnmatchedStandingsTeams(rows, teamLookup);

  if (options.dryRun) {
    return;
  }

  if (rows.length === 0) {
    throw new Error(`No standings rows parsed from ${sourceUrl}`);
  }

  const result = await upsertCompetitionStandings({
    competitionId: competition.id,
    rows,
    teamLookup,
  });
  const poolResult = await upsertCompetitionPoolsForStandings({
    competitionId: competition.id,
    rows,
    teamLookup,
  });

  console.log(
    `Standings backfill complete: competition=${competition.slug} upserted=${result.upserted} pools=${poolResult.upserted}`,
  );
}

if (process.argv[1]?.endsWith("backfill-standings.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
