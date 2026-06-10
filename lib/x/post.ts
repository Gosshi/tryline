import { TwitterApi } from "twitter-api-v2";

import { buildMatchShareUrl } from "@/lib/x/match-url";
import { fetchOgImageBuffer, uploadMediaToX } from "@/lib/x/media";

export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionFamily: string | null;
  competitionLabel: string;
  contentType: "preview" | "recap";
  homeScore: number | null;
  homeTeamName: string;
  language: "ja" | "en";
  matchId: string;
  recapExcerpt: string;
};

type XCredentials = {
  accessSecret: string;
  accessToken: string;
  appKey: string;
  appSecret: string;
};

const X_POST_WEIGHTED_LENGTH_LIMIT = 280;
const X_URL_WEIGHT = 23;
export const HASHTAGS_BY_FAMILY: Record<string, { ja: string; en: string }> = {
  "league-one": {
    en: "#LeagueOne #Rugby #JapanRugby",
    ja: "#リーグワン #ラグビー",
  },
  premiership: {
    en: "#GallagherPremiership #Rugby",
    ja: "#プレミアシップ #ラグビー",
  },
  "rugby-championship": {
    en: "#RugbyChampionship #Rugby",
    ja: "#ラグビーチャンピオンシップ #ラグビー",
  },
  rwc: {
    en: "#RWC2027 #RugbyWorldCup #Rugby",
    ja: "#RWC2027 #ラグビー",
  },
  "six-nations": {
    en: "#SixNations #Rugby",
    ja: "#シックスネーションズ #ラグビー",
  },
  "super-rugby": {
    en: "#SuperRugby #Rugby",
    ja: "#スーパーラグビー #ラグビー",
  },
  "top-14": {
    en: "#Top14 #Rugby",
    ja: "#トップ14 #ラグビー",
  },
  urc: {
    en: "#URC #UnitedRugbyChampionship #Rugby",
    ja: "#URC #ラグビー",
  },
};
const DEFAULT_HASHTAGS = { en: "#Rugby", ja: "#ラグビー #Rugby" };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required X API environment variable: ${name}`);
  }
  return value;
}

function requireAnyEnv(primaryName: string, fallbackName: string): string {
  return process.env[primaryName] ?? requireEnv(fallbackName);
}

function getXCredentials(language: "ja" | "en"): XCredentials {
  if (language === "en") {
    return {
      accessSecret: requireEnv("X_EN_ACCESS_TOKEN_SECRET"),
      accessToken: requireEnv("X_EN_ACCESS_TOKEN"),
      appKey: requireEnv("X_EN_API_KEY"),
      appSecret: requireEnv("X_EN_API_KEY_SECRET"),
    };
  }

  return {
    accessSecret: requireEnv("X_ACCESS_TOKEN_SECRET"),
    accessToken: requireEnv("X_ACCESS_TOKEN"),
    appKey: requireEnv("X_API_KEY"),
    appSecret: requireAnyEnv("X_API_SECRET", "X_API_KEY_SECRET"),
  };
}

function getPostWeightedLength(text: string): number {
  const urlPattern = /https?:\/\/\S+/g;
  let length = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    length += getPlainTextWeightedLength(text.slice(lastIndex, index));
    length += X_URL_WEIGHT;
    lastIndex = index + match[0].length;
  }

  length += getPlainTextWeightedLength(text.slice(lastIndex));
  return length;
}

function getPlainTextWeightedLength(text: string): number {
  return [...text].reduce(
    (length, char) => length + (char.charCodeAt(0) <= 0x7f ? 1 : 2),
    0,
  );
}

function trimToWeightedLength(text: string, maxLength: number): string {
  let length = 0;
  let result = "";

  for (const char of text) {
    const weight = char.charCodeAt(0) <= 0x7f ? 1 : 2;
    if (length + weight > maxLength) {
      break;
    }
    result += char;
    length += weight;
  }

  return result.trim();
}

function toHashtag(name: string): string {
  return `#${name.replace(/\s+/g, "")}`;
}

function getHashtags(family: string | null, language: "ja" | "en"): string {
  const entry = family
    ? (HASHTAGS_BY_FAMILY[family] ?? DEFAULT_HASHTAGS)
    : DEFAULT_HASHTAGS;

  return entry[language];
}

export async function postTweetWithReply(params: {
  client?: TwitterApi;
  language: "ja" | "en";
  mediaId?: string;
  replyText: string;
  tweetText: string;
}): Promise<{ replyId: string; tweetId: string }> {
  const client =
    params.client ?? new TwitterApi(getXCredentials(params.language));
  const mediaOptions = params.mediaId
    ? { media: { media_ids: [params.mediaId] as [string] } }
    : undefined;
  const { data: mainTweet } = await client.v2.tweet(
    params.tweetText,
    mediaOptions,
  );
  const { data: replyTweet } = await client.v2.tweet(params.replyText, {
    reply: { in_reply_to_tweet_id: mainTweet.id },
  });

  return { replyId: replyTweet.id, tweetId: mainTweet.id };
}

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));
  let mediaId: string | undefined;

  if (
    params.contentType === "recap" &&
    params.homeScore !== null &&
    params.awayScore !== null
  ) {
    try {
      const imageBuffer = await fetchOgImageBuffer({
        away: params.awayTeamName,
        awayScore: params.awayScore,
        competition: params.competitionLabel,
        home: params.homeTeamName,
        homeScore: params.homeScore,
      });
      mediaId = await uploadMediaToX(client, imageBuffer, "image/png");
    } catch {
      mediaId = undefined;
    }
  }

  const result = await postTweetWithReply({
    client,
    language: params.language,
    mediaId,
    replyText: buildLinklessReplyText(params.language, params.contentType),
    tweetText: buildTweetText(params),
  });

  return result.tweetId;
}

export function buildTweetText(params: XPostParams): string {
  const score =
    params.homeScore !== null && params.awayScore !== null
      ? `${params.homeScore} - ${params.awayScore}`
      : "vs";

  const header =
    params.language === "en"
      ? params.contentType === "preview"
        ? `📋 ${params.competitionLabel} Preview`
        : `🏉 ${params.competitionLabel} Review`
      : params.contentType === "preview"
        ? `📋 ${params.competitionLabel} プレビュー`
        : `🏉 ${params.competitionLabel}`;
  const hashtagLine = getHashtags(params.competitionFamily, params.language);
  const matchLine = `${toHashtag(params.homeTeamName)} ${score} ${toHashtag(
    params.awayTeamName,
  )}`;
  const fixedText = [header, matchLine, "", "", hashtagLine].join("\n");
  const fixedLength = getPostWeightedLength(fixedText);
  const excerptSuffix = "...";
  const maxExcerptLength = Math.max(
    0,
    X_POST_WEIGHTED_LENGTH_LIMIT - fixedLength - excerptSuffix.length - 1,
  );
  const excerpt = trimToWeightedLength(params.recapExcerpt, maxExcerptLength);

  let text = [
    header,
    matchLine,
    "",
    excerpt ? `${excerpt}${excerptSuffix}` : "",
    "",
    hashtagLine,
  ].join("\n");

  if (getPostWeightedLength(text) > X_POST_WEIGHTED_LENGTH_LIMIT) {
    text = [header, matchLine, "", hashtagLine].join("\n");
  }

  return text;
}

export function buildReplyText(
  matchId: string,
  language: "ja" | "en",
  contentType: "preview" | "recap" = "recap",
): string {
  const matchUrl = buildMatchShareUrl(matchId, {
    contentType,
    language,
    source: "x",
  });
  const cta =
    language === "en"
      ? contentType === "preview"
        ? "Match preview 👇"
        : "Match review 👇"
      : contentType === "preview"
        ? "試合プレビューはこちら 👇"
        : "試合レビューはこちら 👇";

  return `${cta}\n${matchUrl}`;
}

export function buildLinklessReplyText(
  language: "ja" | "en",
  contentType: "preview" | "recap" = "recap",
): string {
  if (language === "en") {
    return contentType === "preview"
      ? "Preview is available on Tryline.\nOpen it from the article URL or profile link."
      : "Review is available on Tryline.\nOpen it from the article URL or profile link.";
  }

  return contentType === "preview"
    ? "プレビューはTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。"
    : "レビュー全文はTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。";
}
