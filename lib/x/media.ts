import { SITE_URL } from "@/lib/site";

import type { TwitterApi } from "twitter-api-v2";

export async function fetchOgImageBuffer(params: {
  away: string;
  awayScore: number;
  competition: string;
  home: string;
  homeScore: number;
}): Promise<Buffer> {
  const url = new URL("/api/og", SITE_URL);
  url.searchParams.set("type", "result");
  url.searchParams.set("home", params.home);
  url.searchParams.set("away", params.away);
  url.searchParams.set("hs", String(params.homeScore));
  url.searchParams.set("as", String(params.awayScore));
  url.searchParams.set("comp", params.competition);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch OG image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function uploadMediaToX(
  client: TwitterApi,
  imageBuffer: Buffer,
  mimeType: "image/png",
): Promise<string> {
  return client.v1.uploadMedia(imageBuffer, { mimeType });
}