import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";

import type { TryScorer } from "@/lib/x/reply-text";

export type ImpressionTweetParams = {
  awayScore: number;
  awayTeamName: string;
  competitionLabel: string;
  homeScore: number;
  homeTeamName: string;
  recapExcerpt: string;
  tryScorers: TryScorer[];
};

const MAX_TWEET_LENGTH = 180;
const URL_PATTERN = /https?:\/\/\S+/g;
const SYSTEM_PROMPT = `あなたはTrylineの日本語ラグビー編集者です。
試合レビューの読みどころが伝わるX投稿を1つ書いてください。

ルール:
- 日本語のみ。URLは含めない。
- 「AI」「戦術分析」という言葉は使わない。
- 「記事はこちら」「チェック」などの露骨な宣伝文は禁止。
- カジュアルすぎる一人称や「楽しみ！」で終わる文体は禁止。
- 試合固有の勝負どころ、流れの変化、終盤の分岐点を1つ入れる。
- 「レビューでは〜を整理しています」のように、読む理由が伝わる文にする。
- ハッシュタグは1〜2個のみ（大会名か #ラグビー）。
- 180文字以内。
- ツイート本文のみを出力し、他の文字は含めない。`;

function buildUserMessage(params: ImpressionTweetParams): string {
  const scorersText =
    params.tryScorers.length > 0
      ? params.tryScorers
          .slice(0, 3)
          .map((scorer) =>
            scorer.count >= 2
              ? `${scorer.playerName}（${scorer.count}本）`
              : `${scorer.playerName}（1本）`,
          )
          .join("、")
      : "（データなし）";

  return [
    `試合: ${params.homeTeamName} ${params.homeScore}-${params.awayScore} ${params.awayTeamName}`,
    `大会: ${params.competitionLabel}`,
    `主なトライ得点者: ${scorersText}`,
    `コンテンツ抜粋: ${params.recapExcerpt.slice(0, 200)}`,
  ].join("\n");
}

function trimToTweetLength(text: string): string {
  const chars = [...text];
  if (chars.length <= MAX_TWEET_LENGTH) {
    return text;
  }

  return `${chars
    .slice(0, MAX_TWEET_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

function sanitizeTweetText(text: string): string | null {
  const sanitized = text.replace(URL_PATTERN, "").replace(/\s+/g, " ").trim();
  if (!sanitized) {
    return null;
  }

  return trimToTweetLength(sanitized);
}

export async function generateImpressionTweet(
  params: ImpressionTweetParams,
): Promise<string | null> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      max_tokens: 120,
      messages: [
        {
          content: SYSTEM_PROMPT,
          role: "system",
        },
        {
          content: buildUserMessage(params),
          role: "user",
        },
      ],
      model: MODELS.FAST,
      temperature: 0.9,
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text ? sanitizeTweetText(text) : null;
  } catch {
    return null;
  }
}
