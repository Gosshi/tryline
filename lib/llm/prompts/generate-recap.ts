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

export const PROMPT_VERSION = "recap@4.6.0";

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
        "出力するセクション（この順番・この見出し名のみ使用、変更・追加・省略は禁止）:",
        "# この試合の核心",
        "# 試合全体像",
        "# ターニングポイント",
        "# 注目選手",
        "# 次戦への示唆",
        "",
        "各セクションの字数目標と内容指示:",
        "- この試合の核心: 200字以内。試合前の「何 対 何の争い」に対し実際の結果がどう答えたかを1〜2文で述べる",
        "- 試合全体像: 400-500字",
        "- ターニングポイント: 500-600字",
        "- 注目選手: 300-400字。projected_lineups または match_events に存在する実名を使い、この試合での貢献・プレー内容を具体的に記述する",
        "- 次戦への示唆: 300-400字",
        "",
        "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
        "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# MOM`・`# マン・オブ・ザ・マッチ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
        `全体で2,000字以上を目標とすること。${sectionHeadingInstruction}`,
      ].join("\n")
    : isDataSparse
      ? [
          "出力するセクション（この順番・この見出し名のみ使用、変更・追加・省略は禁止）:",
          "# この試合の核心",
          "# 試合全体像",
          "# 大会文脈と順位への影響",
          "# 両チームの近況と戦術傾向",
          "# 次戦への示唆",
          "",
          "各セクションの字数目標と内容指示:",
          "- この試合の核心: 200字以内。試合前の「何 対 何の争い」に対し実際の結果がどう答えたかを1〜2文で述べる",
          "- 試合全体像: 500-600字",
          "- 大会文脈と順位への影響: 400-500字",
          "- 両チームの近況と戦術傾向: 500-600字",
          "- 次戦への示唆: 300-400字",
          "",
          "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
          "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
          `全体で2,000字以上を目標とすること。MOM セクションは省略すること。${sectionHeadingInstruction}`,
        ].join("\n")
      : [
          "出力するセクション（この順番・この見出し名のみ使用、変更・追加・省略は禁止）:",
          "# この試合の核心",
          "# 試合全体像",
          "# ターニングポイント",
          "# 次戦への示唆",
          "",
          "【字数目標と記述内容（各セクションは下限を必ず満たすこと）】",
          "",
          "# この試合の核心（100-200字）",
          "- 試合前の「何 対 何の争い」に対し実際の結果がどう答えたかを1〜2文で述べる",
          "",
          "# 試合全体像（400-500字）— 以下の要素をすべて含めること:",
          "- プレーオフという文脈と一発勝負の重み（50字程度）",
          "- 前半の展開とスコア推移（100字程度）",
          "- 後半の展開とスコア推移（100字程度）",
          "- 両チームの戦術的特徴・優劣の評価（150字程度）",
          "",
          "# ターニングポイント（700-850字）— 以下の要素をすべて含めること:",
          "- リード変化が起きた時点（分・スコア・選手名）を時系列で整理（150字程度）",
          "- 逆転を許した側の守備・戦術的崩壊の原因分析（150字程度）",
          "- 再逆転を実現した側の対応・何が機能したか（150字程度）",
          "- 試合全体の流れへの影響（単なる事実列挙ではなく因果を述べること）（100字程度）",
          "- このセクションの末尾に、試合を決定づけた選手1名の貢献（プレー内容・統計・影響）を100-150字で分析すること（MOM相当の内容をここに統合する）",
          "",
          "# 次戦への示唆（300-400字）— 以下の要素をすべて含めること:",
          "- 勝者の次の対戦相手と対戦構図（50字程度）",
          "- 今試合から見えた勝者の課題（100字程度）",
          "- 今試合から見えた敗者の収穫・来シーズンへの示唆（100字程度）",
          "",
          "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
          "**上記4つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# MOM`・`# マン・オブ・ザ・マッチ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。`# MOM` は `# ターニングポイント` 末尾に統合済みのため独立セクションは不要。**",
          `全体で1,600字以上を目標とすること。${sectionHeadingInstruction}`,
        ].join("\n");
  const persona = buildPersona("recap");
  const prohibitionsBlock = PROHIBITIONS_BLOCK;
  const signalsBlock = buildSignalsBlock(additionalSignals);
  const sourcedFactsBlock =
    assembled.sourced_facts.length === 0
      ? ""
      : [
          "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の根拠として使ってよい。",
          "使う場合は必ず自分の日本語で言い換えること。原文の長い直接引用は禁止。同一ソースから複数引用しないこと。",
          "sourced_facts に含まれないWeb由来の負傷・欠場・統計・発言を推測して書いてはならない。",
          JSON.stringify(assembled.sourced_facts),
        ].join("\n");
  const standingsBlock = buildStandingsBlock(
    assembled.competition_standings,
    "recap",
  );
  const matchEventsBlock = !hasEvents
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
  const lineupUsageBlock = hasLineups
    ? [
        "【ラインアップ実名活用】projected_lineups に存在する選手名は積極的に本文へ登場させること。",
        "- projected_lineups.home から最低3名、projected_lineups.away から最低3名の実名を本文に含めること。",
        "- キーポジション（9番、10番、11番・14番・15番、主将、2番など）を優先し、先発選手は「先発」として扱うこと。",
        "- is_starter が false の選手は「ベンチ」「リザーブ」「途中投入候補」として区別し、先発扱いしないこと。",
        "- 対面ポジションまたは役割が近い選手同士の実名マッチアップを最低1つ描くこと。",
        "- match_events に存在する得点者・カード対象者などの選手名も実在名として利用してよい。ただし projected_lineups・match_events に存在しない選手名、役職、引退・移籍などの外部文脈は創作しないこと。",
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

    if (phase === "playoff_third_place") {
      return "この試合は3位決定戦です。決勝ではありません。3位（ブロンズ）を懸けた一戦として描写し、「決勝」「チャンピオン」「優勝」「タイトル」という表現を使わないこと。";
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
    prohibitionsBlock,
    structureInstruction,
    matchPhaseBlock,
    "各セクションが指定字数の**下限**を下回ってはならない。下限未満なら具体的な事実・戦術分析・選手描写を追加して下限まで書き足すこと。「字数確認済み」などのメタコメントは出力禁止。",
    "事実は入力データと一致させること。直接引用は15語以内。",
    "事実は試合データと sourced_facts に含まれるものだけを使用すること。入力にない統計・スコア・負傷・欠場・発言・選手名を推測・創作してはならない。",
    "選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
    lineupUsageBlock,
    "出力は日本語マークダウン本文のみ。",
    "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
    japaneseNameGlossaryBlock,
    nameStyleInstruction,
    "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
    `試合データ: ${JSON.stringify(assembled)}`,
    matchEventsBlock,
    scoreTimelineBlock,
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
