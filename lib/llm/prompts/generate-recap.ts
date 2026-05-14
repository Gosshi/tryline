import type {
  AdditionalSignal,
  AssembledContentInput,
  TacticalPoint,
} from "@/lib/llm/types";

export const PROMPT_VERSION = "recap@2.0.0";

export function buildGenerateRecapPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const hasEvents = assembled.match_events.length > 0;
  const hasLineups =
    assembled.projected_lineups.home.length > 0 ||
    assembled.projected_lineups.away.length > 0;
  const isDataSparse = !hasEvents && !hasLineups;
  const structureInstruction = hasLineups
    ? "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)MOM選出と根拠(300-400字) 4)次戦への示唆(300-400字)。全体で2,000字以上を目標とすること。"
    : isDataSparse
      ? "構成: 1)試合全体像とスコア分析(500-600字) 2)大会文脈・順位への影響(400-500字) 3)両チームの近況と戦術傾向(500-600字) 4)次戦への示唆(300-400字)。全体で2,000字以上を目標とすること。MOM セクションは省略すること。"
      : "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)次戦への示唆(300-400字)。MOM セクションは省略すること（ラインアップデータなし）。全体で1,500字以上を目標とすること。";
  const signalsBlock =
    additionalSignals.length === 0
      ? ""
      : `外部シグナル(距離を取った帰属表現で利用): ${JSON.stringify(additionalSignals)}`;
  const standingsBlock =
    assembled.competition_standings.length === 0
      ? ""
      : [
          `現在の大会順位表（この試合前時点）: ${JSON.stringify(assembled.competition_standings)}`,
          "順位争い・Grand Slam・木のスプーン等の大会文脈をレビューに組み込むこと。",
        ].join("\n");
  const matchEventsBlock =
    !hasEvents
      ? ""
      : `スコアリングイベント（tryスコアラー・コンバージョン・ペナルティ・カード等）は以下のデータのみを根拠に記述すること:\n${JSON.stringify(assembled.match_events)}`;
  const dataSparseBlock = isDataSparse
    ? [
        "【データスパースモード】スコアラー・ラインアップデータは存在しない。スコアと順位変動のみを記述し、試合展開の描写は行わないこと。",
        "- recent_form の直近5試合から得点力・失点傾向・連勝/連敗ストリークを読み取り本文に反映すること",
        "- competition_standings の順位変動（この試合結果による上昇/下降）を必ず計算して記述すること",
        "- h2h_last_5 の直近対戦スコアを引用し、今回の結果との比較を行うこと",
        "- key_stats の直近平均得点・失点と今回のスコアを対比して試合の特徴を示すこと",
      ].join("\n")
    : "";
  const matchPhaseBlock = (() => {
    const phase = assembled.match_phase;
    const homeScore = assembled.match.home_score;
    const awayScore = assembled.match.away_score;
    const winner =
      homeScore !== null && awayScore !== null && homeScore !== awayScore
        ? homeScore > awayScore
          ? assembled.match.home_team?.name
          : assembled.match.away_team?.name
        : null;
    const competitionLabel = [
      assembled.match.competition?.name,
      assembled.match.competition?.season,
    ]
      .filter(Boolean)
      .join(" ");

    if (phase === "playoff_final" && winner) {
      return `この試合は${competitionLabel}の決勝戦です。${winner}が優勝チームとなりました。レビュー冒頭でこの事実を明記し、優勝の意義・歴史的文脈にも触れること。`;
    }

    if (phase === "playoff_final") {
      return `この試合は${competitionLabel}の決勝戦です。レビュー冒頭で決勝戦としての意義を明記すること。`;
    }

    if (phase === "playoff_semifinal") {
      return "この試合はプレーオフ準決勝です。決勝進出の意義と敗退チームへの示唆をレビューに含めること。";
    }

    if (phase === "playoff_other") {
      return "この試合はプレーオフ戦です。その意義と文脈をレビューに含めること。";
    }

    return "";
  })();
  const nameStyleInstruction =
    assembled.match.competition?.family === "league-one"
      ? "選手名は日本語表記を使用すること。外国人選手はカタカナで記載すること（例: Brodie Retallick → ブロディ・レタリック）。チーム名は日本語または通称表記を使用すること。"
      : [
          "選手名は必ずカタカナで記載すること。アルファベット表記は禁止。",
          "例: Marcus Smith → マーカス・スミス、Richie Mo'unga → リッチー・モウンガ、",
          "Antoine Dupont → アントワーヌ・デュポン、Siya Kolisi → シヤ・コリシ、",
          "Finn Russell → フィン・ラッセル、Josh van der Flier → ジョシュ・ファン・デル・フリア。",
          "チーム名は英語表記のまま（例: Reds、Leinster、Springboks）。",
        ].join("");

  return [
    "あなたは日本語のラグビー専門編集者です。試合レビューをマークダウンで作成してください。",
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
    matchEventsBlock,
    dataSparseBlock,
    standingsBlock,
    `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
    signalsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
