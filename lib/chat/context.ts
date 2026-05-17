import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import { getMatchById } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";

export async function assembleMatchContext(matchId: string): Promise<string> {
  const [match, content, events, lineups] = await Promise.all([
    getMatchById(matchId),
    getPublishedContentForMatch(matchId),
    getMatchEventsForMatch(matchId),
    getMatchLineupsForMatch(matchId),
  ]);

  if (!match) {
    return "試合データがありません。";
  }

  const competitionTitle = formatCompetitionTitle(
    match.competition.name,
    match.competition.season,
  );
  const lines: string[] = [
    "## 試合情報",
    `大会: ${competitionTitle}`,
    `ホーム: ${match.homeTeam.name}`,
    `アウェイ: ${match.awayTeam.name}`,
    `会場: ${match.venue ?? "不明"}`,
    `日時: ${match.kickoffAt}`,
  ];

  if (match.status === "finished") {
    lines.push(
      `スコア: ${match.homeTeam.name} ${match.homeScore ?? 0} - ${match.awayScore ?? 0} ${match.awayTeam.name}`,
    );
  }

  if (events.length > 0) {
    lines.push(
      "\n## 得点・カードイベント",
      ...events.slice(0, 80).map((event) => {
        const minute = event.minute === null ? "時刻不明" : `${event.minute}分`;
        return `- ${minute}: team_id=${event.teamId} ${event.type} ${event.playerName}`.trim();
      }),
    );
  }

  if (lineups.length > 0) {
    lines.push(
      "\n## ラインアップ",
      ...lineups.slice(0, 70).map((player) => {
        return `- team_id=${player.teamId} #${player.jerseyNumber} ${player.playerName} (${player.position ?? "position unknown"})`;
      }),
    );
  }

  if (content.recap) {
    lines.push("\n## 試合レビュー（recap）", content.recap.contentMdJa.slice(0, 2_000));
  }

  lines.push(
    "\n## 応答方針",
    "- 日本語で回答する",
    "- ラグビー用語は英語のままでよい（例: lineout, scrum）",
    "- 推測・不確かな情報は「〜と思われます」と明示する",
    "- 試合データに基づかない回答は避ける",
    "\n## 応答フォーマットの制約",
    "- Markdown 記法（**太字**、*斜体*、## 見出し、--- 区切り線）は一切使用しない。",
    "- 番号付きリスト（1. 2. 3.）と箇条書き（- ）は使用してよい。",
    "- テキストのみで回答する。装飾記号を含めない。",
  );

  return lines.join("\n");
}
