import {
  hasConfirmedProjectedLineups,
  sanitizeUnconfirmedProjectedLineups,
} from "@/lib/llm/lineups";

import {
  buildPersona,
  buildSignalsBlock,
  buildStandingsBlock,
  NON_LEAGUE_ONE_PLAYER_NAME_STYLE_INSTRUCTION,
  PROHIBITIONS_BLOCK,
} from "./shared-prompt-blocks";

import type {
  AdditionalSignal,
  AssembledContentInput,
  MatchPhase,
  TacticalPoint,
} from "@/lib/llm/types";

export const PROMPT_VERSION = "recap@4.15.0";

const CORE_SECTION_INSTRUCTION = [
  "- この試合の核心: 150-250字。定型句を使わず、この試合固有の事実（最終スコア・決勝点のシチュエーション・試合の転換点）から書き始めること。",
  "  最初の一文は、試合を決定づけた特定の瞬間（分・選手・プレー）、試合前の予想との対比、または対戦構図・大会文脈における意味のいずれかから始めること。",
  "  「[スコア]という[形容]で」「[スコア]が示すように」のような、スコアの形容から始まる文型は使用しないこと。",
  "  書き方の例（パターン名は出力しない）:",
  "  ・逆転劇型: 「79分のトライで逆転——{チーム名}が3連敗から抜け出した必然」",
  "  ・戦術型: 「前半のスクラム圧倒が後半のペナルティ量産につながった{チーム名}の勝利構造」",
  "  ・スコア対比型: 「{点数}対{点数}という数字より、前半と後半で別々のチームになった試合だった」",
].join("\n");

function buildMatchContextBullet(matchPhase: MatchPhase | null): string {
  if (
    matchPhase === "playoff_final" ||
    matchPhase === "playoff_other" ||
    matchPhase === "playoff_third_place" ||
    matchPhase === "playoff_semifinal"
  ) {
    return "- プレーオフという文脈と一発勝負の重み（80字程度）";
  }

  return "- 大会内での位置づけ（大会名・シーズン・順位表への影響、分かる場合はラウンド名）（80字程度）";
}

export function buildGenerateRecapPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const hasEvents = assembled.match_events.length > 0;
  const hasLineups = hasConfirmedProjectedLineups(assembled.projected_lineups);
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
        CORE_SECTION_INSTRUCTION,
        "- 試合全体像: 500-600字",
        "- ターニングポイント: 600-750字",
        "- 注目選手: 400-500字。projected_lineups または match_events に存在する実名を使い、この試合での貢献・プレー内容を具体的に記述する",
        "- 次戦への示唆: 350-450字",
        "",
        "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
        "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# MOM`・`# マン・オブ・ザ・マッチ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
        `全体で2,000字以上を必ず満たすこと。${sectionHeadingInstruction}`,
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
          CORE_SECTION_INSTRUCTION,
          "- 試合全体像: 550-700字",
          "- 大会文脈と順位への影響: 450-550字",
          "- 両チームの近況と戦術傾向: 550-700字",
          "- 次戦への示唆: 350-450字",
          "",
          "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
          "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
          `全体で2,000字以上を必ず満たすこと。MOM セクションは省略すること。${sectionHeadingInstruction}`,
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
          "# この試合の核心（150-250字）",
          CORE_SECTION_INSTRUCTION,
          "",
          "# 試合全体像（550-700字）— 以下の要素をすべて含めること:",
          buildMatchContextBullet(assembled.match_phase),
          "- 前半の展開とスコア推移（150字程度）",
          "- 後半の展開とスコア推移（150字程度）",
          "- 両チームの戦術的特徴・優劣の評価（200字程度）",
          "",
          "# ターニングポイント（900-1,100字）— 以下の要素をすべて含めること:",
          "- リード変化が起きた時点（分・スコア・選手名）を時系列で整理（200字程度）",
          "- 逆転を許した側の守備・戦術的崩壊の原因分析（200字程度）",
          "- 再逆転を実現した側の対応・何が機能したか（200字程度）",
          "- 試合全体の流れへの影響（単なる事実列挙ではなく因果を述べること）（150字程度）",
          "- このセクションの末尾に、試合を決定づけた選手1名の貢献（プレー内容・統計・影響）を150-200字で分析すること（MOM相当の内容をここに統合する）",
          "",
          "# 次戦への示唆（400-500字）— 以下の要素をすべて含めること:",
          "- 勝者の次の対戦相手と対戦構図（80字程度）",
          "- 今試合から見えた勝者の課題（160字程度）",
          "- 今試合から見えた敗者の収穫・来シーズンへの示唆（160字程度）",
          "",
          "見出し行には「# セクション名」のみを書くこと。字数指示・説明文を見出し行に含めてはならない。",
          "**上記4つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# MOM`・`# マン・オブ・ザ・マッチ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。`# MOM` は `# ターニングポイント` 末尾に統合済みのため独立セクションは不要。**",
          `全体で2,000字以上を必ず満たすこと。${sectionHeadingInstruction}`,
        ].join("\n");
  const persona = buildPersona("recap");
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
          "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の趣旨に沿うものはできるだけ多く反映すること。ただし、個々の事実を無理にこじつけて記述してはならない。",
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
  const derivedStatsBlock = !assembled.derived_stats
    ? ""
    : [
        "【派生スタッツ derived_stats】以下は得点イベントから機械的に算出した実数値です。本文の根拠として自由に使ってよい。",
        "連続得点・逆転幅・シンビン中の失点・得点手段の内訳・トライスコアラーのポジションは、戦術描写の具体化に積極的に使うこと。",
        "キック成功は「ゴール4/5」のような分数表記のみ。「成功率」「○%」のようなパーセント表記は使用禁止。",
        JSON.stringify(assembled.derived_stats),
      ].join("\n");
  const teamStatsBlock = !assembled.team_stats
    ? ""
    : [
        "【チームスタッツ team_stats】以下は公式サイトから取得した実際のチームスタッツです。ポゼッション率・成功率等の数値表現をそのまま使ってよい。",
        "スクラム・ラインアウト・タックル・キャリー・ペナルティ等の差は、戦術描写の具体化に積極的に使うこと。ただし、このJSONに存在しない統計は推測して書かないこと。",
        "以下のJSONに含まれる項目のうち、最低3種類は本文中で両チームの具体的な数値とともに引用すること（例:「ポゼッションは日本48%・アイルランド52%」のように両チームの値を対比させる）。1〜2項目のみの引用に留めず、この試合の勝敗を最も特徴づける項目（ポゼッション・テリトリー・タックル数・ターンオーバー等、優劣が明確な項目）を優先して選ぶこと。",
        "数値を引用する際は、「安定した基盤からの攻撃が展開された」「主導権を握った」のような一般論で終わらせず、その数値が具体的にどのプレー・展開に結びついたかを一段深く説明すること（例:「ラインアウト成功率90%の安定感により、ゴール前でのモール連続攻撃が可能になり、◯◯のトライに直結した」のように、数値→試合中の具体的な事象→結果、という因果の連鎖を示すこと）。ただし入力データに存在しない具体的なプレー描写を創作してはならず、match_events・sourced_facts等、他のブロックに実際に存在する事実の範囲内で因果関係を組み立てること。",
        "team_statsのJSONにキーが存在しない項目については、その統計について一切言及しないこと。「◯◯はゼロだった」「◯◯を犯さなかった」等、ゼロを明示的に主張してよいのは、そのJSON内で該当フィールドの値が実際に0として明示されている場合のみである。",
        JSON.stringify(assembled.team_stats),
      ].join("\n");
  const dataSparseBlock = isDataSparse
    ? [
        "【データスパースモード】スコアラー・ラインアップデータは存在しない。スコアと順位変動のみを記述し、試合展開の描写は行わないこと。",
        "- recent_form の直近5試合から連勝/連敗ストリーク・平均得失点の傾向（攻撃型 or 守備型か）・直近の勝ち方の特徴を読み取り本文に反映すること。冒頭は「得点力」で始めず、直近の試合展開・プレースタイルの特徴・今節の文脈から書き始めること",
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
  const sanitizedAssembled = sanitizeUnconfirmedProjectedLineups(assembled);
  const japaneseNameGlossaryBlock =
    japaneseNameGlossary.length === 0
      ? ""
      : [
          "【日本語表記グロッサリ】チーム名・大会名・選手名は以下の日本語表記を必ず使うこと。source の英語表記は本文に出さないこと。",
          JSON.stringify(japaneseNameGlossary),
        ].join("\n");
  const nameStyleInstruction =
    assembled.match.competition?.family === "league-one"
      ? "選手名は日本語表記を使用すること。外国人選手は英語の人名をカタカナに変換し、姓名の間に中点（・）を入れること。チーム名は日本語または通称表記を使用すること。"
      : NON_LEAGUE_ONE_PLAYER_NAME_STYLE_INSTRUCTION;

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
    "強調記号（**、*、__、_）・コードブロック（```）は禁止。本文中で最も重要な一文だけを Markdown の引用（>）として1回使用し、それ以外の引用は禁止。見出し(#)と箇条書き(-)のみ使用すること。",
    japaneseNameGlossaryBlock,
    nameStyleInstruction,
    "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
    `試合データ: ${JSON.stringify(sanitizedAssembled)}`,
    matchEventsBlock,
    scoreTimelineBlock,
    derivedStatsBlock,
    teamStatsBlock,
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
