export function formatCompetitionTitle(name: string, season: string): string {
  const displayName = formatCompetitionName(name);

  return displayName.includes(season) ? displayName : `${displayName} ${season}`;
}

function formatCompetitionName(name: string): string {
  return name
    .replace(
      /^Japan Rugby League One(?=\s|$)/,
      "ジャパンラグビー リーグワン",
    )
    .replace(/^League One(?=\s|$)/, "ジャパンラグビー リーグワン");
}

export const COMPETITION_FAMILY_COLORS: Record<string, string> = {
  "autumn-nations": "#2D2D2D",
  "league-one": "#FF6B00",
  pnc: "#00539B",
  premiership: "#1C2C6B",
  "rugby-championship": "#C8102E",
  "six-nations": "#001489",
  "super-rugby-pacific": "#0057B8",
  "top-14": "#D62B31",
  urc: "#00823E",
};

const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  "autumn-nations": "Autumn Nations",
  "league-one": "ジャパンラグビー リーグワン",
  "pacific-nations-cup": "Nations Cup",
  pnc: "Nations Cup",
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

export function getCompetitionFamilyColor(family: string): string {
  return COMPETITION_FAMILY_COLORS[family] ?? "#1e293b";
}
