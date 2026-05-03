export function formatCompetitionTitle(name: string, season: string): string {
  return name.includes(season) ? name : `${name} ${season}`;
}

const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  "autumn-nations": "Autumn Nations",
  "league-one": "League One",
  "pacific-nations-cup": "Pacific Nations Cup",
  premiership: "Premiership",
  "rugby-championship": "Rugby Championship",
  rwc: "RWC",
  "six-nations": "Six Nations",
  "super-rugby-pacific": "Super Rugby Pacific",
  "top-14": "Top 14",
  urc: "URC",
};

export function formatFamilyName(family: string): string {
  return (
    FAMILY_DISPLAY_NAMES[family] ??
    family.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
