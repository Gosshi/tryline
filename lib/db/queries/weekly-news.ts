import { getSupabaseServerClient } from "@/lib/db/server";

export type PublishedWeeklyNewsItem = {
  category: string;
  id: string;
  published_at: string | null;
  source_domain: string;
  source_url: string;
  summary_ja: string;
  title_ja: string;
};

export async function getPublishedWeeklyNewsItems(
  weekFrom: string,
  weekTo: string,
): Promise<PublishedWeeklyNewsItem[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("weekly_news_items")
    .select(
      "id, category, title_ja, summary_ja, source_domain, source_url, published_at",
    )
    .eq("week_from", weekFrom)
    .eq("week_to", weekTo)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as PublishedWeeklyNewsItem[];
}
