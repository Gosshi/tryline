import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type JrfuMatchBroadcast = {
  serviceName: string;
  url: string;
};

export type JrfuMatchPage = {
  broadcasts: JrfuMatchBroadcast[];
  dateLabel: string;
  sourceUrl: string;
};

export type JrfuSchedule = {
  matchUrls: string[];
  year: number | null;
};

const JRFU_SCHEDULE_URL = "https://www.rugby-japan.jp/schedule/";

function normalizeUrl(url: string, baseUrl: string) {
  return new URL(url, baseUrl).toString();
}

function parseScheduleYear(value: string) {
  const match = value.trim().match(/^(\d{4})年$/);

  return match ? Number(match[1]) : null;
}

export function parseJrfuScheduleHtml(html: string): JrfuSchedule {
  const $ = load(html);
  const matchUrls = new Set<string>();

  $(".game-card a[href*='/match/']").each((_, element) => {
    const href = $(element).attr("href");

    if (href) {
      matchUrls.add(normalizeUrl(href, JRFU_SCHEDULE_URL));
    }
  });

  const selectedYear =
    $("select option[selected]")
      .toArray()
      .map((element) => {
        const value = $(element).attr("value");
        const match = value?.match(/^\/schedule\/\?y=(\d{4})$/);

        return match ? Number(match[1]) : parseScheduleYear($(element).text());
      })
      .find((year): year is number => year !== null) ?? null;

  return {
    matchUrls: [...matchUrls],
    year: selectedYear,
  };
}

export function parseJrfuMatchPageHtml(
  html: string,
  sourceUrl: string,
): JrfuMatchPage {
  const $ = load(html);
  const broadcasts: JrfuMatchBroadcast[] = [];

  $("div.broadcast a[href]").each((_, element) => {
    const link = $(element);
    const href = link.attr("href");

    if (!href) {
      return;
    }

    broadcasts.push({
      serviceName: link.text().trim(),
      url: normalizeUrl(href, sourceUrl),
    });
  });

  return {
    broadcasts,
    dateLabel: $(".gameInfo .dates").first().text().trim(),
    sourceUrl,
  };
}

export async function fetchJrfuSchedule(): Promise<JrfuSchedule> {
  const response = await fetchWithPolicy(JRFU_SCHEDULE_URL);

  return parseJrfuScheduleHtml(await response.text());
}

export async function listJrfuMatchUrls(): Promise<string[]> {
  return (await fetchJrfuSchedule()).matchUrls;
}

export async function fetchJrfuMatchPage(url: string): Promise<JrfuMatchPage> {
  const response = await fetchWithPolicy(url);

  return parseJrfuMatchPageHtml(await response.text(), url);
}
