export const RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  Chile: "chile",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Georgia: "georgia",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  Namibia: "namibia",
  "New Zealand": "new-zealand",
  Portugal: "portugal",
  Romania: "romania",
  Samoa: "samoa",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Tonga: "tonga",
  Uruguay: "uruguay",
  Wales: "wales",
};

export const RWC_2023_POOL_ASSIGNMENTS: Record<string, string> = {
  argentina: "Pool D",
  australia: "Pool C",
  chile: "Pool D",
  england: "Pool D",
  fiji: "Pool C",
  france: "Pool A",
  georgia: "Pool C",
  ireland: "Pool B",
  italy: "Pool A",
  japan: "Pool D",
  namibia: "Pool A",
  "new-zealand": "Pool A",
  portugal: "Pool C",
  romania: "Pool B",
  samoa: "Pool D",
  scotland: "Pool B",
  "south-africa": "Pool B",
  tonga: "Pool B",
  uruguay: "Pool A",
  wales: "Pool C",
};

export const RWC_2023_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup";
export const RWC_2023_POOL_PAGE_URLS: Record<string, string> = {
  "Pool A": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_A",
  "Pool B": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_B",
  "Pool C": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_C",
  "Pool D": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_D",
};
export const RWC_2023_COMPETITION_SLUG = "rwc-2023";
export const RWC_2023_FAMILY = "rwc";
export const RWC_2023_SEASON = "2023";

export function resolveRwcTeamSlug(teamName: string): string {
  const slug = RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown RWC 2023 team name: ${teamName}`);
  }

  return slug;
}
