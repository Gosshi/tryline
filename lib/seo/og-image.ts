type OgImageParams = {
  away: string;
  competition: string;
  home: string;
  score?: string;
  status?: string;
};

export function createMatchOgImage(params: OgImageParams) {
  const searchParams = new URLSearchParams({
    away: params.away,
    competition: params.competition,
    home: params.home,
  });

  if (params.score) {
    searchParams.set("score", params.score);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}


type CompetitionOgImageParams = {
  accentColor: string;
  familyName: string;
  season?: string;
};

export function createCompetitionOgImage(params: CompetitionOgImageParams) {
  const searchParams = new URLSearchParams({
    type: "competition",
    family_name: params.familyName,
    accent: params.accentColor,
  });

  if (params.season) {
    searchParams.set("season", params.season);
  }

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}

type RoundScoreboardOgImageParams = {
  competitionId: string;
  competitionLabel?: string;
  round: number;
};

export function createRoundScoreboardOgImage(
  params: RoundScoreboardOgImageParams,
) {
  const searchParams = new URLSearchParams({
    type: "round-scoreboard",
    competition_id: params.competitionId,
    round: String(params.round),
  });

  if (params.competitionLabel) {
    searchParams.set("competition", params.competitionLabel);
  }

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}
