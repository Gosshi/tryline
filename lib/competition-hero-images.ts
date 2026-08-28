const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "autumn-nations": "/visuals/autumn-nations.jpg",
  "greatest-rivalry": "/visuals/greatest-rivalry.jpg",
  "league-one": "/visuals/league-one.jpg",
  "lipovitan-challenge-cup": "/visuals/lipovitan-challenge-cup.jpg",
  "nations-championship": "/visuals/nations-championship.jpg",
  pnc: "/visuals/pnc.jpg",
  "puma-trophy": "/visuals/rugby-championship.jpg",
  premiership: "/visuals/premiership.jpg",
  "rugby-championship": "/visuals/rugby-championship.jpg",
  "six-nations": "/visuals/six-nations.jpg",
  "super-rugby-pacific": "/visuals/super-rugby-pacific.jpg",
  "top-14": "/visuals/top-14.jpg",
  urc: "/visuals/urc.jpg",
};

export const DEFAULT_COMPETITION_HERO = "/visuals/default.jpg";

export function getCompetitionHeroImage(family: string) {
  return COMPETITION_HERO_IMAGES[family] ?? DEFAULT_COMPETITION_HERO;
}
