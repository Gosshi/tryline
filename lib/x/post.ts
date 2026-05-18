import { TwitterApi } from "twitter-api-v2";

export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionLabel: string;
  homeScore: number | null;
  homeTeamName: string;
  matchId: string;
  recapExcerpt: string;
};

type XCredentials = {
  accessSecret: string;
  accessToken: string;
  appKey: string;
  appSecret: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required X API environment variable: ${name}`);
  }
  return value;
}

function getXCredentials(): XCredentials {
  return {
    accessSecret: requireEnv("X_ACCESS_TOKEN_SECRET"),
    accessToken: requireEnv("X_ACCESS_TOKEN"),
    appKey: requireEnv("X_API_KEY"),
    appSecret: requireEnv("X_API_KEY_SECRET"),
  };
}

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials());

  const score =
    params.homeScore !== null && params.awayScore !== null
      ? `${params.homeScore} - ${params.awayScore}`
      : "vs";

  const matchUrl = `https://www.trylinerugby.com/matches/${params.matchId}`;
  const excerpt = params.recapExcerpt.slice(0, 100);

  const text = [
    `🏉 ${params.competitionLabel}`,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    `${excerpt}…`,
    "",
    `▶️ ${matchUrl}`,
    "",
    "#ラグビー #Rugby #観戦",
  ].join("\n");

  const { data } = await client.v2.tweet(text);
  return data.id;
}
