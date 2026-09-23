import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import {
  classifyInternationalFixtures,
  parseInternationalFixtures,
} from "@/lib/audit/missing-internationals";
import { CronUnauthorizedError, assertCronAuthorized } from "@/lib/cron/auth";
import { loadAllPages } from "@/lib/db/pagination";
import { getSupabaseServerClient } from "@/lib/db/server";
import { isMissingWikipediaPage } from "@/lib/ingestion/sources/live-source-utils";
import { fetchWikipediaWikitext } from "@/lib/ingestion/sources/wikipedia-wikitext";
import { notifyMissingInternationals } from "@/lib/llm/notify";

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getPageTitle(year: number): string {
  return `${year} men's rugby union internationals`;
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
    }

    throw error;
  }

  try {
    const windowStart = new Date().toISOString().slice(0, 10);
    const windowEnd = addUtcDays(windowStart, 30);
    const startYear = Number(windowStart.slice(0, 4));
    const endYear = Number(windowEnd.slice(0, 4));
    const sourcePages: Array<{ pageTitle: string; wikitext: string }> = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const pageTitle = getPageTitle(year);

      try {
        const wikitext = await fetchWikipediaWikitext([pageTitle]);
        sourcePages.push({ pageTitle, wikitext });
      } catch (error) {
        if (year > startYear && isMissingWikipediaPage(error)) {
          continue;
        }

        throw error;
      }
    }

    const db = getSupabaseServerClient();
    const nationalTeams = await loadAllPages({
      loadPage: (from, to) =>
        db
          .from("teams")
          .select("id, short_code, name, name_ja")
          .eq("kind", "national")
          .range(from, to),
    });
    const nationalTeamIdByCode = new Map<string, string>();
    const teamNameByCode = new Map<string, string>();

    for (const team of nationalTeams) {
      if (!team.short_code) {
        continue;
      }

      const code = team.short_code.toUpperCase();
      nationalTeamIdByCode.set(code, team.id);
      teamNameByCode.set(code, team.name_ja || team.name);
    }

    const teamIds = Array.from(nationalTeamIdByCode.values());
    const dbMatches =
      teamIds.length === 0
        ? []
        : await loadAllPages({
            loadPage: (from, to) =>
              db
                .from("matches")
                .select("home_team_id, away_team_id, kickoff_at")
                .gte(
                  "kickoff_at",
                  `${addUtcDays(windowStart, -2)}T00:00:00.000Z`,
                )
                .lte(
                  "kickoff_at",
                  `${addUtcDays(windowEnd, 2)}T23:59:59.999Z`,
                )
                .or(
                  `home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`,
                )
                .range(from, to),
          });

    const fixtures = sourcePages.flatMap(({ pageTitle, wikitext }) =>
      parseInternationalFixtures(wikitext, pageTitle),
    );
    const result = classifyInternationalFixtures({
      dbMatches: dbMatches.map((match) => ({
        awayTeamId: match.away_team_id,
        homeTeamId: match.home_team_id,
        kickoffAt: match.kickoff_at,
      })),
      fixtures,
      nationalTeamIdByCode,
      windowEnd,
      windowStart,
    });

    if (result.missing.length > 0) {
      await notifyMissingInternationals(result.missing, teamNameByCode);
    }

    return apiSuccess(
      {
        counts: {
          missing: result.missing.length,
          nonSenior: result.nonSenior.length,
          present: result.present.length,
          unparsed: result.unparsed.length,
          unresolved: result.unresolved.length,
        },
        missing: result.missing,
        pages: sourcePages.map(({ pageTitle }) => pageTitle),
        window: { end: windowEnd, start: windowStart },
      },
      PRIVATE_CACHE_CONTROL,
    );
  } catch (error) {
    console.error("[audit-missing-internationals] failed", error);
    return apiError("audit_failed", 500, PRIVATE_CACHE_CONTROL);
  }
}
