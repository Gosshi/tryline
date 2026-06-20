import {
  ingestLiveCompetition,
  type LiveCompetitionSource,
  type LiveIngestResult,
} from "@/lib/ingestion/live-ingest";
import { fetchLeagueOne202526 } from "@/lib/ingestion/sources/league-one-live";
import { fetchAutumnNations2026 } from "@/lib/ingestion/sources/wikipedia-autumn-nations";
import { fetchPnc2026 } from "@/lib/ingestion/sources/wikipedia-pnc";
import { fetchPremiership202526 } from "@/lib/ingestion/sources/wikipedia-premiership";
import { fetchRugbyChampionship2026 } from "@/lib/ingestion/sources/wikipedia-rugby-championship";
import { fetchSixNations2027 } from "@/lib/ingestion/sources/wikipedia-six-nations-2027-live";
import { fetchSuperRugbyPacific2026 } from "@/lib/ingestion/sources/wikipedia-super-rugby-pacific";
import { fetchTop14202526 } from "@/lib/ingestion/sources/wikipedia-top-14";
import { fetchUrc202526 } from "@/lib/ingestion/sources/wikipedia-urc";

export const LIVE_COMPETITION_SOURCES: LiveCompetitionSource[] = [
  {
    competitionName: "Six Nations 2027",
    competitionSlug: "six-nations-2027",
    family: "six-nations",
    fetch: fetchSixNations2027,
    season: "2027",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Super Rugby Pacific 2026",
    competitionSlug: "super-rugby-pacific-2026",
    family: "super-rugby-pacific",
    fetch: fetchSuperRugbyPacific2026,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Nations Cup 2026",
    competitionSlug: "pnc-2026",
    family: "pnc",
    fetch: fetchPnc2026,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Rugby Championship 2026",
    competitionSlug: "rugby-championship-2026",
    family: "rugby-championship",
    fetch: fetchRugbyChampionship2026,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Autumn Nations 2026",
    competitionSlug: "autumn-nations-2026",
    family: "autumn-nations",
    fetch: fetchAutumnNations2026,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Premiership 2025-26",
    competitionSlug: "premiership-2025-26",
    family: "premiership",
    fetch: fetchPremiership202526,
    season: "2025-26",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "URC 2025-26",
    competitionSlug: "urc-2025-26",
    family: "urc",
    fetch: fetchUrc202526,
    season: "2025-26",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Top 14 2025-26",
    competitionSlug: "top-14-2025-26",
    family: "top-14",
    fetch: fetchTop14202526,
    season: "2025-26",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "League One 2025-26",
    competitionSlug: "league-one-2025-26",
    family: "league-one",
    fetch: fetchLeagueOne202526,
    season: "2025-26",
    sourceLabel: "league-one.jp",
  },
];

export async function ingestAllLiveCompetitions() {
  const results = await Promise.allSettled(
    LIVE_COMPETITION_SOURCES.map((source) => ingestLiveCompetition(source)),
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(
        `Failed to ingest ${LIVE_COMPETITION_SOURCES[index]?.competitionSlug}:`,
        result.reason,
      );
    }
  }

  return results
    .filter(
      (result): result is PromiseFulfilledResult<LiveIngestResult> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
}
