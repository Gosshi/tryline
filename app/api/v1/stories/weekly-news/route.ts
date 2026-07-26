import { apiSuccess, PUBLIC_CACHE_CONTROL } from "@/lib/api/v1/response";
import { getPublishedWeeklyNewsItems } from "@/lib/db/queries/weekly-news";
import {
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
} from "@/lib/format/week";
import { SITE_URL } from "@/lib/site";

import type {
  V1WeeklyNewsData,
  V1WeeklyNewsItemCategory,
} from "@/lib/api/v1/types";
import type { PublishedWeeklyNewsItem } from "@/lib/db/queries/weekly-news";

const WEEKLY_NEWS_CATEGORIES: V1WeeklyNewsItemCategory[] = [
  "transfer",
  "quote",
  "competition",
  "injury",
  "other",
];

function normalizeCategory(value: string): V1WeeklyNewsItemCategory {
  return WEEKLY_NEWS_CATEGORIES.includes(value as V1WeeklyNewsItemCategory)
    ? (value as V1WeeklyNewsItemCategory)
    : "other";
}

function buildImageUrls(
  item: PublishedWeeklyNewsItem,
  category: V1WeeklyNewsItemCategory,
) {
  const version = Math.max(
    0,
    Math.floor(new Date(item.published_at ?? 0).getTime() / 1_000),
  );
  const base = `/api/og?type=weekly-news&category=${category}&item=${encodeURIComponent(item.id)}&text=none&v=${version}`;

  return {
    landscape_url: `${SITE_URL}${base}&orientation=landscape`,
    portrait_url: `${SITE_URL}${base}&orientation=portrait`,
  };
}

export async function GET() {
  const week = getCurrentJstWeekRangeUtc();
  const items = await getPublishedWeeklyNewsItems(
    week.weekStartJst,
    week.weekEndJst,
  );
  const data: V1WeeklyNewsData = {
    items: items.map((item) => {
      const category = normalizeCategory(item.category);

      return {
        category,
        id: item.id,
        image: buildImageUrls(item, category),
        published_at: item.published_at,
        source_domain: item.source_domain,
        source_url: item.source_url,
        summary: item.summary_ja,
        title: item.title_ja,
      };
    }),
    week: {
      from: week.weekStartJst,
      label: formatJstWeekRangeLabel(week.weekStartJst),
      to: week.weekEndJst,
    },
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
