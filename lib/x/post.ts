import { TwitterApi } from "twitter-api-v2";

export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
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

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));

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
  const matchUrl = `https://www.trylinerugby.com/matches/${params.matchId}${
    params.language === "en" ? "/en" : ""
  }`;
  const hashtagLine =
    params.language === "en"
      ? "#LeagueOne #Rugby #JapanRugby #ラグビー #リーグワン"
      : "#ラグビー #Rugby #観戦";
  const fixedText = [
    header,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    "",
    "",
    `▶️ ${matchUrl}`,
    "",
    hashtagLine,
  ].join("\n");
  const fixedLength = getPostWeightedLength(fixedText);
  const excerptSuffix = "...";
  const maxExcerptLength = Math.max(
    0,
    X_POST_WEIGHTED_LENGTH_LIMIT - fixedLength - excerptSuffix.length,
  );
  const excerpt = trimToWeightedLength(params.recapExcerpt, maxExcerptLength);

  let text = [
    header,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    excerpt ? `${excerpt}${excerptSuffix}` : "",
    "",
    `▶️ ${matchUrl}`,
    "",
    hashtagLine,
  ].join("\n");

  if (getPostWeightedLength(text) > X_POST_WEIGHTED_LENGTH_LIMIT) {
    text = [
      header,
      `${params.homeTeamName} ${score} ${params.awayTeamName}`,
      "",
      "",
      `▶️ ${matchUrl}`,
    ].join("\n");
  }

  const { data } = await client.v2.tweet(text);
  return data.id;
}
