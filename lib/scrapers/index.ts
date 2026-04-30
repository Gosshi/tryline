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
  parseWikipediaLineupHtml,
} from "@/lib/scrapers/wikipedia-lineups";
export {
  buildMatchWikipediaUrl,
  parseWikipediaMatchEventsHtml,
  scrapeMatchEvents,
} from "@/lib/scrapers/wikipedia-match-events";
export {
  parseCompetitionStandingsHtml,
  scrapeCompetitionStandings,
} from "@/lib/scrapers/wikipedia-standings";
