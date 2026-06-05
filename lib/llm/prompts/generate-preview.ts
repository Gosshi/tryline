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

export const PROMPT_VERSION = "preview@3.3.0";

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
    ? "構成: 3セクション構成（セクション0を除く）。1)400-500字 2)600-700字 3)300-400字。全体で1,500字以上を下限とし、下回ってはならない。各セクションの見出し名はこの試合の特性に応じて自由に設定すること（「両チーム現状」に固定しない）。3セクションのうち1つはキープレイヤー/注目マッチアップを扱うセクションにすること。"
    : isDataSparse
      ? "構成: 3セクション構成（セクション0を除く）。1)500-600字 2)400-500字 3)400-500字。全体で1,500字以上を下限とし、下回ってはならない。各セクションの見出し名はこの試合の特性に応じて自由に設定すること。キープレイヤーセクションは省略すること（ラインアップデータなし）。"
      : "構成: 3セクション構成（セクション0を除く）。1)400-500字 2)600-700字 3)300-400字。全体で1,500字以上を下限とし、下回ってはならない。各セクションの見出し名はこの試合の特性に応じて自由に設定すること。キープレイヤーセクションは省略すること（ラインアップデータなし）。";
  const persona = buildPersona("preview");
  const coreQuestionBlock = [
    "## セクション0（必須、200字以内）: # この試合の核心",
    "この試合の本質的な争点を1文で表す問いを設定し、その根拠を数値・実績・文脈で示すこと。",
    "以下の3パターンのうち、この試合に最も合うものを選ぶこと（パターン名は出力しない）:",
    "【数値対決型】攻撃力・守備力・スクラム勝率など対照的な指標を対比する",
    "  例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」",
    "【フォーム型】連勝/連敗ストリークや直近の状態変化を軸にする",
    "  例: 「5連勝中のBullsに、プレーオフ圏ギリギリのMunsterが土をつけられるか——フォームの差は数字ほど大きいか」",
    "【大会文脈型】プレーオフ進出・降格・Grand Slamなど大会的意味を軸にする",
    "  例: 「この一戦に勝てば自力でプレーオフ進出が決まるUlster——Glasgowの守備はその夢を断てるか」",
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
  const lineupUsageBlock = hasLineups
    ? [
        "【ラインアップ実名活用】projected_lineups に存在する選手名は積極的に本文へ登場させること。",
        "- projected_lineups.home から最低3名、projected_lineups.away から最低3名の実名を本文に含めること。",
        "- キーポジション（9番、10番、11番・14番・15番、主将、2番など）を優先し、先発選手は「先発」として扱うこと。",
        "- is_starter が false の選手は「ベンチ」「リザーブ」「途中投入候補」として区別し、先発扱いしないこと。",
        "- 対面ポジションまたは役割が近い選手同士の実名マッチアップを最低1つ描くこと。",
        "- match_events に存在する選手名も実在名として利用してよい。ただし projected_lineups・match_events に存在しない選手名、役職、引退・移籍などの外部文脈は創作しないこと。",
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

    if (phase === "playoff_third_place") {
      return "この試合は3位決定戦です。決勝ではありません。3位（ブロンズ）を懸けた一戦として描写し、「決勝」「チャンピオン」「優勝」「タイトル」という表現を使わないこと。";
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
    "各セクションが指定範囲の下限を下回った場合は、入力データにある recent_form・h2h_last_5・competition_standings・key_stats・projected_lineups・match_events から具体的な根拠を追加して書き足すこと。",
    "全体が1,500字未満の場合は出力前に薄いセクションを加筆すること。水増し、同義反復、一般論、「字数確認済み」などのメタコメントは禁止。",
    "事実は入力データと一致させること。直接引用は15語以内。",
    "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
    lineupUsageBlock,
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
