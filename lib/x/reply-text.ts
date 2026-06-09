import { getNotablePlayers } from "@/lib/x/notable-players";
import { HASHTAGS_BY_FAMILY } from "@/lib/x/post";

export type TryScorer = {
  count: number;
  playerName: string;
};

export type OfficialReplyParams = {
  awayScore: number;
  awayTeamName: string;
  competitionFamily: string | null;
  homeScore: number;
  homeTeamName: string;
  language: "ja" | "en";
  tryScorers: TryScorer[];
};

function formatTryScorer(scorer: TryScorer, language: "ja" | "en"): string {
  if (language === "en") {
    return scorer.count >= 2
      ? `${scorer.playerName} scored ${scorer.count} tries`
      : `${scorer.playerName} scored a try`;
  }

  return scorer.count >= 2
    ? `${scorer.playerName}が${scorer.count}トライ`
    : `${scorer.playerName}がトライ`;
}

function buildHashtags(params: OfficialReplyParams): string {
  const notableTags = [
    ...getNotablePlayers(params.homeTeamName),
    ...getNotablePlayers(params.awayTeamName),
  ]
    .slice(0, 3)
    .map((player) => `#${player[params.language]}`);
  const competitionTags = params.competitionFamily
    ? (HASHTAGS_BY_FAMILY[params.competitionFamily]?.[params.language] ?? "")
    : "";

  return [...notableTags, competitionTags].filter(Boolean).join(" ");
}

function buildMatchReadLine(params: OfficialReplyParams): string {
  if (params.homeScore === params.awayScore) {
    return params.language === "en"
      ? "A tight match where neither side could fully pull away."
      : "最後までどちらにも流れが傾ききらない接戦でした。";
  }

  const winner =
    params.homeScore > params.awayScore
      ? params.homeTeamName
      : params.awayTeamName;
  const margin = Math.abs(params.homeScore - params.awayScore);

  if (params.language === "en") {
    return margin <= 7
      ? `${winner} held their nerve late and closed out a tight match.`
      : `${winner} controlled the key moments and finished the match well.`;
  }

  return margin <= 7
    ? `${winner}が終盤の勝負どころを押さえて接戦を締めました。`
    : `${winner}が要所を押さえて試合を締めました。`;
}

export function buildOfficialReplyText(params: OfficialReplyParams): string {
  const scoreLine =
    params.language === "en"
      ? `${params.homeTeamName} ${params.homeScore}-${params.awayScore} ${params.awayTeamName}.`
      : `${params.homeTeamName} ${params.homeScore}-${params.awayScore}。`;
  const readLine = buildMatchReadLine(params);
  const topScorers = params.tryScorers.slice(0, 2);

  if (topScorers.length === 0) {
    return [scoreLine, readLine].join("\n");
  }

  const scorerLine =
    params.language === "en"
      ? `${topScorers.map((scorer) => formatTryScorer(scorer, params.language)).join(", ")}.`
      : `${topScorers.map((scorer) => formatTryScorer(scorer, params.language)).join("、")}。`;
  const hashtagLine = buildHashtags(params);

  return [scoreLine, readLine, scorerLine, hashtagLine]
    .filter(Boolean)
    .join("\n");
}
