import { getContentLengthRequirement } from "@/lib/llm/content-length";

import type { ContentLanguage, ContentType } from "@/lib/llm/types";

export const PROMPT_VERSION = "qa@2.1.0";

export type QaMatchContext = {
  awayScore: number | null;
  awayTeam: string;
  homeScore: number | null;
  homeTeam: string;
};

export function buildQaContentPrompt(
  contentType: ContentType,
  narrative: string,
  language: ContentLanguage,
  matchContext: QaMatchContext,
  hasEvents = false,
): string {
  const lengthRequirement = getContentLengthRequirement(contentType, language);
  const unitLabel = lengthRequirement.unit === "words" ? " words" : "字";
  const minLength = lengthRequirement.min;
  const languageLabel = language === "en" ? "English" : "日本語";
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
          "スコアが高い方のチームが実際の勝者である。",
          "本文中で敗者チームが勝利したかのように書かれていれば factual_grounding を 1 にすること。",
          "引き分け（同点）の場合はこのチェックを無視する。",
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

  return [
    `あなたは編集デスクです。以下の${languageLabel}コンテンツを品質評価してください。`,
    `content_type: ${contentType}`,
    [
      "## 採点ルーブリック",
      "",
      "### information_density (1-5)",
      `- 5: ${minLength}${unitLabel}以上かつ具体的な試合描写・戦術分析・選手名が豊富`,
      `- 4: ${minLength}${unitLabel}以上かつ一般的な内容を含むが実質的な情報あり`,
      `- 3: ${Math.round(minLength * 0.75)}${unitLabel}以上。情報密度は普通`,
      `- 2: ${Math.round(minLength * 0.5)}${unitLabel}未満、または内容が薄く抽象的な記述が多い`,
      "- 1: 極めて短い、または内容がほぼない",
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
    'JSONのみで返答。スキーマ: {"scores":{"information_density":1-5,"japanese_quality":1-5,"factual_grounding":1-5,"tactical_depth":1-5},"issues":string[]}',
    `本文: ${narrative}`,
  ].join("\n\n");
}
