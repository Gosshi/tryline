/**
 * Compare a competition guide's team mentions with the corresponding season's
 * standings (or, when standings are unavailable, match schedule) data.
 *
 * Read-only usage:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-competition-guide-facts.ts \
 *     --family nations-championship --season 2026
 *
 * This tool never changes guides or database data. Its findings are candidates
 * for Owner review, not automatic corrections.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";
import { JAPANESE_TEAM_NAMES_BY_SLUG } from "@/lib/format/japanese-names";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT_DIR = "tmp/competition-guide-audit";
const CONTEXT_RADIUS = 60;
const REVIEW_NOTE =
  "実データに無いことだけでガイドの誤りとは限りません。過去大会の優勝国・対戦相手など、現在の参加者ではない正しい言及もあり得るため、周辺文と確認先URLをOwnerが確認してください。";

type Coverage = "complete" | "incomplete";
type DataSource = "competition_standings" | "matches" | "none";

type CompetitionGuideRow = {
  family: string;
  guide_ja: string;
  source_url: string | null;
  updated_at: string;
  verified_at: string | null;
};

type CompetitionRow = {
  id: string;
  slug: string;
};

type StandingRow = {
  competition_id: string;
  team_id: string;
};

type MatchRow = {
  away_team_id: string;
  competition_id: string;
  home_team_id: string;
};

export type GuideAuditTeam = {
  englishName: string | null;
  id: string;
  name: string;
  nameJa: string | null;
  slug: string;
};

type TeamRow = {
  english_name: string | null;
  id: string;
  name: string;
  name_ja: string | null;
  slug: string;
};

export type CompetitionGuideAuditOptions = {
  family: string;
  outputDir: string;
  season: string;
};

export type GuideMentionClassification =
  | "guide_only_candidate"
  | "historical_or_opponent_mention";

export type GuideMentionFinding = {
  candidateName: string;
  classification: GuideMentionClassification;
  confirmationUrl: string | null;
  context: string;
  dataSource: DataSource;
  family: string;
  guideUpdatedAt: string;
  matchedAlias: string;
  reason: string;
  retrievedAt: string;
  season: string;
  teamId: string;
  teamSlug: string;
};

export type DataOnlyTeamFinding = {
  candidateName: string;
  classification: "data_only";
  confirmationUrl: string | null;
  context: string;
  dataSource: DataSource;
  family: string;
  guideUpdatedAt: string;
  reason: string;
  retrievedAt: string;
  season: string;
  teamId: string;
  teamSlug: string;
};

export type CompetitionGuideAuditReport = {
  actualDataTeams: Array<{
    name: string;
    slug: string;
  }>;
  coverage: Coverage;
  coverageReason: string;
  dataOnlyTeams: DataOnlyTeamFinding[];
  dataSource: DataSource;
  family: string;
  guideOnlyCandidates: GuideMentionFinding[];
  guideUpdatedAt: string;
  historicalOrOpponentMentions: GuideMentionFinding[];
  note: string;
  retrievedAt: string;
  season: string;
  sourceUrl: string | null;
  verifiedAt: string | null;
};

type Mention = {
  alias: string;
  context: string;
  index: number;
  sentence: string;
  team: GuideAuditTeam;
};

function parseRequiredValue(argv: string[], option: string): string | null {
  const equalsPrefix = `${option}=`;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === option) {
      return argv[index + 1] ?? null;
    }

    if (argument?.startsWith(equalsPrefix)) {
      return argument.slice(equalsPrefix.length) || null;
    }
  }

  return null;
}

export function parseArgs(argv: string[]): CompetitionGuideAuditOptions {
  const family = parseRequiredValue(argv, "--family");
  const season = parseRequiredValue(argv, "--season");
  const outputDir =
    parseRequiredValue(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR;

  if (!family || !season) {
    throw new Error(
      "Usage: audit-competition-guide-facts.ts --family <family> --season <season> [--output-dir <directory>]",
    );
  }

  return { family, outputDir, season };
}

function toAuditTeam(row: TeamRow): GuideAuditTeam {
  return {
    englishName: row.english_name,
    id: row.id,
    name: row.name,
    nameJa: row.name_ja,
    slug: row.slug,
  };
}

function displayName(team: GuideAuditTeam): string {
  return team.nameJa ?? JAPANESE_TEAM_NAMES_BY_SLUG[team.slug] ?? team.name;
}

function aliasesForTeam(team: GuideAuditTeam): string[] {
  return [
    team.name,
    team.nameJa,
    team.englishName,
    JAPANESE_TEAM_NAMES_BY_SLUG[team.slug],
    team.slug.replaceAll("-", " "),
  ].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasLatinOrDigit(value: string): boolean {
  return /[A-Za-z0-9]/.test(value);
}

function createAliasMatcher(alias: string): RegExp {
  const escaped = escapeRegExp(alias);

  return hasLatinOrDigit(alias)
    ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi")
    : new RegExp(escaped, "g");
}

export function contextAround(
  guide: string,
  index: number,
  length: number,
): string {
  return guide
    .slice(
      Math.max(0, index - CONTEXT_RADIUS),
      Math.min(guide.length, index + length + CONTEXT_RADIUS),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceAround(guide: string, index: number, length: number): string {
  const before = guide.slice(0, index);
  const after = guide.slice(index + length);
  const start = Math.max(
    before.lastIndexOf("。"),
    before.lastIndexOf("！"),
    before.lastIndexOf("？"),
    before.lastIndexOf("\n"),
  );
  const endOffsets = [
    after.indexOf("。"),
    after.indexOf("！"),
    after.indexOf("？"),
    after.indexOf("\n"),
  ].filter((offset) => offset >= 0);
  const end =
    endOffsets.length > 0
      ? index + length + Math.min(...endOffsets) + 1
      : guide.length;

  return guide
    .slice(start + 1, end)
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyGuideMention(
  context: string,
): GuideMentionClassification {
  if (/参加|出場|チーム|代表|\d+カ国|名を連ね/.test(context)) {
    return "guide_only_candidate";
  }

  if (/\d{4}年|歴代|伝説|名場面|対戦|[戦勝敗]|優勝|トライ|決勝/.test(context)) {
    return "historical_or_opponent_mention";
  }

  return "guide_only_candidate";
}

export function extractGuideTeamMentions(
  guide: string,
  teams: GuideAuditTeam[],
): Mention[] {
  const mentions: Mention[] = [];
  const seen = new Set<string>();

  const aliases = teams
    .flatMap((team) => aliasesForTeam(team).map((alias) => ({ alias, team })))
    .sort((left, right) => right.alias.length - left.alias.length);

  for (const { alias, team } of aliases) {
    const matcher = createAliasMatcher(alias);

    for (const match of guide.matchAll(matcher)) {
      const index = match.index;

      if (index === undefined) {
        continue;
      }

      const key = `${team.id}\u0000${index}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      mentions.push({
        alias,
        context: contextAround(guide, index, alias.length),
        index,
        sentence: sentenceAround(guide, index, alias.length),
        team,
      });
    }
  }

  return mentions.sort((left, right) => left.index - right.index);
}

async function loadGuide(
  db: SupabaseClient<Database>,
  family: string,
): Promise<CompetitionGuideRow> {
  const { data, error } = await db
    .from("competition_guides")
    .select("family, guide_ja, source_url, verified_at, updated_at")
    .eq("family", family)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`No competition guide found for family: ${family}`);
  }

  return data as CompetitionGuideRow;
}

async function loadCompetitions(
  db: SupabaseClient<Database>,
  options: Pick<CompetitionGuideAuditOptions, "family" | "season">,
): Promise<CompetitionRow[]> {
  const { data, error } = await db
    .from("competitions")
    .select("id, slug")
    .eq("family", options.family)
    .eq("season", options.season);

  if (error) {
    throw error;
  }

  return (data ?? []) as CompetitionRow[];
}

async function loadActualTeamIds(
  db: SupabaseClient<Database>,
  competitionIds: string[],
): Promise<{
  coverage: Coverage;
  coverageReason: string;
  dataSource: DataSource;
  teamIds: Set<string>;
}> {
  if (competitionIds.length === 0) {
    return {
      coverage: "incomplete",
      coverageReason:
        "指定familyとseasonのcompetitionが見つからないため、実データ側の参加チーム集合を作成できません。",
      dataSource: "none",
      teamIds: new Set(),
    };
  }

  const { data: standings, error: standingsError } = await db
    .from("competition_standings")
    .select("competition_id, team_id")
    .in("competition_id", competitionIds);

  if (standingsError) {
    throw standingsError;
  }

  const standingRows = (standings ?? []) as StandingRow[];

  if (standingRows.length > 0) {
    return {
      coverage: "complete",
      coverageReason:
        "順位表に行があるため、competition_standingsを参加チームの照合元として使用しました。",
      dataSource: "competition_standings",
      teamIds: new Set(standingRows.map((row) => row.team_id)),
    };
  }

  const { data: matches, error: matchesError } = await db
    .from("matches")
    .select("competition_id, home_team_id, away_team_id")
    .in("competition_id", competitionIds);

  if (matchesError) {
    throw matchesError;
  }

  const matchRows = (matches ?? []) as MatchRow[];
  const teamIds = new Set<string>();

  for (const match of matchRows) {
    teamIds.add(match.home_team_id);
    teamIds.add(match.away_team_id);
  }

  return {
    coverage: "incomplete",
    coverageReason:
      "順位表が無いためmatchesから参加チーム候補を作成しました。日程の取り込み範囲が完全とは限らないため、不参加を断定できません。",
    dataSource: "matches",
    teamIds,
  };
}

async function loadTeams(
  db: SupabaseClient<Database>,
): Promise<GuideAuditTeam[]> {
  const { data, error } = await db
    .from("teams")
    .select("id, slug, name, name_ja, english_name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toAuditTeam(row as TeamRow));
}

function toGuideFinding(params: {
  dataSource: DataSource;
  guide: CompetitionGuideRow;
  mention: Mention;
  options: CompetitionGuideAuditOptions;
  retrievedAt: string;
}): GuideMentionFinding {
  const classification = classifyGuideMention(params.mention.sentence);
  const reason =
    classification === "historical_or_opponent_mention"
      ? "ガイド内の言及は対戦・歴史的記述の可能性があるため、現在参加者の候補とは別分類です。"
      : "ガイドには言及がありますが、照合元の実データ集合には含まれません。coverageを確認した上で周辺文を判断してください。";

  return {
    candidateName: displayName(params.mention.team),
    classification,
    confirmationUrl: params.guide.source_url,
    context: params.mention.context,
    dataSource: params.dataSource,
    family: params.options.family,
    guideUpdatedAt: params.guide.updated_at,
    matchedAlias: params.mention.alias,
    reason,
    retrievedAt: params.retrievedAt,
    season: params.options.season,
    teamId: params.mention.team.id,
    teamSlug: params.mention.team.slug,
  };
}

function toDataOnlyFinding(params: {
  dataSource: DataSource;
  guide: CompetitionGuideRow;
  options: CompetitionGuideAuditOptions;
  retrievedAt: string;
  team: GuideAuditTeam;
}): DataOnlyTeamFinding {
  return {
    candidateName: displayName(params.team),
    classification: "data_only",
    confirmationUrl: params.guide.source_url,
    context:
      "ガイド本文中にteamsの名称辞書と一致する言及が見つかりませんでした。",
    dataSource: params.dataSource,
    family: params.options.family,
    guideUpdatedAt: params.guide.updated_at,
    reason:
      "実データには含まれますが、ガイド本文から参加チーム名として抽出できませんでした。",
    retrievedAt: params.retrievedAt,
    season: params.options.season,
    teamId: params.team.id,
    teamSlug: params.team.slug,
  };
}

export async function auditCompetitionGuideFacts(
  db: SupabaseClient<Database>,
  options: CompetitionGuideAuditOptions,
  retrievedAt = new Date().toISOString(),
): Promise<CompetitionGuideAuditReport> {
  const [guide, competitions, teams] = await Promise.all([
    loadGuide(db, options.family),
    loadCompetitions(db, options),
    loadTeams(db),
  ]);
  const actual = await loadActualTeamIds(
    db,
    competitions.map((competition) => competition.id),
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const actualTeams = [...actual.teamIds]
    .map((teamId) => teamById.get(teamId))
    .filter((team): team is GuideAuditTeam => team !== undefined)
    .sort((left, right) =>
      displayName(left).localeCompare(displayName(right), "ja"),
    );
  const missingTeamRows = [...actual.teamIds].filter(
    (teamId) => !teamById.has(teamId),
  );
  const mentions = extractGuideTeamMentions(guide.guide_ja, teams);
  const mentionedTeamIds = new Set(mentions.map((mention) => mention.team.id));
  const guideOnlyFindings = mentions
    .filter((mention) => !actual.teamIds.has(mention.team.id))
    .map((mention) =>
      toGuideFinding({
        dataSource: actual.dataSource,
        guide,
        mention,
        options,
        retrievedAt,
      }),
    );
  const coverageReason = missingTeamRows.length
    ? `${actual.coverageReason} ${missingTeamRows.length}件の実データteam_idがteamsに無く、名称照合できないためcoverage=incompleteです。`
    : actual.coverageReason;

  return {
    actualDataTeams: actualTeams.map((team) => ({
      name: displayName(team),
      slug: team.slug,
    })),
    coverage: missingTeamRows.length ? "incomplete" : actual.coverage,
    coverageReason,
    dataOnlyTeams: actualTeams
      .filter((team) => !mentionedTeamIds.has(team.id))
      .map((team) =>
        toDataOnlyFinding({
          dataSource: actual.dataSource,
          guide,
          options,
          retrievedAt,
          team,
        }),
      ),
    dataSource: actual.dataSource,
    family: options.family,
    guideOnlyCandidates: guideOnlyFindings.filter(
      (finding) => finding.classification === "guide_only_candidate",
    ),
    guideUpdatedAt: guide.updated_at,
    historicalOrOpponentMentions: guideOnlyFindings.filter(
      (finding) => finding.classification === "historical_or_opponent_mention",
    ),
    note: REVIEW_NOTE,
    retrievedAt,
    season: options.season,
    sourceUrl: guide.source_url,
    verifiedAt: guide.verified_at,
  };
}

function csvEscape(value: string | null): string {
  const raw = value ?? "";

  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function findingRows(report: CompetitionGuideAuditReport) {
  return [
    ...report.guideOnlyCandidates,
    ...report.historicalOrOpponentMentions,
    ...report.dataOnlyTeams,
  ];
}

export function reportToJson(report: CompetitionGuideAuditReport) {
  return {
    actual_data_teams: report.actualDataTeams,
    coverage: report.coverage,
    coverage_reason: report.coverageReason,
    data_only_teams: report.dataOnlyTeams.map((finding) => ({
      candidate_name: finding.candidateName,
      classification: finding.classification,
      confirmation_url: finding.confirmationUrl,
      context: finding.context,
      data_source: finding.dataSource,
      family: finding.family,
      guide_updated_at: finding.guideUpdatedAt,
      reason: finding.reason,
      retrieved_at: finding.retrievedAt,
      season: finding.season,
      team_id: finding.teamId,
      team_slug: finding.teamSlug,
    })),
    data_source: report.dataSource,
    family: report.family,
    guide_only_candidates: report.guideOnlyCandidates.map((finding) => ({
      candidate_name: finding.candidateName,
      classification: finding.classification,
      confirmation_url: finding.confirmationUrl,
      context: finding.context,
      data_source: finding.dataSource,
      family: finding.family,
      guide_updated_at: finding.guideUpdatedAt,
      matched_alias: finding.matchedAlias,
      reason: finding.reason,
      retrieved_at: finding.retrievedAt,
      season: finding.season,
      team_id: finding.teamId,
      team_slug: finding.teamSlug,
    })),
    guide_updated_at: report.guideUpdatedAt,
    historical_or_opponent_mentions: report.historicalOrOpponentMentions.map(
      (finding) => ({
        candidate_name: finding.candidateName,
        classification: finding.classification,
        confirmation_url: finding.confirmationUrl,
        context: finding.context,
        data_source: finding.dataSource,
        family: finding.family,
        guide_updated_at: finding.guideUpdatedAt,
        matched_alias: finding.matchedAlias,
        reason: finding.reason,
        retrieved_at: finding.retrievedAt,
        season: finding.season,
        team_id: finding.teamId,
        team_slug: finding.teamSlug,
      }),
    ),
    note: report.note,
    retrieved_at: report.retrievedAt,
    season: report.season,
    source_url: report.sourceUrl,
    verified_at: report.verifiedAt,
  };
}

export function reportToCsv(report: CompetitionGuideAuditReport): string {
  const header = [
    "family",
    "season",
    "guide_updated_at",
    "coverage",
    "candidate_name",
    "classification",
    "context",
    "data_source",
    "reason",
    "confirmation_url",
    "retrieved_at",
  ];
  const rows = findingRows(report).map((finding) =>
    [
      finding.family,
      finding.season,
      finding.guideUpdatedAt,
      report.coverage,
      finding.candidateName,
      finding.classification,
      finding.context,
      finding.dataSource,
      finding.reason,
      finding.confirmationUrl,
      finding.retrievedAt,
    ]
      .map(csvEscape)
      .join(","),
  );

  return `${[header.join(","), ...rows].join("\n")}\n`;
}

export async function writeAuditReports(
  report: CompetitionGuideAuditReport,
  outputDir: string,
): Promise<{ csvPath: string; jsonPath: string }> {
  await mkdir(outputDir, { recursive: true });

  const timestamp = report.retrievedAt.replace(/[:.]/g, "-");
  const basename = `competition-guide-audit-${report.family}-${report.season}-${timestamp}`;
  const jsonPath = path.join(outputDir, `${basename}.json`);
  const csvPath = path.join(outputDir, `${basename}.csv`);

  await Promise.all([
    writeFile(
      jsonPath,
      `${JSON.stringify(reportToJson(report), null, 2)}\n`,
      "utf8",
    ),
    writeFile(csvPath, reportToCsv(report), "utf8"),
  ]);

  return { csvPath, jsonPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await auditCompetitionGuideFacts(
    getSupabaseServerClient(),
    options,
  );
  const paths = await writeAuditReports(report, options.outputDir);

  console.log(
    `Competition guide audit: family=${report.family} season=${report.season} coverage=${report.coverage} source=${report.dataSource} guideOnly=${report.guideOnlyCandidates.length} historicalOrOpponent=${report.historicalOrOpponentMentions.length} dataOnly=${report.dataOnlyTeams.length}`,
  );
  console.log(REVIEW_NOTE);
  console.log(`JSON: ${paths.jsonPath}`);
  console.log(`CSV: ${paths.csvPath}`);
}

if (process.argv[1]?.endsWith("audit-competition-guide-facts.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
