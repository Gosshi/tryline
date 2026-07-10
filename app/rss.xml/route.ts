import { listPublishedRecapsForFeed } from "@/lib/db/queries/match-content";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/#{1,6}\s+/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateDescription(value: string, maxLength = 200): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).replace(/[、。,\s]+$/u, "")}…`;
}

export async function GET() {
  const recaps = await listPublishedRecapsForFeed(30);
  const items = recaps
    .map((recap) => {
      const title = `${recap.homeTeamName} 対 ${recap.awayTeamName} — ${recap.competitionName}`;
      const link = `${SITE_URL}/matches/${recap.matchId}`;
      const description = truncateDescription(stripMarkdown(recap.contentMdJa));

      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <pubDate>${new Date(recap.generatedAt).toUTCString()}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>Tryline 最新レビュー</title>",
    `    <link>${escapeXml(SITE_URL)}</link>`,
    "    <description>海外ラグビーの日本語レビュー最新記事</description>",
    "    <language>ja</language>",
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
