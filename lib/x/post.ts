import { TwitterApi } from "twitter-api-v2";

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
const HASHTAGS_BY_FAMILY: Record<string, { ja: string; en: string }> = {
  "league-one": {
    en: "#LeagueOne #Rugby #JapanRugby",
    ja: "#リーグワン #ラグビー",
  },
  "premiership": {
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
    appSecret: requireEnv("X_API_KEY_SECRET"),
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

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));
  const text = buildTweetText(params);

  const { data: mainTweet } = await client.v2.tweet(text);
  const replyText = buildReplyText(params.matchId, params.language);

  await client.v2.tweet(replyText, {
    reply: { in_reply_to_tweet_id: mainTweet.id },
  });

  return mainTweet.id;
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
    X_POST_WEIGHTED_LENGTH_LIMIT - fixedLength - excerptSuffix.length,
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

export function buildReplyText(matchId: string, language: "ja" | "en"): string {
  const matchUrl = `https://www.trylinerugby.com/matches/${matchId}${
    language === "en" ? "/en" : ""
  }`;
  const cta =
    language === "en" ? "Full AI analysis 👇" : "AI 戦術分析の全文はこちら 👇";

  return `${cta}\n${matchUrl}`;
}
