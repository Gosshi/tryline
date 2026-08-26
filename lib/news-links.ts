import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export const NEWS_FEEDS = [
  { domain: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/sport.xml" },
  {
    domain: "nzherald.co.nz",
    url: "https://www.nzherald.co.nz/arc/outboundfeeds/rss/topic/rugby/?outputType=xml&_website=nzh",
  },
  {
    domain: "stuff.co.nz",
    url: "https://www.stuff.co.nz/rss?section=/sport/rugby",
  },
] as const;

export type NewsLink = {
  publishedAt: string | null;
  sourceDomain: string;
  sourceUrl: string;
  title: string;
};
export type NewsMatch = {
  awayTeamName: string | null;
  homeTeamName: string | null;
  id: string;
  kickoffAt: string;
};

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(item: string, name: string) {
  return (
    item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ??
    null
  );
}

export function parseRss(xml: string, sourceDomain: string): NewsLink[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(
    (match) => {
      const item = match[1] ?? "";
      const title = tag(item, "title");
      const sourceUrl = tag(item, "link") ?? tag(item, "guid");
      if (!title || !sourceUrl) return [];
      const published = tag(item, "pubDate") ?? tag(item, "published");
      const publishedAt =
        published && !Number.isNaN(Date.parse(decode(published)))
          ? new Date(decode(published)).toISOString()
          : null;
      return [
        {
          publishedAt,
          sourceDomain,
          sourceUrl: decode(sourceUrl),
          title: decode(title),
        },
      ];
    },
  );
}

export async function fetchNewsLinks(): Promise<NewsLink[]> {
  const links: NewsLink[] = [];
  for (const feed of NEWS_FEEDS) {
    const response = await fetchWithPolicy(feed.url, {
      minIntervalMs: feed.domain === "rnz.co.nz" ? 7_000 : undefined,
    });
    links.push(...parseRss(await response.text(), feed.domain));
  }
  return links;
}

export function matchNewsLink(title: string, matches: NewsMatch[]) {
  const lowerTitle = title.toLocaleLowerCase();
  return (
    matches
      .filter((match) =>
        [match.homeTeamName, match.awayTeamName].some(
          (name) => name && lowerTitle.includes(name.toLocaleLowerCase()),
        ),
      )
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0] ?? null
  );
}

export async function translateNewsTitle(title: string) {
  const response = await getOpenAIClient().responses.create({
    model: MODELS.FAST,
    input: `次のニュース見出し1行だけを自然な日本語に翻訳してください。説明や引用符は不要です。\n\n${title}`,
  });
  return response.output_text.trim() || null;
}

export function formatNewsLinkNotification(params: {
  match: NewsMatch;
  title: string;
  url: string;
}) {
  const date = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(params.match.kickoffAt));
  return [
    `🗞 ${date} ${params.match.homeTeamName ?? ""} × ${params.match.awayTeamName ?? ""}`,
    params.title,
    params.url,
    `match_id: ${params.match.id}`,
  ].join("\n");
}
