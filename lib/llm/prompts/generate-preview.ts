import { hasConfirmedProjectedLineups } from "@/lib/llm/lineups";

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

export const PROMPT_VERSION = "preview@3.7.0";

type CorePatternType = "context" | "form" | "numeric";

const NUMERIC_AXES = [
  "攻撃力（平均得点）と守備力（平均失点）の対比",
  "得失点差（avg_score_diff_last_5）の対比",
  "直近5試合の勝率（win_rate_last_5）の対比",
] as const;

function selectCorePattern(assembled: AssembledContentInput): CorePatternType {
  const phase = assembled.match_phase;
  if (
    phase === "playoff_final" ||
    phase === "playoff_semifinal" ||
    phase === "playoff_third_place" ||
    phase === "playoff_other"
  ) {
    return "context";
  }

  const homeStreak = assembled.key_stats.home.result_streak;
  const awayStreak = assembled.key_stats.away.result_streak;
  if (
    homeStreak === "winning" ||
    homeStreak === "losing" ||
    awayStreak === "winning" ||
    awayStreak === "losing"
  ) {
    return "form";
  }

  return "numeric";
}

function selectNumericAxis(matchId: string): (typeof NUMERIC_AXES)[number] {
  const charCodeSum = [...matchId].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );

  return NUMERIC_AXES[charCodeSum % NUMERIC_AXES.length] ?? NUMERIC_AXES[0];
}

function buildCoreQuestionBlock(
  assembled: AssembledContentInput,
  matchId: string,
): string {
  const pattern = selectCorePattern(assembled);
  const lines = [
    "## セクション0（必須、200字以内）: # この試合の核心",
    "この試合の本質的な争点を1文で表す問いを設定し、その根拠を数値・実績・文脈で示すこと。",
    "以下の指定パターンだけを使うこと（パターン名は出力しない）:",
  ];

  if (pattern === "form") {
    lines.push(
      "【フォーム型で書くこと】連勝/連敗ストリークや直近の状態変化を軸にする",
      "例: 「5連勝中のBullsに、プレーオフ圏ギリギリのMunsterが土をつけられるか——フォームの差は数字ほど大きいか」",
    );
  } else if (pattern === "context") {
    lines.push(
      "【大会文脈型で書くこと】プレーオフ進出・降格・Grand Slamなど大会的意味を軸にする",
      "例: 「この一戦に勝てば自力でプレーオフ進出が決まるUlster——Glasgowの守備はその夢を断てるか」",
    );
  } else {
    const axis = selectNumericAxis(matchId);
    lines.push(
      `【数値対決型で書くこと】${axis}を軸にする`,
      "例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」",
    );
  }

  lines.push("このセクションを最初に必ず出力すること。");

  return lines.join("\n");
}

export function buildGeneratePreviewPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const hasLineups = hasConfirmedProjectedLineups(assembled.projected_lineups);
  const isDataSparse = assembled.match_events.length === 0 && !hasLineups;
  const structureInstruction = hasLineups
    ? [
        "構成: セクション0（この試合の核心）に続けて3セクション構成。",
        "文字数目安: 1セクション目400-500字、2セクション目600-700字、3セクション目300-400字。全体で1,500字以上を下限とし、下回ってはならない。",
        "各セクションの見出し名はこの試合の特性に応じて自由に設定すること（「両チーム現状」に固定しない）。3セクションのうち1つはキープレイヤー/注目マッチアップを扱うセクションにすること。",
        "見出し行には内容を要約した具体的なタイトルのみを書くこと。「セクション1」「セクション2」「Section 1」等の連番ラベルや「セクション0」を見出しに含めてはならない。",
      ].join("\n")
    : isDataSparse
      ? [
          "構成: セクション0（この試合の核心）に続けて3セクション構成。",
          "文字数目安: 1セクション目500-600字、2セクション目400-500字、3セクション目400-500字。全体で1,500字以上を下限とし、下回ってはならない。",
          "各セクションの見出し名はこの試合の特性に応じて自由に設定すること。キープレイヤーセクションは省略すること（ラインアップデータなし）。",
          "見出し行には内容を要約した具体的なタイトルのみを書くこと。「セクション1」「セクション2」「Section 1」等の連番ラベルや「セクション0」を見出しに含めてはならない。",
        ].join("\n")
      : [
          "構成: セクション0（この試合の核心）に続けて3セクション構成。",
          "文字数目安: 1セクション目400-500字、2セクション目600-700字、3セクション目300-400字。全体で1,500字以上を下限とし、下回ってはならない。",
          "各セクションの見出し名はこの試合の特性に応じて自由に設定すること。キープレイヤーセクションは省略すること（ラインアップデータなし）。",
          "見出し行には内容を要約した具体的なタイトルのみを書くこと。「セクション1」「セクション2」「Section 1」等の連番ラベルや「セクション0」を見出しに含めてはならない。",
        ].join("\n");
  const persona = buildPersona("preview");
  const coreQuestionBlock = buildCoreQuestionBlock(
    assembled,
    assembled.match.id,
  );
  const prohibitionsBlock = PROHIBITIONS_BLOCK;
  const signalsBlock = buildSignalsBlock(additionalSignals);
  const sourcedFactsBlock =
    assembled.sourced_facts.length === 0
      ? [
          "【sourced_facts: なし】外部記事・モデル訓練データ由来の統計・負傷・欠場・選手コメント・発言を一切使用してはならない。",
          "記述できるのは試合イベント・スコア・順位表・ラインアップなど入力データに存在するものだけ。",
          "数値を伴う統計が入力にない場合は、統計に触れずスコアの流れと戦術描写のみで構成すること。",
        ].join("\n")
      : [
          "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の根拠として使ってよい。",
          "使う場合は必ず自分の日本語で言い換えること。原文の長い直接引用は禁止。同一ソースから複数引用しないこと。",
          "sourced_facts に含まれないWeb由来の負傷・欠場・統計・発言を推測して書いてはならない。",
          JSON.stringify(assembled.sourced_facts),
        ].join("\n");
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
  const japaneseNameGlossary = assembled.japanese_name_glossary ?? [];
  const japaneseNameGlossaryBlock =
    japaneseNameGlossary.length === 0
      ? ""
      : [
          "【日本語表記グロッサリ】チーム名・大会名は以下の日本語表記を必ず使うこと。source の英語表記は本文に出さないこと。",
          JSON.stringify(japaneseNameGlossary),
        ].join("\n");
  const nameStyleInstruction =
    assembled.match.competition?.family === "league-one"
      ? "選手名は日本語表記を使用すること。外国人選手は英語の人名をカタカナに変換し、姓名の間に中点（・）を入れること。チーム名は日本語または通称表記を使用すること。"
      : [
          "選手名は必ずカタカナで記載すること。アルファベット表記は禁止。",
          "英語の人名はカタカナに変換し、姓名の間に中点（・）を入れること。",
          "アポストロフィ、van/de などの小辞、複合姓は日本語として自然な読みを優先すること。",
          "チーム名・大会名は日本語表記グロッサリまたは試合データ内の日本語名を使うこと。英語表記のまま出力しないこと。",
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
    "事実は試合データと sourced_facts に含まれるものだけを使用すること。入力にない統計・スコア・負傷・欠場・発言・選手名を推測・創作してはならない。",
    "選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
    lineupUsageBlock,
    "出力は日本語マークダウン本文のみ。",
    "強調記号（**、*、__、_）・コードブロック（```）は禁止。本文中で最も重要な一文だけを Markdown の引用（>）として1回使用し、それ以外の引用は禁止。見出し(#)と箇条書き(-)のみ使用すること。",
    japaneseNameGlossaryBlock,
    nameStyleInstruction,
    "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
    `試合データ: ${JSON.stringify(assembled)}`,
    dataSparseBlock,
    standingsBlock,
    sourcedFactsBlock,
    [
      "戦術ポイント（tactical_dimension / home_situation / away_situation / matchup_implication を本文の根拠として使うこと）:",
      JSON.stringify(tacticalPoints),
    ].join("\n"),
    signalsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
