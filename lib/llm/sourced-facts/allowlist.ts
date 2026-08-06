import type {
  SourcedFact,
  SourcedFactConfidence,
  SourcedFactRejection,
  SourcedFactRejectionReason,
} from "@/lib/llm/sourced-facts/types";

const OFFICIAL_DOMAINS = [
  "premiershiprugby.com",
  "unitedrugby.com",
  "lnr.fr",
  "super.rugby",
  "league-one.jp",
  "rugby-japan.jp",
  "rugby.com.au",
  "allblacks.com",
  "englandrugby.com",
] as const;

const MEDIA_DOMAINS = [
  "rugbyasia247.com",
  "rugby-rp.com",
  "onrugby.it",
  "therugbypaper.co.uk",
] as const;

export const SOURCED_FACT_ALLOWED_DOMAINS = [
  ...OFFICIAL_DOMAINS,
  ...MEDIA_DOMAINS,
] as const;

export type SourcedFactRelevanceContext = {
  kickoffAt: string;
  teamNames: string[];
};

function stripLeadingWww(domain: string) {
  return domain.replace(/^www\./, "");
}

export function normalizeSourcedFactDomain(value: string): string | null {
  try {
    const hostname = value.includes("://")
      ? new URL(value).hostname
      : new URL(`https://${value}`).hostname;
    return stripLeadingWww(hostname.toLowerCase());
  } catch {
    return null;
  }
}

function domainMatches(domain: string, allowedDomain: string) {
  return domain === allowedDomain || domain.endsWith(`.${allowedDomain}`);
}

export function isAllowedSourcedFactDomain(domain: string): boolean {
  const normalized = normalizeSourcedFactDomain(domain);
  if (!normalized) {
    return false;
  }

  return SOURCED_FACT_ALLOWED_DOMAINS.some((allowedDomain) =>
    domainMatches(normalized, allowedDomain),
  );
}

export function isOfficialSourcedFactDomain(domain: string): boolean {
  const normalized = normalizeSourcedFactDomain(domain);
  if (!normalized) {
    return false;
  }

  return OFFICIAL_DOMAINS.some((allowedDomain) =>
    domainMatches(normalized, allowedDomain),
  );
}

function normalizeConfidence(
  confidence: SourcedFactConfidence,
  sourceDomain: string,
  sourceCount: number,
): SourcedFactConfidence {
  if (isOfficialSourcedFactDomain(sourceDomain) || sourceCount >= 2) {
    return "high";
  }

  if (confidence === "low") {
    return "low";
  }

  return "medium";
}

const SCORE_PATTERN = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b/;
const DATE_PATTERN =
  /\b(?:\d{1,2}\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;
const RELATIVE_RECENCY_PATTERN =
  /\b(most recent|latest encounter|latest meeting|previous meeting|previous encounter|last time they met|last meeting|last encounter|last met)\b/i;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE_PATTERN = /\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g;
const JAPANESE_DATE_PATTERN = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
const MONTH_FIRST_DATE_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/gi;
const DAY_FIRST_DATE_PATTERN =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi;
const MONTH_NUMBER_BY_NAME = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);
const RELEVANCE_WINDOW_MILLISECONDS = 14 * 24 * 60 * 60 * 1000;

export function getDbAuthoritativeFactRejectionReason(
  fact: string,
): SourcedFactRejectionReason | null {
  if (SCORE_PATTERN.test(fact)) {
    return "db_authoritative_score";
  }

  if (DATE_PATTERN.test(fact)) {
    return "db_authoritative_relative_recency";
  }

  return null;
}

function dateFromParts(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function datesMatching(
  text: string,
  pattern: RegExp,
  getDate: (match: RegExpExecArray) => Date | null,
): Date[] {
  const dates: Date[] = [];
  for (const match of text.matchAll(pattern)) {
    const date = getDate(match);
    if (date) {
      dates.push(date);
    }
  }
  return dates;
}

export function extractSourcedFactDates(text: string): Date[] {
  const dates = [
    ...datesMatching(text, ISO_DATE_PATTERN, (match) =>
      dateFromParts(Number(match[1]), Number(match[2]), Number(match[3])),
    ),
    ...datesMatching(text, SLASH_DATE_PATTERN, (match) =>
      dateFromParts(Number(match[1]), Number(match[2]), Number(match[3])),
    ),
    ...datesMatching(text, JAPANESE_DATE_PATTERN, (match) =>
      dateFromParts(Number(match[1]), Number(match[2]), Number(match[3])),
    ),
    ...datesMatching(text, MONTH_FIRST_DATE_PATTERN, (match) =>
      dateFromParts(
        Number(match[3]),
        MONTH_NUMBER_BY_NAME.get(match[1]?.toLowerCase() ?? "") ?? 0,
        Number(match[2]),
      ),
    ),
    ...datesMatching(text, DAY_FIRST_DATE_PATTERN, (match) =>
      dateFromParts(
        Number(match[3]),
        MONTH_NUMBER_BY_NAME.get(match[2]?.toLowerCase() ?? "") ?? 0,
        Number(match[1]),
      ),
    ),
  ];

  return [...new Map(dates.map((date) => [date.toISOString(), date])).values()];
}

function hasRelevantTeamName(text: string, teamNames: string[]): boolean {
  const normalizedText = text.toLocaleLowerCase();
  return teamNames.some((name) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (normalizedName.length === 0) {
      return false;
    }

    if (normalizedText.includes(normalizedName)) {
      return true;
    }

    return normalizedName
      .split(/[^\p{L}\p{N}]+/u)
      .some((part) => part.length >= 3 && normalizedText.includes(part));
  });
}

export function getSourcedFactRelevanceRejectionReason(
  fact: string,
  factJa: string,
  context: SourcedFactRelevanceContext,
): SourcedFactRejectionReason | null {
  const factText = [fact, factJa].filter(Boolean).join("\n");
  if (!hasRelevantTeamName(factText, context.teamNames)) {
    return "unrelated_fixture";
  }

  const kickoffAt = new Date(context.kickoffAt);
  if (Number.isNaN(kickoffAt.getTime())) {
    return null;
  }
  const kickoffDate = Date.UTC(
    kickoffAt.getUTCFullYear(),
    kickoffAt.getUTCMonth(),
    kickoffAt.getUTCDate(),
  );

  return extractSourcedFactDates(factText).some(
    (date) =>
      Math.abs(date.getTime() - kickoffDate) > RELEVANCE_WINDOW_MILLISECONDS,
  )
    ? "unrelated_fixture"
    : null;
}

export function filterAllowedSourcedFacts(
  facts: Array<{
    confidence?: unknown;
    fact?: unknown;
    fact_ja?: unknown;
    source_url?: unknown;
  }>,
  options?: {
    rejected?: SourcedFactRejection[];
    relevance?: SourcedFactRelevanceContext;
  },
): SourcedFact[] {
  const normalized = facts
    .map((item) => {
      if (
        typeof item.fact !== "string" ||
        typeof item.source_url !== "string"
      ) {
        return null;
      }

      const fact = item.fact.replace(/\s+/g, " ").trim();
      const factJa =
        typeof item.fact_ja === "string"
          ? item.fact_ja.replace(/\s+/g, " ").trim()
          : "";
      const sourceUrl = item.source_url.trim();
      const sourceDomain = normalizeSourcedFactDomain(sourceUrl);

      if (fact.length < 12 || !sourceDomain) {
        return null;
      }

      if (!isAllowedSourcedFactDomain(sourceDomain)) {
        options?.rejected?.push({
          fact,
          reason: "domain_not_allowed",
          source_domain: sourceDomain,
        });
        return null;
      }

      const dbAuthoritativeReason = getDbAuthoritativeFactRejectionReason(fact);
      if (dbAuthoritativeReason) {
        options?.rejected?.push({
          fact,
          reason: dbAuthoritativeReason,
        });
        return null;
      }

      const relevanceReason = options?.relevance
        ? getSourcedFactRelevanceRejectionReason(
            fact,
            factJa,
            options.relevance,
          )
        : null;
      if (relevanceReason) {
        options?.rejected?.push({ fact, reason: relevanceReason });
        return null;
      }

      const confidence =
        item.confidence === "high" ||
        item.confidence === "medium" ||
        item.confidence === "low"
          ? item.confidence
          : "medium";

      return {
        confidence,
        fact,
        ...(factJa ? { fact_ja: factJa } : {}),
        source_domain: sourceDomain,
        source_url: sourceUrl,
      };
    })
    .filter((item): item is SourcedFact => item !== null);

  const sourceCountByFact = new Map<string, Set<string>>();
  for (const item of normalized) {
    const key = item.fact.toLowerCase();
    const domains = sourceCountByFact.get(key) ?? new Set<string>();
    domains.add(item.source_domain);
    sourceCountByFact.set(key, domains);
  }

  const deduped = new Map<string, SourcedFact>();
  for (const item of normalized) {
    const key = `${item.fact.toLowerCase()}|${item.source_domain}`;
    const sourceCount =
      sourceCountByFact.get(item.fact.toLowerCase())?.size ?? 1;
    deduped.set(key, {
      ...item,
      confidence: normalizeConfidence(
        item.confidence,
        item.source_domain,
        sourceCount,
      ),
    });
  }

  return [...deduped.values()];
}
