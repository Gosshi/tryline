import type {
  SourcedFact,
  SourcedFactConfidence,
  SourcedFactRejection,
  SourcedFactRejectionReason,
} from "@/lib/llm/sourced-facts/types";

const OFFICIAL_DOMAINS = [
  "world.rugby",
  "rugbyworldcup.com",
  "sixnationsrugby.com",
  "premiershiprugby.com",
  "unitedrugby.com",
  "lnr.fr",
  "super.rugby",
  "league-one.jp",
  "rugbychampionship.com",
  "rugby-japan.jp",
  "rugby.com.au",
  "allblacks.com",
  "englandrugby.com",
] as const;

const MEDIA_DOMAINS = [
  "rugbypass.com",
  "planetrugby.com",
  "rugbyasia247.com",
  "bbc.com",
  "bbc.co.uk",
  "espn.com",
  "skysports.com",
  "rugby-rp.com",
] as const;

export const SOURCED_FACT_ALLOWED_DOMAINS = [
  ...OFFICIAL_DOMAINS,
  ...MEDIA_DOMAINS,
] as const;

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

export function filterAllowedSourcedFacts(
  facts: Array<{
    confidence?: unknown;
    fact?: unknown;
    source_url?: unknown;
  }>,
  options?: { rejected?: SourcedFactRejection[] },
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
      const sourceUrl = item.source_url.trim();
      const sourceDomain = normalizeSourcedFactDomain(sourceUrl);

      if (
        fact.length < 12 ||
        !sourceDomain ||
        !isAllowedSourcedFactDomain(sourceDomain)
      ) {
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

      const confidence =
        item.confidence === "high" ||
        item.confidence === "medium" ||
        item.confidence === "low"
          ? item.confidence
          : "medium";

      return {
        confidence,
        fact,
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
