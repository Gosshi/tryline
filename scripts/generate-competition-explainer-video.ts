import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { MODELS } from "@/lib/llm/models";
import { createSpeechAudio, createTextResponse } from "@/lib/llm/openai";
import {
  buildCompetitionExplainerFacts,
  buildCompetitionExplainerPrompt,
  buildExplainerSlides,
  estimateExplainerCost,
  renderExplainerSlideHtml,
  validateExplainerData,
  validateExplainerScript,
} from "@/lib/video/competition-explainer";

import type { Database } from "@/lib/db/types";
import type {
  CompetitionExplainerData,
  ExplainerCompetition,
  ExplainerMatch,
  ExplainerTeam,
} from "@/lib/video/competition-explainer";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  family: string;
  outDir: string;
  season: string;
};

type CompetitionDbRow = {
  end_date: string | null;
  family: string;
  id: string;
  name: string;
  name_ja: string | null;
  season: string;
  slug: string;
  start_date: string | null;
};

type TeamRelation = {
  name: string;
  name_ja: string | null;
  short_code: string | null;
  slug: string;
};

type MatchDbRow = {
  away_score: number | null;
  away_team: TeamRelation | TeamRelation[] | null;
  home_score: number | null;
  home_team: TeamRelation | TeamRelation[] | null;
  id: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
};

const DEFAULT_OUT_DIR = "tmp/video-poc";
const COST_WARNING_THRESHOLD_USD = 0.05;
const MAX_VIDEO_SECONDS = 60;
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1920;
const USAGE =
  "Usage: node --env-file=.env.local tools/run-ts.cjs scripts/generate-competition-explainer-video.ts --family=<family> --season=<season> [--out-dir=tmp/video-poc]";

export function parseArgs(argv: string[]): CliOptions {
  let family: string | null = null;
  let season: string | null = null;
  let outDir = DEFAULT_OUT_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length) || null;
      continue;
    }

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length) || null;
      continue;
    }

    if (arg === "--out-dir") {
      outDir = argv[index + 1] ?? DEFAULT_OUT_DIR;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--out-dir=")) {
      outDir = arg.slice("--out-dir=".length) || DEFAULT_OUT_DIR;
    }
  }

  if (!family || !season) {
    throw new Error(USAGE);
  }

  return { family, outDir, season };
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapCompetition(row: CompetitionDbRow): ExplainerCompetition {
  return {
    endDate: row.end_date,
    family: row.family,
    id: row.id,
    name: row.name,
    nameJa: row.name_ja,
    season: row.season,
    slug: row.slug,
    startDate: row.start_date,
  };
}

function mapTeam(row: TeamRelation): ExplainerTeam {
  return {
    name: row.name,
    nameJa: row.name_ja,
    shortCode: row.short_code,
    slug: row.slug,
  };
}

function mapMatch(row: MatchDbRow): ExplainerMatch {
  const homeTeam = firstRelation(row.home_team);
  const awayTeam = firstRelation(row.away_team);

  if (!homeTeam || !awayTeam) {
    throw new Error(`Match ${row.id} is missing team relation data.`);
  }

  return {
    awayScore: row.away_score,
    awayTeam: mapTeam(awayTeam),
    homeScore: row.home_score,
    homeTeam: mapTeam(homeTeam),
    id: row.id,
    kickoffAt: row.kickoff_at,
    status: row.status,
    venue: row.venue,
  };
}

async function loadCompetitionExplainerData(
  db: SupabaseClient<Database>,
  options: Pick<CliOptions, "family" | "season">,
): Promise<CompetitionExplainerData> {
  const { data: competitionData, error: competitionError } = await db
    .from("competitions")
    .select("id, slug, family, name, name_ja, season, start_date, end_date")
    .eq("family", options.family)
    .eq("season", options.season)
    .maybeSingle();

  if (competitionError) {
    throw competitionError;
  }

  if (!competitionData) {
    throw new Error(
      `Competition not found for family=${options.family} season=${options.season}.`,
    );
  }

  const competition = mapCompetition(competitionData as CompetitionDbRow);
  const { data: matchData, error: matchError } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        home_team:teams!matches_home_team_id_fkey (
          name,
          name_ja,
          short_code,
          slug
        ),
        away_team:teams!matches_away_team_id_fkey (
          name,
          name_ja,
          short_code,
          slug
        )
      `,
    )
    .eq("competition_id", competition.id)
    .order("kickoff_at", { ascending: true });

  if (matchError) {
    throw matchError;
  }

  const matches = ((matchData ?? []) as unknown as MatchDbRow[]).map(mapMatch);

  return { competition, matches };
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureCommand(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: "ignore" });

  if (result.error || result.status !== 0) {
    throw new Error(`${label} is required but was not found: ${command}`);
  }
}

function findBrowserExecutable(): string {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "Chrome/Chromium executable was not found. Set CHROME_BIN or install a local browser.",
  );
}

async function runCommand(
  command: string,
  args: string[],
  label: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function renderSlidePngs(params: {
  browserExecutable: string;
  slidesDir: string;
  workDir: string;
  htmlSlides: string[];
}): Promise<string[]> {
  const pngPaths: string[] = [];

  await fs.mkdir(params.slidesDir, { recursive: true });

  for (const [index, html] of params.htmlSlides.entries()) {
    const slideNumber = String(index + 1).padStart(2, "0");
    const htmlPath = path.join(params.workDir, `slide-${slideNumber}.html`);
    const pngPath = path.join(params.slidesDir, `slide-${slideNumber}.png`);
    await fs.writeFile(htmlPath, html, "utf8");

    await runCommand(
      params.browserExecutable,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-sandbox",
        `--window-size=${SLIDE_WIDTH},${SLIDE_HEIGHT}`,
        `--screenshot=${pngPath}`,
        pathToFileURL(htmlPath).href,
      ],
      "Slide screenshot rendering",
    );

    pngPaths.push(pngPath);
  }

  return pngPaths;
}

export function buildConcatFileContent(
  slidePaths: string[],
  secondsPerSlide: number,
) {
  const lines = slidePaths.flatMap((slidePath) => [
    `file '${slidePath.replace(/'/g, "'\\''")}'`,
    `duration ${secondsPerSlide.toFixed(2)}`,
  ]);
  const lastSlide = slidePaths.at(-1);

  if (lastSlide) {
    lines.push(`file '${lastSlide.replace(/'/g, "'\\''")}'`);
  }

  return `${lines.join("\n")}\n`;
}

export function parseFfprobeDuration(raw: string): number {
  const duration = Number(raw.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Unable to read audio duration from ffprobe output: ${raw}`,
    );
  }

  return duration;
}

export function calculateSecondsPerSlide(params: {
  audioDurationSeconds: number;
  slideCount: number;
}): number {
  if (params.slideCount < 1) {
    throw new Error("At least one slide is required to compose a video.");
  }

  if (params.audioDurationSeconds > MAX_VIDEO_SECONDS) {
    throw new Error(
      `TTS audio is too long (${params.audioDurationSeconds.toFixed(
        2,
      )}s). Regenerate a shorter script before composing a 60s video.`,
    );
  }

  const totalSlideSeconds = Math.min(
    MAX_VIDEO_SECONDS,
    Math.max(params.audioDurationSeconds + 0.5, params.slideCount),
  );

  return totalSlideSeconds / params.slideCount;
}

function getAudioDurationSeconds(audioPath: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    { encoding: "utf8" },
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      `ffprobe failed to read narration duration: ${
        result.stderr.trim() || result.error?.message || "unknown error"
      }`,
    );
  }

  return parseFfprobeDuration(result.stdout);
}

async function composeVideo(params: {
  audioPath: string;
  outputPath: string;
  slidePaths: string[];
  workDir: string;
}): Promise<void> {
  ensureCommand("ffmpeg", ["-version"], "ffmpeg");

  const audioDurationSeconds = getAudioDurationSeconds(params.audioPath);
  const secondsPerSlide = calculateSecondsPerSlide({
    audioDurationSeconds,
    slideCount: params.slidePaths.length,
  });
  const concatPath = path.join(params.workDir, "slides.txt");
  await fs.writeFile(
    concatPath,
    buildConcatFileContent(params.slidePaths, secondsPerSlide),
    "utf8",
  );

  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-i",
      params.audioPath,
      "-vf",
      `scale=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-t",
      String(MAX_VIDEO_SECONDS),
      params.outputPath,
    ],
    "Video composition",
  );
}

async function generateCompetitionExplainerVideo(options: CliOptions) {
  const db = getSupabasePublicServerClient();
  const data = await loadCompetitionExplainerData(db, options);
  validateExplainerData(data);

  const facts = buildCompetitionExplainerFacts(data);
  const prompt = buildCompetitionExplainerPrompt(facts);
  const response = await createTextResponse({
    input: prompt,
    model: MODELS.NARRATIVE,
    temperature: 0.3,
  });
  const script = validateExplainerScript(response.text, data);
  const ttsResponse = await createSpeechAudio({
    input: script,
    model: MODELS.TTS,
    voice: "nova",
  });

  const cost = estimateExplainerCost({
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    ttsCharacters: script.length,
  });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseDir = path.resolve(options.outDir);
  const finalDir = path.join(
    baseDir,
    `${slugify(`${data.competition.family}-${data.competition.season}`)}-${timestamp}`,
  );
  const workDir = path.join(baseDir, `.work-${process.pid}-${timestamp}`);

  try {
    await fs.mkdir(workDir, { recursive: true });
    const audioPath = path.join(workDir, "narration.mp3");
    const scriptPath = path.join(workDir, "script.txt");
    const factsPath = path.join(workDir, "facts.json");
    const slidesDir = path.join(workDir, "slides");
    const outputPath = path.join(workDir, "explainer.mp4");
    await fs.writeFile(audioPath, ttsResponse.audio);
    await fs.writeFile(scriptPath, `${script}\n`, "utf8");
    await fs.writeFile(factsPath, JSON.stringify(facts, null, 2), "utf8");

    const browserExecutable = findBrowserExecutable();
    const slidePaths = await renderSlidePngs({
      browserExecutable,
      htmlSlides: buildExplainerSlides(facts).map(renderExplainerSlideHtml),
      slidesDir,
      workDir,
    });

    await composeVideo({
      audioPath,
      outputPath,
      slidePaths,
      workDir,
    });

    await fs.mkdir(baseDir, { recursive: true });
    await fs.rename(workDir, finalDir);

    console.log(
      [
        `Generated competition explainer video: ${finalDir}`,
        `Script: ${path.join(finalDir, "script.txt")}`,
        `Video: ${path.join(finalDir, "explainer.mp4")}`,
        `Competition: ${facts.competitionTitle}`,
        `DB summary: ${facts.matchCount} matches, ${facts.teamCount} teams, ${facts.finishedMatchCount} finished, ${facts.upcomingMatchCount} upcoming`,
        `Models: script=${response.model}, tts=${ttsResponse.model}`,
        `Estimated cost: ${formatUsd(cost.totalUsd)} (script ${formatUsd(cost.narrativeUsd)} + TTS ${formatUsd(cost.ttsUsd)})`,
      ].join("\n"),
    );

    if (cost.totalUsd > COST_WARNING_THRESHOLD_USD) {
      console.warn(
        `WARNING: estimated generation cost exceeds ${formatUsd(COST_WARNING_THRESHOLD_USD)}.`,
      );
    }
  } catch (error) {
    await fs.rm(workDir, { force: true, recursive: true });
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  generateCompetitionExplainerVideo(parseArgs(process.argv.slice(2))).catch(
    (error) => {
      console.error(
        error instanceof Error
          ? error.message
          : "Unknown explainer generation error",
      );
      process.exitCode = 1;
    },
  );
}
