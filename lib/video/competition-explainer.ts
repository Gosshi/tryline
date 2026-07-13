import { formatCompetitionTitle } from "@/lib/format/competition";
import { getTeamDisplayName } from "@/lib/format/team";

export type ExplainerCompetition = {
  endDate: string | null;
  family: string;
  id: string;
  name: string;
  nameJa: string | null;
  season: string;
  slug: string;
  startDate: string | null;
};

export type ExplainerTeam = {
  name: string;
  nameJa: string | null;
  shortCode: string | null;
  slug: string;
};

export type ExplainerMatch = {
  awayScore: number | null;
  awayTeam: ExplainerTeam;
  homeScore: number | null;
  homeTeam: ExplainerTeam;
  id: string;
  kickoffAt: string;
  status: string;
  venue: string | null;
};

export type CompetitionExplainerData = {
  competition: ExplainerCompetition;
  matches: ExplainerMatch[];
};

export type ExplainerFacts = {
  competitionTitle: string;
  dateRange: string;
  finishedMatchCount: number;
  matchCount: number;
  recentResults: string[];
  season: string;
  teamCount: number;
  teams: string[];
  upcomingMatches: string[];
  upcomingMatchCount: number;
};

export type ExplainerSlide = {
  eyebrow: string;
  heading: string;
  items: string[];
  kicker: string;
};

export type ExplainerCostEstimate = {
  narrativeUsd: number;
  totalUsd: number;
  ttsUsd: number;
};

const MAX_SCRIPT_CHARS = 320;
const TTS_PRICE_PER_MILLION_CHARS_USD = 15;
const GPT_4O_INPUT_PER_MILLION_USD = 2.5;
const GPT_4O_OUTPUT_PER_MILLION_USD = 10;

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function getDisplayTeamName(team: ExplainerTeam): string {
  return getTeamDisplayName({
    name: team.name,
    nameJa: team.nameJa,
    slug: team.slug,
  });
}

function getUniqueTeams(matches: ExplainerMatch[]): string[] {
  return [
    ...new Set(
      matches.flatMap((match) => [
        getDisplayTeamName(match.homeTeam),
        getDisplayTeamName(match.awayTeam),
      ]),
    ),
  ].sort((left, right) => left.localeCompare(right, "ja"));
}

function summarizeMatch(match: ExplainerMatch): string {
  const home = getDisplayTeamName(match.homeTeam);
  const away = getDisplayTeamName(match.awayTeam);
  const date = formatDate(match.kickoffAt);

  if (
    match.status === "finished" &&
    typeof match.homeScore === "number" &&
    typeof match.awayScore === "number"
  ) {
    return `${home} ${match.homeScore}-${match.awayScore} ${away}`;
  }

  return `${date ? `${date} ` : ""}${home} vs ${away}`;
}

function getDateRange(competition: ExplainerCompetition): string {
  const start = formatDate(competition.startDate);
  const end = formatDate(competition.endDate);

  if (start && end) {
    return `${start}〜${end}`;
  }

  return start ?? end ?? "日程未設定";
}

export function buildCompetitionExplainerFacts(
  data: CompetitionExplainerData,
): ExplainerFacts {
  const matches = [...data.matches].sort((left, right) =>
    left.kickoffAt.localeCompare(right.kickoffAt),
  );
  const finishedMatches = matches.filter(
    (match) => match.status === "finished",
  );
  const upcomingMatches = matches.filter(
    (match) => match.status !== "finished",
  );
  const teams = getUniqueTeams(matches);

  return {
    competitionTitle: formatCompetitionTitle(
      {
        family: data.competition.family,
        name: data.competition.name,
        nameJa: data.competition.nameJa,
        slug: data.competition.slug,
      },
      data.competition.season,
    ),
    dateRange: getDateRange(data.competition),
    finishedMatchCount: finishedMatches.length,
    matchCount: matches.length,
    recentResults: finishedMatches.slice(-4).map(summarizeMatch),
    season: data.competition.season,
    teamCount: teams.length,
    teams,
    upcomingMatches: upcomingMatches.slice(0, 4).map(summarizeMatch),
    upcomingMatchCount: upcomingMatches.length,
  };
}

export function buildCompetitionExplainerPrompt(facts: ExplainerFacts): string {
  return `あなたはTrylineの日本語ラグビー解説者です。以下のDB実測データだけを根拠に、縦型ショート動画「1分でわかる大会解説」のナレーション台本を作ってください。

DB実測データ:
${JSON.stringify(facts, null, 2)}

厳守事項:
- 出力は日本語ナレーション本文のみ。見出し、箇条書き、Markdown、コードブロックは禁止。
- 220〜280字を目安にし、最大${MAX_SCRIPT_CHARS}字以内。
- DB実測データにないチーム名、試合数、スコア、日付、順位、放映情報、歴史情報を補完しない。
- スコアを書く場合は recentResults にある表記だけを使う。
- 週次まとめやSNS投稿ではなく、大会ハブに置くオンページ解説として自然な内容にする。
- 「分岐点」「戦術ポイント」など、試合イベントにない局面断定は書かない。`;
}

export function sanitizeExplainerScript(raw: string): string {
  return raw
    .replace(/^```[^\n]*\n?/m, "")
    .replace(/```\s*$/m, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateExplainerData(data: CompetitionExplainerData): void {
  if (!data.matches.length) {
    throw new Error("No matches found for the requested competition.");
  }

  if (getUniqueTeams(data.matches).length < 2) {
    throw new Error("Competition data has fewer than two teams.");
  }
}

export function validateExplainerScript(
  script: string,
  data: CompetitionExplainerData,
): string {
  const sanitized = sanitizeExplainerScript(script);

  if (!sanitized) {
    throw new Error("Generated explainer script is empty.");
  }

  if (sanitized.length > MAX_SCRIPT_CHARS) {
    throw new Error(
      `Generated explainer script is too long (${sanitized.length}/${MAX_SCRIPT_CHARS} chars).`,
    );
  }

  const allowedScores = new Set(
    data.matches
      .filter(
        (match) =>
          typeof match.homeScore === "number" &&
          typeof match.awayScore === "number",
      )
      .flatMap((match) => [
        `${match.homeScore}-${match.awayScore}`,
        `${match.homeScore}ー${match.awayScore}`,
        `${match.homeScore}－${match.awayScore}`,
      ]),
  );

  for (const match of sanitized.matchAll(/\d{1,3}\s*[-ー－]\s*\d{1,3}/g)) {
    const normalized = match[0].replace(/\s+/g, "");
    if (!allowedScores.has(normalized)) {
      throw new Error(
        `Generated script contains unsupported score: ${match[0]}`,
      );
    }
  }

  return sanitized;
}

export function buildExplainerSlides(facts: ExplainerFacts): ExplainerSlide[] {
  const leadItems = [
    `${facts.matchCount}試合 / ${facts.teamCount}チーム`,
    `開催期間: ${facts.dateRange}`,
    facts.finishedMatchCount > 0
      ? `終了済み: ${facts.finishedMatchCount}試合`
      : `これから始まる大会`,
  ];
  const resultItems =
    facts.recentResults.length > 0
      ? facts.recentResults
      : facts.upcomingMatches.length > 0
        ? facts.upcomingMatches
        : ["試合データは登録済みです"];

  return [
    {
      eyebrow: "TRYLINE EXPLAINER",
      heading: `1分でわかる ${facts.competitionTitle}`,
      items: leadItems,
      kicker: "大会の全体像",
    },
    {
      eyebrow: facts.season,
      heading: "まず押さえる数字",
      items: [
        `登録試合: ${facts.matchCount}`,
        `参加チーム: ${facts.teamCount}`,
        `今後の試合: ${facts.upcomingMatchCount}`,
      ],
      kicker: "DB実測",
    },
    {
      eyebrow: "MATCH SNAPSHOT",
      heading: facts.recentResults.length > 0 ? "直近の結果" : "今後のカード",
      items: resultItems,
      kicker: "試合データから",
    },
    {
      eyebrow: "TEAMS",
      heading: "登場チーム",
      items: facts.teams.slice(0, 8),
      kicker:
        facts.teams.length > 8
          ? `ほか ${facts.teams.length - 8} チーム`
          : "登録チーム",
    },
  ];
}

export function renderExplainerSlideHtml(slide: ExplainerSlide): string {
  const items = slide.items
    .map((item) => `<li><span>${escapeHtml(item)}</span></li>`)
    .join("");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1080, initial-scale=1" />
<style>
:root {
  --color-paper: #f7f1e7;
  --color-ink: #18201b;
  --color-ink-muted: #5e665d;
  --color-rule: rgba(24, 32, 27, 0.18);
  --color-accent: #c43b2f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  width: 1080px;
  height: 1920px;
  overflow: hidden;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: "Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic", sans-serif;
}
.slide {
  position: relative;
  display: flex;
  min-height: 1920px;
  flex-direction: column;
  justify-content: space-between;
  padding: 132px 96px 110px;
}
.slide::before {
  content: "";
  position: absolute;
  inset: 48px;
  border: 3px solid var(--color-rule);
  border-radius: 44px;
  pointer-events: none;
}
.eyebrow {
  color: var(--color-accent);
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 0;
}
h1 {
  max-width: 860px;
  margin: 120px 0 0;
  font-size: 118px;
  line-height: 1.12;
  letter-spacing: 0;
}
ul {
  display: grid;
  gap: 30px;
  margin: 96px 0 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  border-top: 2px solid var(--color-rule);
  padding-top: 30px;
  color: var(--color-ink);
  font-size: 48px;
  font-weight: 700;
  line-height: 1.28;
}
li::before {
  content: "";
  flex: 0 0 auto;
  width: 16px;
  height: 72px;
  border-radius: 999px;
  background: var(--color-accent);
}
.kicker {
  align-self: flex-start;
  border-radius: 999px;
  background: var(--color-ink);
  color: var(--color-paper);
  padding: 22px 34px;
  font-size: 34px;
  font-weight: 800;
}
.brand {
  color: var(--color-ink-muted);
  font-size: 34px;
  font-weight: 700;
}
</style>
</head>
<body>
  <main class="slide">
    <section>
      <div class="eyebrow">${escapeHtml(slide.eyebrow)}</div>
      <h1>${escapeHtml(slide.heading)}</h1>
      <ul>${items}</ul>
    </section>
    <footer>
      <div class="kicker">${escapeHtml(slide.kicker)}</div>
      <p class="brand">Tryline Rugby</p>
    </footer>
  </main>
</body>
</html>`;
}

export function estimateExplainerCost(params: {
  inputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
}): ExplainerCostEstimate {
  const narrativeUsd =
    (params.inputTokens / 1_000_000) * GPT_4O_INPUT_PER_MILLION_USD +
    (params.outputTokens / 1_000_000) * GPT_4O_OUTPUT_PER_MILLION_USD;
  const ttsUsd =
    (params.ttsCharacters / 1_000_000) * TTS_PRICE_PER_MILLION_CHARS_USD;
  const totalUsd = narrativeUsd + ttsUsd;

  return { narrativeUsd, totalUsd, ttsUsd };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
