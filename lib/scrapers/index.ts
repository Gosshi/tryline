export {
  FetchError,
  RateLimitedError,
  RobotsDisallowedError,
} from "@/lib/scrapers/errors";
export { fetchWithPolicy } from "@/lib/scrapers/fetcher";
export { saveRawData } from "@/lib/scrapers/raw-data";
export { acquireSlot } from "@/lib/scrapers/rate-limit";
export { isAllowed } from "@/lib/scrapers/robots";

export {
  scrapeSquads,
  parseWikipediaSquadsHtml,
} from "@/lib/scrapers/wikipedia-squads";
export {
  scrapeMatchLineup,
  parseLineupFromTableHtml,
  parseWikipediaLineupHtml,
} from "@/lib/scrapers/wikipedia-lineups";
export { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
export {
  parseCompetitionStandingsHtml,
  scrapeCompetitionStandings,
} from "@/lib/scrapers/wikipedia-standings";
export {
  parseAutumnNationsResultsHtml,
  wikipediaAutumnNationsResultsScraper,
} from "@/lib/scrapers/wikipedia-autumn-nations-results";
export type {
  CompetitionResultScraper as AutumnNationsResultScraper,
  HistoricalMatchResult as AutumnNationsHistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-autumn-nations-results";
