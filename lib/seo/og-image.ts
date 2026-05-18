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
