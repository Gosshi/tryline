import {
  ingestLiveCompetition,
  type LiveCompetitionSource,
  type LiveIngestResult,
} from "@/lib/ingestion/live-ingest";
import { fetchLeagueOne202526 } from "@/lib/ingestion/sources/league-one-live";
import { fetchAutumnNations2026 } from "@/lib/ingestion/sources/wikipedia-autumn-nations";
import { fetchGreatestRivalry2026 } from "@/lib/ingestion/sources/wikipedia-greatest-rivalry";
import { fetchLipovitanChallengeCup2026 } from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup";
import { fetchLipovitanChallengeCup2026EventMatches } from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup-events";
import { fetchNationsChampionship2026 } from "@/lib/ingestion/sources/wikipedia-nations-championship";
import { fetchNationsChampionship2026EventMatches } from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { fetchPnc2026 } from "@/lib/ingestion/sources/wikipedia-pnc";
import { fetchPremiership } from "@/lib/ingestion/sources/wikipedia-premiership";
import { fetchRugbyChampionship2026 } from "@/lib/ingestion/sources/wikipedia-rugby-championship";
import { fetchSixNations2027 } from "@/lib/ingestion/sources/wikipedia-six-nations-2027-live";
import { fetchSuperRugbyPacific2026 } from "@/lib/ingestion/sources/wikipedia-super-rugby-pacific";
import { fetchTop14 } from "@/lib/ingestion/sources/wikipedia-top-14";
import { fetchUrc } from "@/lib/ingestion/sources/wikipedia-urc";

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
    competitionName: "Nations Championship 2026",
    competitionSlug: "nations-championship-2026",
    family: "nations-championship",
    fetch: fetchNationsChampionship2026,
    fetchEventMatches: fetchNationsChampionship2026EventMatches,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Greatest Rivalry 2026",
    competitionNameJa:
      "グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征",
    competitionSlug: "greatest-rivalry-2026",
    family: "greatest-rivalry",
    fetch: fetchGreatestRivalry2026,
    season: "2026",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Lipovitan-D Challenge Cup 2026",
    competitionSlug: "lipovitan-challenge-cup-2026",
    family: "lipovitan-challenge-cup",
    fetch: fetchLipovitanChallengeCup2026,
    fetchEventMatches: fetchLipovitanChallengeCup2026EventMatches,
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
    competitionName: "Premiership 2026-27",
    competitionSlug: "premiership-2026-27",
    family: "premiership",
    fetch: () => fetchPremiership("2026-27"),
    season: "2026-27",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "URC 2026-27",
    competitionSlug: "urc-2026-27",
    family: "urc",
    fetch: () => fetchUrc("2026-27"),
    season: "2026-27",
    sourceLabel: "wikipedia",
  },
  {
    competitionName: "Top 14 2026-27",
    competitionSlug: "top-14-2026-27",
    family: "top-14",
    fetch: () => fetchTop14("2026-27"),
    season: "2026-27",
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
