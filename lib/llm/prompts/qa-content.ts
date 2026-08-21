import { getContentLengthRequirement } from "@/lib/llm/content-length";

import type {
  AssembledContentInput,
  ContentLanguage,
  ContentType,
  DerivedMatchStats,
  MatchTeamStats,
  SourcedFactInput,
} from "@/lib/llm/types";

export const PROMPT_VERSION = "qa@2.9.0";

export type TeamFormStats = {
  avg_points_against_last_5?: number | null;
  avg_points_for_last_5?: number | null;
  record_last_5?: string | null;
  win_rate_last_5: number | null;
};

export type QaMatchContext = {
  awayScore: number | null;
  awayTeam: string;
  competitionName?: string | null;
  derivedStats?: DerivedMatchStats | null;
  formStats?: {
    away: TeamFormStats | null;
    home: TeamFormStats | null;
  };
  homeScore: number | null;
  homeTeam: string;
  recent_form?: AssembledContentInput["recent_form"];
  sourcedFacts?: SourcedFactInput[];
  teamStats?: MatchTeamStats;
  venue?: string | null;
};

export function buildQaContentPrompt(
  contentType: ContentType,
  narrative: string,
  language: ContentLanguage,
  matchContext: QaMatchContext,
  hasEvents = false,
  playerStatNames: string[] = [],
): string {
  const lengthRequirement = getContentLengthRequirement(contentType, language);
  const unitLabel = lengthRequirement.unit === "words" ? " words" : "字";
  const minLength = lengthRequirement.min;
  const languageLabel = language === "en" ? "English" : "日本語";
  const isJapaneseSourcedFactsContent =
    language === "ja" && (contentType === "recap" || contentType === "preview");
  const sourcedFactsCount = matchContext.sourcedFacts?.length ?? 0;
  const qualityRubric =
    language === "en"
      ? [
          "### japanese_quality (1-5)",
          "- 5: Natural English. Rugby terminology is accurate. Clear, readable style",
          "- 4: Mostly natural English with minor awkward phrasing",
          "- 3: Understandable but with some unnatural or translated phrasing",
          "- 2: Frequent grammar problems or hard-to-read phrasing",
          "- 1: Not coherent English",
        ].join("\n")
      : [
          "### japanese_quality (1-5)",
          "- 5: 自然な日本語。ラグビー用語が正確。読みやすい文体",
          "- 4: ほぼ自然。軽微な不自然さあり",
          "- 3: 理解可能だが不自然な表現・直訳調が散見される",
          "- 2: 文法的に誤り、または英語混じりで読みにくい",
          "- 1: 日本語として成立していない",
        ].join("\n");
  const winnerCheckBlock =
    contentType === "recap" &&
    matchContext.homeScore !== null &&
    matchContext.awayScore !== null
      ? [
          "## 勝者整合性チェック",
          `この試合のスコア: ${matchContext.homeTeam} ${matchContext.homeScore} — ${matchContext.awayTeam} ${matchContext.awayScore}`,
          "本文の結論部分が最終的にどちらのチームを勝者として述べているかだけを分類し、JSONの statedWinner に入れること。",
          `statedWinner は "${matchContext.homeTeam} が勝者として述べられている" なら "home"、"${matchContext.awayTeam} が勝者として述べられている" なら "away"、勝者記述がない・曖昧・引き分けとして扱っている場合は "unclear" にすること。`,
          "ここでは正誤判定をしない。スコアとの照合はプログラム側で行う。",
        ].join("\n")
      : "";
  const turningPointCheckBlock =
    contentType === "recap" && hasEvents
      ? [
          "## セクション構成チェック（events がある recap のみ適用）",
          "本文に「# ターニングポイント」という見出しが含まれているかチェックすること。",
          "含まれていない場合は issues に「ターニングポイントセクションが欠落しています」を追加し、",
          "information_density のスコアを最大 3 に制限すること。",
        ].join("\n")
      : "";
  const playerStatCheckBlock =
    contentType === "recap" && hasEvents
      ? [
          "## 選手別得点統計チェック",
          "本文中で、選手名とともに具体的なトライ数・コンバージョン成功数・ペナルティゴール数・合計得点のいずれかを定量的に主張している箇所を抽出し、JSONの statedPlayerStats に入れること。",
          playerStatNames.length > 0
            ? `実際の得点者名一覧（英語表記）: ${JSON.stringify(playerStatNames)}`
            : "実際の得点者名一覧は空です。",
          "本文中の選手名がカタカナ等の日本語表記でも、statedPlayerStats[].playerName には上記一覧から対応する英語表記を選んで入れること。",
          "上記一覧のどの選手にも確信を持って対応づけられない場合、その主張は statedPlayerStats に含めないこと。",
          "該当する定量主張がない場合は statedPlayerStats を空配列にすること。",
          "ここでは正誤判定をしない。match_events との照合はプログラム側で行う。",
        ].join("\n")
      : "";
  const sourcedFactsBlock =
    matchContext.sourcedFacts && matchContext.sourcedFacts.length > 0
      ? [
          "## sourced_facts grounding",
          "以下はallowlist済み出典から抽出された許可済み事実です。本文の事実根拠としてDB入力と同等に扱ってよい。",
          "ただし、本文がこの一覧に無いWeb由来の統計・欠場・負傷・発言・カード情報を述べている場合は factual_grounding を下げること。",
          JSON.stringify(matchContext.sourcedFacts),
        ].join("\n")
      : [
          "## sourced_facts grounding",
          "sourced_facts はゼロです。本文がWeb由来の統計・負傷・欠場・選手コメント・発言（入力データにない内容）を含む場合は factual_grounding を 2 以下に下げること。",
        ].join("\n");
  const sourcedFactsDensityBlock = !isJapaneseSourcedFactsContent
    ? ""
    : sourcedFactsCount === 0
      ? [
          `## ${contentType} sourced_facts 反映度チェック`,
          `この${contentType}の sourced_facts は0件です。information_density は sourced_facts の反映度で下げず、従来どおり字数・具体性・水増しの有無で評価すること。`,
        ].join("\n")
      : [
          `## ${contentType} sourced_facts 反映度チェック`,
          `この${contentType}で反映候補となる sourced_facts は ${sourcedFactsCount} 件です。`,
          "本文の趣旨に沿う事実が、自分の日本語として本文に反映されているかを照合して information_density を評価すること。単なる列挙や不自然なこじつけは反映として数えないこと。",
          "背番号と実名を根拠なく並べただけのラインアップ羅列は、実在の選手名を含んでいても情報密度を上げる根拠にしてはならない。",
          "team_stats が入力されている場合は、本文の趣旨に沿う主要な数値の活用も情報密度の具体性として考慮すること。",
        ].join("\n");
  const informationDensityRubric = [
    "### information_density (1-5)",
    isJapaneseSourcedFactsContent && sourcedFactsCount > 0
      ? `- 5: ${minLength}${unitLabel}以上かつ具体的な試合描写・戦術分析・選手名が豊富で、本文の趣旨に沿う sourced_facts のおおむね7割以上を自分の日本語で反映している`
      : `- 5: ${minLength}${unitLabel}以上かつ具体的な試合描写・戦術分析・選手名が豊富`,
    isJapaneseSourcedFactsContent && sourcedFactsCount > 0
      ? `- 4: ${minLength}${unitLabel}以上かつ実質的な情報があるが、sourced_facts の反映が一部にとどまる`
      : `- 4: ${minLength}${unitLabel}以上かつ一般的な内容を含むが実質的な情報あり`,
    `- 3: ${Math.round(minLength * 0.75)}${unitLabel}以上。情報密度は普通`,
    `- 2: ${Math.round(minLength * 0.5)}${unitLabel}未満、または内容が薄く抽象的な記述が多い`,
    "- 1: 極めて短い、または内容がほぼない",
  ].join("\n");
  const derivedStatsBlock = !matchContext.derivedStats
    ? ""
    : [
        "## derived_stats grounding",
        "以下は得点イベントから機械的に算出された実数値です。本文がこれらの数値（連続得点・コンバージョン成否・シンビン中の失点等）に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
        JSON.stringify(matchContext.derivedStats),
      ].join("\n");
  const teamStatsBlock = !matchContext.teamStats
    ? ""
    : [
        "## team_stats grounding",
        "以下は公式サイトから取得した実データです。本文がこれらの数値（ポゼッション率・セットピース成功数・タックル数・キャリー数等）に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
        "ただし、この一覧に無いチームスタッツや成功率を本文が述べている場合は factual_grounding を下げること。",
        JSON.stringify(matchContext.teamStats),
      ].join("\n");
  const matchMetadata = {
    ...(matchContext.competitionName
      ? { competition_name: matchContext.competitionName }
      : {}),
    ...(matchContext.venue ? { venue: matchContext.venue } : {}),
  };
  const matchMetadataBlock =
    Object.keys(matchMetadata).length === 0
      ? ""
      : [
          "## match_metadata grounding",
          "以下は試合に紐づく実データです。本文がこれらの大会名・会場に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
          JSON.stringify(matchMetadata),
        ].join("\n");
  const formStats = Object.fromEntries(
    [
      ["away", matchContext.formStats?.away],
      ["home", matchContext.formStats?.home],
    ].flatMap(([side, stats]) => {
      const values = stats
        ? Object.fromEntries(
            Object.entries(stats).filter(
              ([, value]) => value !== null && value !== undefined,
            ),
          )
        : {};

      return Object.keys(values).length > 0 ? [[side, values]] : [];
    }),
  );
  const formStatsBlock =
    Object.keys(formStats).length === 0
      ? ""
      : [
          "## form_stats grounding",
          "以下は直近の試合データから機械的に算出された実数値です。本文がこれらの直近フォーム（戦績・平均得点）に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
          JSON.stringify(formStats),
        ].join("\n");
  const recentFormBlock =
    !matchContext.recent_form ||
    (matchContext.recent_form.away.length === 0 &&
      matchContext.recent_form.home.length === 0)
      ? ""
      : [
          "## recent_form grounding",
          "以下は直近5試合の個別結果です。本文がこれらの対戦相手・スコア・ホーム/アウェーに言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
          JSON.stringify(matchContext.recent_form),
        ].join("\n");

  return [
    `あなたは編集デスクです。以下の${languageLabel}コンテンツを品質評価してください。`,
    `content_type: ${contentType}`,
    [
      "## 採点ルーブリック",
      "",
      informationDensityRubric,
      "",
      "## 字数ゲート",
      `本文が${minLength}${unitLabel}未満の場合は issues に「本文が目標字数の下限未満です」を必ず追加すること。`,
      "ただし字数を満たしていても、同じ内容の言い換えや一般論で水増ししている場合は information_density を下げること。",
      "",
      qualityRubric,
      "",
      "### factual_grounding (1-5)",
      "- 5: スコア・選手名・戦術がすべて入力データと一致",
      "- 4: 軽微な推測・補足あり。事実の誤りなし",
      "- 3: 一部入力にない記述があるが大筋は正確",
      "- 2: 入力データと矛盾する記述がある",
      "- 1: 事実誤認が多数または捏造が疑われる",
      "",
      "### tactical_depth (1-5)",
      "- 5: すべての戦術ポイントに具体的な数値・選手名・プレー描写が含まれ、一般論が皆無",
      "- 4: 大部分が具体的。軽微な一般論が1〜2箇所",
      "- 3: 数値や具体描写はあるが「好調」「重要」等の一般論も目立つ",
      "- 2: 「好調」「鍵となる」等の表層的な記述が支配的",
      "- 1: ほぼすべてが一般論または機械的な要約",
    ].join("\n"),
    winnerCheckBlock,
    turningPointCheckBlock,
    playerStatCheckBlock,
    sourcedFactsBlock,
    sourcedFactsDensityBlock,
    derivedStatsBlock,
    teamStatsBlock,
    matchMetadataBlock,
    formStatsBlock,
    recentFormBlock,
    'JSONのみで返答。スキーマ: {"scores":{"information_density":1-5,"japanese_quality":1-5,"factual_grounding":1-5,"tactical_depth":1-5},"issues":string[],"statedWinner":"home"|"away"|"unclear","statedPlayerStats":[{"playerName":string,"tries"?:number,"conversions"?:number,"penaltyGoals"?:number,"totalPoints"?:number}]}',
    `本文: ${narrative}`,
  ].join("\n\n");
}
