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
export {
  parsePacificNationsCupResultsHtml,
  wikipediaPacificNationsCupResultsScraper,
} from "@/lib/scrapers/wikipedia-pacific-nations-cup-results";
export type {
  CompetitionResultScraper as PacificNationsCupResultScraper,
  HistoricalMatchResult as PacificNationsCupHistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-pacific-nations-cup-results";
export {
  parseTop14ResultsHtml,
  wikipediaTop14ResultsScraper,
} from "@/lib/scrapers/wikipedia-top-14-results";
export type {
  CompetitionResultScraper as Top14ResultScraper,
  HistoricalMatchResult as Top14HistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-top-14-results";
export {
  parsePremiershipResultsHtml,
  wikipediaPremiershipResultsScraper,
} from "@/lib/scrapers/wikipedia-premiership-results";
export type {
  CompetitionResultScraper as PremiershipResultScraper,
  HistoricalMatchResult as PremiershipHistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-premiership-results";
export {
  parseRugbyChampionshipResultsHtml,
  wikipediaRugbyChampionshipResultsScraper,
} from "@/lib/scrapers/wikipedia-rugby-championship-results";
export type {
  CompetitionResultScraper,
  HistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-rugby-championship-results";
