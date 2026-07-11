import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";
import {
  isAllowedSourcedFactDomain,
  normalizeSourcedFactDomain,
} from "@/lib/llm/sourced-facts/allowlist";

import type { Database, Json } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SourcedFactConfidence } from "@/lib/llm/sourced-facts/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  file: string;
  regeneratePreview: boolean;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type NewsDigestFact = {
  confidenceLabel: string;
  confirmedAt: string;
  fact: string;
  heading: string;
  sourceUrl: string;
  teamA: string;
  teamB: string;
};

type MatchCandidateRow = {
  away_team: TeamRow | null;
  home_team: TeamRow | null;
  id: string;
  kickoff_at: string;
};

type TeamRow = {
  name: string;
  name_ja?: string | null;
  short_code?: string | null;
  slug: string;
};

type MatchedDigestFact = NewsDigestFact & {
  confidence: SourcedFactConfidence;
  match: MatchCandidateRow;
  sourceDomain: string;
};

type ExcludedFact = {
  fact: string;
  heading: string;
  reason: "disallowed_domain" | "invalid_source_url" | "match_not_found";
  sourceDomain?: string | null;
  sourceUrl?: string;
};

export type ImportNewsDigestFactsResult = {
  dryRun: boolean;
  excluded: ExcludedFact[];
  extracted: number;
  previewRegeneration: PreviewRegenerationResult;
  matched: number;
  upserted: number;
};

export type PreviewRegenerationResult = {
  failed: number;
  regenerated: number;
  skippedNoPreview: number;
  targets: string[];
};

type RunDeps = {
  db: SupabaseClient<Database>;
  dryRun: boolean;
  file: string;
  generatePreview?: (
    matchId: string,
    contentType: "preview",
    language: "ja",
  ) => Promise<PipelineResult>;
  getPublishedContent?: typeof getPublishedContentForMatch;
  logger?: Logger;
  now?: Date;
  regeneratePreview?: boolean;
};

const IMPORT_MODEL_VERSION = "news-digest-import@1.0.0";

const TEAM_ALIASES: Record<string, string[]> = {
  アイルランド: ["ireland"],
  アルゼンチン: ["argentina"],
  イタリア: ["italy"],
  イングランド: ["england"],
  ウェールズ: ["wales"],
  オーストラリア: ["australia"],
  カナダ: ["canada"],
  スコットランド: ["scotland"],
  ニュージーランド: ["new-zealand", "all-blacks"],
  フィジー: ["fiji"],
  フランス: ["france"],
  南アフリカ: ["south-africa"],
  日本: ["japan"],
};

function usage(): never {
  console.error(
    "Usage: import-news-digest-facts.ts --file=docs/notes/news-digest-YYYY-MM-DD.md [--dry-run] [--regenerate-preview]",
  );
  process.exit(1);
}

export function parseArgs(argv: string[]): CliOptions {
  let file: string | null = null;
  let dryRun = false;
  let regeneratePreview = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--file=")) {
      file = arg.slice("--file=".length);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--regenerate-preview") {
      regeneratePreview = true;
      continue;
    }
  }

  if (!file) {
    usage();
  }

  return { dryRun, file, regeneratePreview };
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/代表/g, "")
    .replace(/[\s　・.'’`"“”()（）［\]\[\]【】]/g, "")
    .replace(/[‐‑‒–—―ー-]/g, "-")
    .trim();
}

function extractDigestDate(filePath: string): Date | null {
  const match = path.basename(filePath).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`);
}

function parseMonthDayDate(value: string, year: number): Date | null {
  const normalized = value.trim();
  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return new Date(
      `${year}-${slash[1]!.padStart(2, "0")}-${slash[2]!.padStart(2, "0")}T00:00:00+09:00`,
    );
  }

  const japanese = normalized.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (japanese) {
    return new Date(
      `${year}-${japanese[1]!.padStart(2, "0")}-${japanese[2]!.padStart(2, "0")}T00:00:00+09:00`,
    );
  }

  return null;
}

function extractReferenceDate(sectionText: string, filePath: string): Date {
  const digestDate = extractDigestDate(filePath) ?? new Date();
  const year = digestDate.getFullYear();
  const kickoffMatch = sectionText.match(
    /(?:キックオフ|KO|試合開始|kickoff)[^\d]*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2})/i,
  );

  if (kickoffMatch?.[1]) {
    const value = kickoffMatch[1].replace(/\//g, "-");
    const date = /^\d{4}-\d{1,2}-\d{1,2}$/.test(value)
      ? new Date(`${value}T00:00:00+09:00`)
      : parseMonthDayDate(kickoffMatch[1], year);

    if (date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return digestDate;
}

function parseMatchupHeading(heading: string): {
  teamA: string;
  teamB: string;
} | null {
  const headingWithoutPrefix = heading
    .replace(/^#+\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
  const matchup = headingWithoutPrefix.match(
    /^(.+?)\s*(?:vs\.?|v\.?|対|－|–|—)\s*(.+?)(?:[（(].*)?$/i,
  );

  if (!matchup?.[1] || !matchup[2]) {
    return null;
  }

  return {
    teamA: cleanText(matchup[1]),
    teamB: cleanText(matchup[2]),
  };
}

function parseSourceUrl(value: string): string | null {
  const markdownLink = value.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/);
  if (markdownLink?.[1]) {
    return markdownLink[1].trim();
  }

  const rawUrl = value.match(/https?:\/\/\S+/);
  return rawUrl?.[0]?.replace(/[、。)\]]+$/g, "") ?? null;
}

function mapConfidence(label: string): SourcedFactConfidence {
  const normalized = normalizeName(label);
  if (normalized.includes("公式") || normalized.includes("複数")) {
    return "high";
  }

  if (
    normalized.includes("未確認") ||
    normalized.includes("低") ||
    normalized.includes("噂")
  ) {
    return "low";
  }

  return "medium";
}

export function parseNewsDigestFacts(markdown: string): NewsDigestFact[] {
  const lines = markdown.split(/\r?\n/);
  const facts: NewsDigestFact[] = [];
  let currentHeading = "";
  let currentMatchup: { teamA: string; teamB: string } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch?.[1]) {
      currentHeading = cleanText(headingMatch[1]);
      currentMatchup = parseMatchupHeading(currentHeading);
      continue;
    }

    const factMatch = line.match(/^\s*-\s+\*\*事実\*\*[:：]\s*(.+)$/);
    if (!factMatch?.[1] || !currentMatchup) {
      continue;
    }

    const metadataLine = lines[index + 1] ?? "";
    const metadataMatch = metadataLine.match(
      /^\s*確度[:：]\s*(.+?)\s*／\s*出典[:：]\s*(.+?)\s*／\s*確認日時[:：]\s*(.+)$/u,
    );
    if (!metadataMatch?.[1] || !metadataMatch[2] || !metadataMatch[3]) {
      continue;
    }

    const sourceUrl = parseSourceUrl(metadataMatch[2]);
    if (!sourceUrl) {
      continue;
    }

    facts.push({
      confidenceLabel: cleanText(metadataMatch[1]),
      confirmedAt: cleanText(metadataMatch[3]),
      fact: cleanText(factMatch[1]),
      heading: currentHeading,
      sourceUrl,
      teamA: currentMatchup.teamA,
      teamB: currentMatchup.teamB,
    });
  }

  return facts;
}

function getTeamSearchKeys(name: string): Set<string> {
  const normalized = normalizeName(name);
  return new Set([
    normalized,
    ...(TEAM_ALIASES[name] ?? []).map(normalizeName),
  ]);
}

function teamMatches(input: string, team: TeamRow | null): boolean {
  if (!team) {
    return false;
  }

  const inputKeys = getTeamSearchKeys(input);
  const candidateKeys = [
    team.name,
    team.name_ja ?? "",
    team.slug,
    team.short_code ?? "",
  ]
    .filter(Boolean)
    .map(normalizeName);

  return candidateKeys.some((candidateKey) => inputKeys.has(candidateKey));
}

function matchCandidateForFact(
  fact: NewsDigestFact,
  matches: MatchCandidateRow[],
): MatchCandidateRow | null {
  return (
    matches.find((match) => {
      const direct =
        teamMatches(fact.teamA, match.home_team) &&
        teamMatches(fact.teamB, match.away_team);
      const reversed =
        teamMatches(fact.teamA, match.away_team) &&
        teamMatches(fact.teamB, match.home_team);

      return direct || reversed;
    }) ?? null
  );
}

async function loadCandidateMatches(
  db: SupabaseClient<Database>,
  referenceDate: Date,
): Promise<MatchCandidateRow[]> {
  const start = new Date(referenceDate);
  start.setDate(start.getDate() - 2);
  const end = new Date(referenceDate);
  end.setDate(end.getDate() + 9);

  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_team:teams!matches_home_team_id_fkey (
          name,
          name_ja,
          slug,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          name,
          name_ja,
          slug,
          short_code
        )
      `,
    )
    .gte("kickoff_at", start.toISOString())
    .lte("kickoff_at", end.toISOString())
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as MatchCandidateRow[];
}

function metadataForFact(params: {
  confirmedAt: string;
  digestFile: string;
  heading: string;
  rawConfidence: string;
}): Json {
  return {
    confirmed_at: params.confirmedAt,
    digest_file: params.digestFile,
    heading: params.heading,
    import_source: "news_digest",
    raw_confidence: params.rawConfidence,
  };
}

async function upsertFacts(params: {
  db: SupabaseClient<Database>;
  digestFile: string;
  facts: MatchedDigestFact[];
  fetchedAt: string;
}) {
  if (params.facts.length === 0) {
    return 0;
  }

  const rows = params.facts.map((fact) => ({
    confidence: fact.confidence,
    content_type: "preview",
    fact: fact.fact,
    fetched_at: params.fetchedAt,
    match_id: fact.match.id,
    metadata: metadataForFact({
      confirmedAt: fact.confirmedAt,
      digestFile: params.digestFile,
      heading: fact.heading,
      rawConfidence: fact.confidenceLabel,
    }),
    model_version: IMPORT_MODEL_VERSION,
    source_domain: fact.sourceDomain,
    source_url: fact.sourceUrl,
  }));

  const { error } = await params.db
    .from("match_sourced_facts")
    .upsert(rows, { onConflict: "match_id,fact" });

  if (error) {
    throw error;
  }

  return rows.length;
}

function summarizeExcluded(excluded: ExcludedFact[]): string {
  const counts = excluded.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
}

async function buildPreviewRegenerationTargets(params: {
  getPublishedContent: typeof getPublishedContentForMatch;
  matchIds: string[];
}) {
  const targets: string[] = [];
  let skippedNoPreview = 0;

  for (const matchId of params.matchIds) {
    const content = await params.getPublishedContent(matchId);
    if (content.preview) {
      targets.push(matchId);
    } else {
      skippedNoPreview += 1;
    }
  }

  return { skippedNoPreview, targets };
}

async function regeneratePreviewTargets(params: {
  dryRun: boolean;
  generatePreview: NonNullable<RunDeps["generatePreview"]>;
  logger: Logger;
  targets: string[];
}): Promise<{ failed: number; regenerated: number }> {
  if (params.dryRun) {
    return { failed: 0, regenerated: 0 };
  }

  let failed = 0;
  let regenerated = 0;

  for (const matchId of params.targets) {
    try {
      await params.generatePreview(matchId, "preview", "ja");
      regenerated += 1;
      params.logger.log(`[regenerated-preview] ${matchId}`);
    } catch (error) {
      failed += 1;
      params.logger.error(
        `[import-news-digest-facts] preview regeneration failed for ${matchId}`,
        error,
      );
    }
  }

  return { failed, regenerated };
}

export async function runImportNewsDigestFacts({
  db,
  dryRun,
  file,
  generatePreview = generateMatchContent,
  getPublishedContent = getPublishedContentForMatch,
  logger = console,
  now = new Date(),
  regeneratePreview = false,
}: RunDeps): Promise<ImportNewsDigestFactsResult> {
  const markdown = await readFile(file, "utf8");
  const facts = parseNewsDigestFacts(markdown);
  const referenceDate = extractReferenceDate(markdown, file);
  const candidateMatches = await loadCandidateMatches(db, referenceDate);
  const excluded: ExcludedFact[] = [];
  const matched: MatchedDigestFact[] = [];

  for (const fact of facts) {
    const sourceDomain = normalizeSourcedFactDomain(fact.sourceUrl);
    if (!sourceDomain) {
      excluded.push({
        fact: fact.fact,
        heading: fact.heading,
        reason: "invalid_source_url",
        sourceUrl: fact.sourceUrl,
      });
      continue;
    }

    if (!isAllowedSourcedFactDomain(sourceDomain)) {
      excluded.push({
        fact: fact.fact,
        heading: fact.heading,
        reason: "disallowed_domain",
        sourceDomain,
        sourceUrl: fact.sourceUrl,
      });
      continue;
    }

    const match = matchCandidateForFact(fact, candidateMatches);
    if (!match) {
      excluded.push({
        fact: fact.fact,
        heading: fact.heading,
        reason: "match_not_found",
        sourceDomain,
        sourceUrl: fact.sourceUrl,
      });
      continue;
    }

    matched.push({
      ...fact,
      confidence: mapConfidence(fact.confidenceLabel),
      match,
      sourceDomain,
    });
  }

  const upserted = dryRun
    ? 0
    : await upsertFacts({
        db,
        digestFile: file,
        facts: matched,
        fetchedAt: now.toISOString(),
      });
  const uniqueMatchedMatchIds = [
    ...new Set(matched.map((item) => item.match.id)),
  ];
  const previewRegeneration: PreviewRegenerationResult = {
    failed: 0,
    regenerated: 0,
    skippedNoPreview: 0,
    targets: [],
  };

  if (regeneratePreview) {
    const targetResult = await buildPreviewRegenerationTargets({
      getPublishedContent,
      matchIds: uniqueMatchedMatchIds,
    });
    previewRegeneration.targets = targetResult.targets;
    previewRegeneration.skippedNoPreview = targetResult.skippedNoPreview;

    const regenerated = await regeneratePreviewTargets({
      dryRun,
      generatePreview,
      logger,
      targets: previewRegeneration.targets,
    });
    previewRegeneration.failed = regenerated.failed;
    previewRegeneration.regenerated = regenerated.regenerated;
  }

  logger.log(
    `News digest sourced facts: extracted=${facts.length} matched=${matched.length} excluded=${excluded.length} upserted=${upserted}`,
  );
  if (regeneratePreview) {
    logger.log(
      `Preview regeneration: targets=${previewRegeneration.targets.length} skipped_no_preview=${previewRegeneration.skippedNoPreview} regenerated=${previewRegeneration.regenerated} failed=${previewRegeneration.failed}`,
    );
    for (const matchId of previewRegeneration.targets) {
      logger.log(`[preview-regeneration-target] ${matchId}`);
    }
  }
  if (excluded.length > 0) {
    logger.log(`Excluded reasons: ${summarizeExcluded(excluded)}`);
  }
  for (const item of matched) {
    logger.log(
      `[matched] ${item.heading} -> ${item.match.id} ${item.sourceDomain} ${item.confidence}`,
    );
  }
  for (const item of excluded) {
    logger.warn(
      `[excluded:${item.reason}] ${item.heading} ${item.sourceDomain ?? ""} ${item.fact}`,
    );
  }
  if (dryRun) {
    logger.log("[dry-run] No rows were written.");
  }

  return {
    dryRun,
    excluded,
    extracted: facts.length,
    previewRegeneration,
    matched: matched.length,
    upserted,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await readFile(options.file, "utf8");
  await runImportNewsDigestFacts({
    db: getSupabaseServerClient(),
    dryRun: options.dryRun,
    file: options.file,
    regeneratePreview: options.regeneratePreview,
  });
}

if (process.argv[1]?.endsWith("import-news-digest-facts.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
