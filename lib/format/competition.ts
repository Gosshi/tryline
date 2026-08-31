import {
  inferCompetitionFamilyFromSlug,
  JAPANESE_COMPETITION_NAMES_BY_FAMILY,
} from "@/lib/format/japanese-names";

export type CompetitionDisplayInput = {
  family?: string | null;
  name: string;
  nameJa?: string | null;
  slug?: string | null;
};

export function getCompetitionDisplayName(
  competition: CompetitionDisplayInput,
  language: "ja" | "en" = "ja",
): string {
  if (language === "en") {
    return competition.name;
  }

  const family =
    competition.family ?? inferCompetitionFamilyFromSlug(competition.slug);

  return (
    competition.nameJa ??
    (family ? JAPANESE_COMPETITION_NAMES_BY_FAMILY[family] : undefined) ??
    competition.name
  );
}

export function formatCompetitionTitle(
  name: string | CompetitionDisplayInput,
  season: string,
  language: "ja" | "en" = "ja",
): string {
  const rawName =
    typeof name === "string" ? name : getCompetitionDisplayName(name, language);
  const displayName = formatCompetitionName(rawName);

  return displayName.includes(season)
    ? displayName
    : `${displayName} ${season}`;
}

export function formatCompetitionName(name: string): string {
  return name
    .replace(/^Japan Rugby League One(?=\s|$)/, "ジャパンラグビー リーグワン")
    .replace(/^League One(?=\s|$)/, "ジャパンラグビー リーグワン");
}

export const COMPETITION_FAMILY_COLORS: Record<string, string> = {
  "autumn-nations": "#2D2D2D",
  "greatest-rivalry": "#007A4D",
  "league-one": "#FF6B00",
  "lipovitan-challenge-cup": "#E60012",
  "nations-championship": "#1A3A5C",
  pnc: "#00539B",
  "puma-trophy": "#75AADB",
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
  "lipovitan-challenge-cup": "リポビタンDチャレンジカップ",
  "nations-championship": "Nations Championship",
  "pacific-nations-cup": "Pacific Nations Cup",
  pnc: "Pacific Nations Cup",
  "puma-trophy": "プーマ・トロフィー",
  premiership: "Premiership",
  "rugby-championship": "The Rugby Championship",
  rwc: "Rugby World Cup",
  "six-nations": "Six Nations",
  "super-rugby-pacific": "Super Rugby Pacific",
  "top-14": "Top 14",
  urc: "URC",
};

export function formatFamilyName(family: string): string {
  return (
    JAPANESE_COMPETITION_NAMES_BY_FAMILY[family] ??
    FAMILY_DISPLAY_NAMES[family] ??
    family.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const POOL_DISPLAY_NAMES: Record<string, string> = {
  "Northern Hemisphere": "北半球",
  "Southern Hemisphere": "南半球",
};

export function formatPoolName(poolName: string): string {
  const displayName = POOL_DISPLAY_NAMES[poolName];

  if (displayName) {
    return displayName;
  }

  const poolMatch = /^Pool ([A-Z])$/.exec(poolName);

  return poolMatch ? `プール${poolMatch[1]}` : poolName;
}

export function getCompetitionFamilyColor(family: string): string {
  return COMPETITION_FAMILY_COLORS[family] ?? "#1e293b";
}
