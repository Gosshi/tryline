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

export function buildOfficialReplyText(params: OfficialReplyParams): string {
  const scoreLine =
    params.language === "en"
      ? `${params.homeTeamName} ${params.homeScore}-${params.awayScore} ${params.awayTeamName}.`
      : `${params.homeTeamName} ${params.homeScore}-${params.awayScore}。`;
  const topScorers = params.tryScorers.slice(0, 2);

  if (topScorers.length === 0) {
    return scoreLine;
  }

  const scorerLine =
    params.language === "en"
      ? `${topScorers.map((scorer) => formatTryScorer(scorer, params.language)).join(", ")}.`
      : `${topScorers.map((scorer) => formatTryScorer(scorer, params.language)).join("、")}。`;
  const hashtagLine = buildHashtags(params);

  return [scoreLine, scorerLine, hashtagLine].filter(Boolean).join("\n");
}