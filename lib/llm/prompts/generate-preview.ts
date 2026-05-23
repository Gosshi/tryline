import {
  buildPersona,
  buildSignalsBlock,
  buildStandingsBlock,
  PROHIBITIONS_BLOCK,
} from "./shared-prompt-blocks";

import type {
  AdditionalSignal,
  AssembledContentInput,
  TacticalPoint,
} from "@/lib/llm/types";

export const PROMPT_VERSION = "preview@3.0.0";

export function buildGeneratePreviewPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const hasLineups =
    assembled.projected_lineups.home.length > 0 ||
    assembled.projected_lineups.away.length > 0;
  const isDataSparse = assembled.match_events.length === 0 && !hasLineups;
  const structureInstruction = hasLineups
    ? "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。全体で1,500字以上を目標とすること。"
    : isDataSparse
      ? "構成: 1)両チーム現状と近況(500-600字) 2)大会文脈・この試合の意味(400-500字) 3)戦術傾向と注目ポイント(400-500字)。全体で1,500字以上を目標とすること。キープレイヤーセクションは省略すること（ラインアップデータなし）。"
      : "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)戦術傾向と展望(300-400字)。全体で1,500字以上を目標とすること。キープレイヤーセクションは省略すること（ラインアップデータなし）。";
  const persona = buildPersona("preview");
  const coreQuestionBlock = [
    "## セクション0（必須、200字以内）: # この試合の核心",
    "この試合が「何 対 何の争い」なのかを1文で表す問いを設定し、その根拠を数値で示すこと。",
    "例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」",
    "このセクションを最初に必ず出力すること。",
  ].join("\n");
  const prohibitionsBlock = PROHIBITIONS_BLOCK;
  const signalsBlock = buildSignalsBlock(additionalSignals);
  const standingsBlock = buildStandingsBlock(
    assembled.competition_standings,
    "preview",
  );
  const dataSparseBlock = isDataSparse
    ? [
        "【データスパースモード】ラインアップデータは存在しない。以下の代替戦略でプレビューを構成すること:",
        "- recent_form の直近5試合スコアから攻撃力・守備力・連勝/連敗ストリークを読み取り本文に反映すること",
        "- competition_standings の現在順位・勝ち点差から、この試合の大会的意味を具体的に述べること",
        "- h2h_last_5 の直近対戦傾向を引用し、今回の試合との比較・見どころを示すこと",
        "- key_stats の直近平均得点・失点を使い、この試合の予想スコアレンジや拮抗度を推論すること",
        "- key_stats.home/away の win_rate_last_5 を使い「好調（0.8〜）」「低調（0.2以下）」等の表現で状態を描写すること",
        "- key_stats.home/away の avg_score_diff_last_5 が正なら攻撃優位、負なら守備に課題があると読み取ること",
        "- key_stats.home/away の result_streak が winning/losing の場合は連勝・連敗ストリーク（何連勝/連敗かは recent_form から数える）を明示すること",
        "- 「情報が少ない」「選手不明」等の逃げ表現は一切禁止。手元のデータで書き切ること",
      ].join("\n")
    : "";
  const matchPhaseBlock = (() => {
    const phase = assembled.match_phase;
    const competitionLabel = [
      assembled.match.competition?.name,
      assembled.match.competition?.season,
    ]
      .filter(Boolean)
      .join(" ");

    if (phase === "playoff_final") {
      return `この試合は${competitionLabel}の決勝戦です。勝者がチャンピオンとなります。プレビュー冒頭でこの一戦の重みを強調し、タイトル争いの文脈を示すこと。`;
    }

    if (phase === "playoff_semifinal") {
      return "この試合はプレーオフ準決勝です。決勝進出をかけた一戦としての緊張感と文脈をプレビューに反映すること。";
    }

    if (phase === "playoff_other") {
      return "この試合はプレーオフ戦です。その意義と文脈をプレビューに含めること。";
    }

    return "";
  })();
  const nameStyleInstruction =
    assembled.match.competition?.family === "league-one"
      ? "選手名は日本語表記を使用すること。外国人選手は英語の人名をカタカナに変換し、姓名の間に中点（・）を入れること。チーム名は日本語または通称表記を使用すること。"
      : [
          "選手名は必ずカタカナで記載すること。アルファベット表記は禁止。",
          "英語の人名はカタカナに変換し、姓名の間に中点（・）を入れること。",
          "アポストロフィ、van/de などの小辞、複合姓は日本語として自然な読みを優先すること。",
          "チーム名は英語表記のまま（例: Reds、Leinster、Springboks）。",
        ].join("");

  return [
    persona,
    coreQuestionBlock,
    prohibitionsBlock,
    structureInstruction,
    matchPhaseBlock,
    "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
    "事実は入力データと一致させること。直接引用は15語以内。",
    "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
    "出力は日本語マークダウン本文のみ。",
    "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
    nameStyleInstruction,
    "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
    `試合データ: ${JSON.stringify(assembled)}`,
    dataSparseBlock,
    standingsBlock,
    [
      "戦術ポイント（tactical_dimension / home_situation / away_situation / matchup_implication を本文の根拠として使うこと）:",
      JSON.stringify(tacticalPoints),
    ].join("\n"),
    signalsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}