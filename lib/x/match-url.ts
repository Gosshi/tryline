import { SITE_URL } from "@/lib/site";

type ShareSource = "discord" | "x";
type ContentType = "preview" | "recap";

export function buildMatchShareUrl(
  matchId: string,
  opts: {
    contentType: ContentType;
    language: "en" | "ja";
    source: ShareSource;
  },
): string {
  const pathname =
    opts.language === "en" ? `/matches/${matchId}/en` : `/matches/${matchId}`;
  const url = new URL(pathname, SITE_URL);

  url.searchParams.set("utm_source", opts.source);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", opts.contentType);
  url.searchParams.set("utm_content", matchId);

  return url.toString();
}
