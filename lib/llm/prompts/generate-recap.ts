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

export const PROMPT_VERSION = "recap@4.0.0";

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
  const sectionHeadingInstruction =
    "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。";
  const structureInstruction = hasLineups
    ? [
        "以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:",
        "# 試合全体像（400-500字）",
        "# ターニングポイント（500-600字）",
        "# MOM（300-400字）",
        "# 次戦への示唆（300-400字）",
        `全体で2,000字以上を目標とすること。${sectionHeadingInstruction}`,
      ].join("\n")
    : isDataSparse
      ? [
          "以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:",
          "# 試合全体像（500-600字）",
          "# 大会文脈と順位への影響（400-500字）",
          "# 両チームの近況と戦術傾向（500-600字）",
          "# 次戦への示唆（300-400字）",
          `全体で2,000字以上を目標とすること。MOM セクションは省略すること。${sectionHeadingInstruction}`,
        ].join("\n")
      : [
          "以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:",
          "# 試合全体像（400-500字）",
          "# ターニングポイント（600-700字）",
          "# 次戦への示唆（300-400字）",
          `全体で2,000字以上を目標とすること。MOM セクションは省略すること（ラインアップデータなし）。${sectionHeadingInstruction}`,
        ].join("\n");
  const persona = buildPersona("recap");
  const coreQuestionBlock = [
    "## セクション0（必須、200字以内）: # この試合の核心",
    "試合前の「何 対 何の争い」という問いに対し、実際の結果がどう答えたかを1〜2文で述べること。",
    "例: 「Leinsterの平均31得点アタックは今日も機能し、Saracensの堅守を41-12で打ち破った」",
    "このセクションを最初に必ず出力すること。",
  ].join("\n");
  const prohibitionsBlock = PROHIBITIONS_BLOCK;
  const signalsBlock = buildSignalsBlock(additionalSignals);
  const standingsBlock = buildStandingsBlock(
    assembled.competition_standings,
    "recap",
  );
  const matchEventsBlock =
    !hasEvents
      ? ""
      : `スコアリングイベント（tryスコアラー・コンバージョン・ペナルティ・カード等）は以下のデータのみを根拠に記述すること:\n${JSON.stringify(assembled.match_events)}`;
  const scoreTimelineBlock = (() => {
    if (!hasEvents || !assembled.score_timeline) {
      return "";
    }

    const { ht_home, ht_away, lead_changes, winning_score } =
      assembled.score_timeline;
    const homeTeam = assembled.match.home_team?.name ?? "ホーム";
    const awayTeam = assembled.match.away_team?.name ?? "アウェイ";
    const lines: string[] = [
      "スコア推移サマリー（# ターニングポイントの骨格として必ず使うこと）:",
      `- 前半終了時スコア: ${homeTeam} ${ht_home} — ${awayTeam} ${ht_away}`,
    ];

    if (lead_changes.length === 0) {
      lines.push("- リード変化: なし（一方が終始リード）");
    } else {
      const changes = lead_changes
        .map((change) => {
          const leader =
            change.new_leader === "home"
              ? homeTeam
              : change.new_leader === "away"
                ? awayTeam
                : "同点";
          return `${change.minute}分: ${leader} ${change.home}—${change.away}`;
        })
        .join(" → ");
      lines.push(`- リード変化: ${changes}`);
    }

    if (winning_score) {
      const winTeam = winning_score.team === "home" ? homeTeam : awayTeam;
      lines.push(
        `- 勝利を決めた得点: ${winning_score.minute}分 ${winTeam} ${winning_score.player}（${winning_score.type}）`,
      );
    }

    lines.push(
      "# ターニングポイントでは、最後にリードが入れ替わった時点を起点に、その前後の流れ（何が崩壊し、何が機能したか）を時刻・スコア・選手名で具体的に論じること。「〜した」という事実の羅列ではなく、試合全体の流れへの影響まで分析すること。",
    );

    return lines.join("\n");
  })();
  const dataSparseBlock = isDataSparse
    ? [
        "【データスパースモード】スコアラー・ラインアップデータは存在しない。スコアと順位変動のみを記述し、試合展開の描写は行わないこと。",
        "- recent_form の直近5試合から得点力・失点傾向・連勝/連敗ストリークを読み取り本文に反映すること",
        "- competition_standings の順位変動（この試合結果による上昇/下降）を必ず計算して記述すること",
        "- h2h_last_5 の直近対戦スコアを引用し、今回の結果との比較を行うこと",
        "- key_stats の直近平均得点・失点と今回のスコアを対比して試合の特徴を示すこと",
        "- key_stats.match.penalty_count の合計が 8 以上の場合、テリトリー・プレッシャー型の試合と評価すること",
        "- key_stats.match.try_count からオープンなラグビー（ハイトライ）かキック主体（ロートライ）かを評価すること",
        "- key_stats.match.late_scoring が true の場合、終盤まで試合が動いた展開であることを明記すること",
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
      return [
        "この試合はプレーオフ戦（準々決勝または3位決定戦）です。",
        "敗者はそこでシーズン終了となる一発勝負の意義を # 試合全体像 の冒頭に必ず含めること。",
        `# 次戦への示唆では、competition_standings から勝者の次の対戦相手（${competitionLabel}の次のプレーオフ対戦相手）を特定して言及すること。`,
      ].join(" ");
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
    matchEventsBlock,
    scoreTimelineBlock,
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