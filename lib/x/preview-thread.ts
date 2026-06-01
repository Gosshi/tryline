import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";
import { buildReplyText } from "@/lib/x/post";

export type PreviewThreadParams = {
  awayTeamName: string;
  competitionFamily: string | null;
  competitionLabel: string;
  homeTeamName: string;
  matchId: string;
  previewMarkdown: string;
};

export type PreviewThread = {
  tweet1: string;
  tweet2: string;
  tweet3: string;
};

const TWEET_TEXT_LIMIT = 120;
const URL_PATTERN = /https?:\/\/\S+/g;
const SYSTEM_PROMPT = `ラグビーのプレビュー記事をもとに、X（Twitter）スレッド用のツイートを2本生成してください。

【ツイート1: 核心フック】
- 「# この試合の核心」セクションの問いを1文に絞り、120字以内で書くこと
- 語尾は「——か？」「——なるか」など問いかけ形式を維持する
- ハッシュタグなし、URLなし

【ツイート2: 注目ポイント】
- プレビュー全体から「注目ポイント」を3点、箇条書き（-）で書くこと
- 全体120字以内
- 末尾にハッシュタグを1〜2個付ける
- URLなし

出力形式（JSON）: {"tweet1": "...", "tweet2": "..."}`;

function buildUserMessage(params: PreviewThreadParams): string {
  return [
    `大会: ${params.competitionLabel}`,
    `${params.homeTeamName} vs ${params.awayTeamName}`,
    "",
    params.previewMarkdown.slice(0, 800),
  ].join("\n");
}

function sanitizeTweet(text: string): string {
  const sanitized = text.replace(URL_PATTERN, "").trim();
  const chars = [...sanitized];
  if (chars.length <= TWEET_TEXT_LIMIT) {
    return sanitized;
  }

  return `${chars
    .slice(0, TWEET_TEXT_LIMIT - 1)
    .join("")
    .trimEnd()}…`;
}

export async function generatePreviewThread(
  params: PreviewThreadParams,
): Promise<PreviewThread | null> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      max_tokens: 300,
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
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { tweet1?: unknown; tweet2?: unknown };
    const tweet1 =
      typeof parsed.tweet1 === "string" ? sanitizeTweet(parsed.tweet1) : null;
    const tweet2 =
      typeof parsed.tweet2 === "string" ? sanitizeTweet(parsed.tweet2) : null;

    if (!tweet1 || !tweet2) {
      return null;
    }

    return {
      tweet1,
      tweet2,
      tweet3: buildReplyText(params.matchId, "ja"),
    };
  } catch {
    return null;
  }
}
