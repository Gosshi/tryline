import { format } from "date-fns";

import { parseDmyDate } from "@/lib/ingestion/sources/live-source-utils";
import {
  parseWikitextTemplates,
  stripWikitextMarkup,
} from "@/lib/ingestion/sources/wikipedia-wikitext";

export type InternationalFixture = {
  date: string;
  homeCode: string | null;
  awayCode: string | null;
  isSeniorSide: boolean;
  venue: string | null;
  sourcePage: string;
};

export type MissingInternationalsResult = {
  missing: InternationalFixture[];
  present: InternationalFixture[];
  unresolved: InternationalFixture[];
  nonSenior: InternationalFixture[];
  unparsed: InternationalFixture[];
};

type ParsedTeam = {
  code: string | null;
  isSeniorSide: boolean;
};

type DbMatch = {
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
};

function parseTeam(value: string | undefined): ParsedTeam {
  if (!value) {
    return { code: null, isSeniorSide: false };
  }

  const nameMatch = value.match(/\{\{\s*([^|{}]+?)\s*\|/);
  const templateName = nameMatch?.[1]?.trim();

  if (!templateName) {
    return { code: null, isSeniorSide: false };
  }

  const template = parseWikitextTemplates(value, templateName)[0];
  if (!template) {
    return { code: null, isSeniorSide: false };
  }

  const delimiterIndex = template.raw.indexOf("|");
  const firstArgument =
    delimiterIndex === -1
      ? ""
      : (template.raw.slice(delimiterIndex + 1).split("|")[0] ?? "")
          .replace(/}}$/, "")
          .trim();
  const cleanedCode = stripWikitextMarkup(firstArgument).toUpperCase();

  return {
    code: /^[A-Z]{3}$/.test(cleanedCode) ? cleanedCode : null,
    isSeniorSide:
      ["ru", "ru-rt"].includes(templateName.toLowerCase()) &&
      !Object.hasOwn(template.params, "name"),
  };
}

function parseFixtureDate(value: string | undefined): string {
  const dateText = stripWikitextMarkup(value ?? "");
  if (!dateText) {
    return "";
  }

  try {
    return format(parseDmyDate(dateText), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function parseInternationalFixtures(
  wikitext: string,
  sourcePage: string,
): InternationalFixture[] {
  return parseWikitextTemplates(wikitext, "rugbybox").map(({ params }) => {
    const usesTeamPairs = Boolean(params.team1 && params.team2);
    const home = parseTeam(usesTeamPairs ? params.team1 : params.home);
    const away = parseTeam(usesTeamPairs ? params.team2 : params.away);

    return {
      awayCode: away.code,
      date: parseFixtureDate(params.date),
      homeCode: home.code,
      isSeniorSide: home.isSeniorSide && away.isSeniorSide,
      sourcePage,
      venue: stripWikitextMarkup(params.stadium ?? "") || null,
    };
  });
}

function utcDayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) / 86_400_000;
}

function matchIsPresent(
  fixture: InternationalFixture,
  homeTeamId: string,
  awayTeamId: string,
  dbMatches: DbMatch[],
): boolean {
  const fixtureDay = utcDayNumber(fixture.date);

  return dbMatches.some((match) => {
    const sameTeams =
      (match.homeTeamId === homeTeamId && match.awayTeamId === awayTeamId) ||
      (match.homeTeamId === awayTeamId && match.awayTeamId === homeTeamId);
    const kickoffDay = new Date(match.kickoffAt).toISOString().slice(0, 10);

    return sameTeams && Math.abs(utcDayNumber(kickoffDay) - fixtureDay) <= 1;
  });
}

export function classifyInternationalFixtures(args: {
  fixtures: InternationalFixture[];
  nationalTeamIdByCode: Map<string, string>;
  dbMatches: DbMatch[];
  windowStart: string;
  windowEnd: string;
}): MissingInternationalsResult {
  const result: MissingInternationalsResult = {
    missing: [],
    nonSenior: [],
    present: [],
    unparsed: [],
    unresolved: [],
  };

  for (const fixture of args.fixtures) {
    if (
      fixture.date &&
      (fixture.date < args.windowStart || fixture.date > args.windowEnd)
    ) {
      continue;
    }

    if (!fixture.date || !fixture.homeCode || !fixture.awayCode) {
      result.unparsed.push(fixture);
      continue;
    }

    if (!fixture.isSeniorSide) {
      result.nonSenior.push(fixture);
      continue;
    }

    const homeTeamId = args.nationalTeamIdByCode.get(fixture.homeCode);
    const awayTeamId = args.nationalTeamIdByCode.get(fixture.awayCode);

    if (!homeTeamId || !awayTeamId) {
      result.unresolved.push(fixture);
      continue;
    }

    if (matchIsPresent(fixture, homeTeamId, awayTeamId, args.dbMatches)) {
      result.present.push(fixture);
      continue;
    }

    result.missing.push(fixture);
  }

  return result;
}
