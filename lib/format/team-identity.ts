type TeamIdentity = {
  color: string;
  flag: string;
};

function getSubdivisionFlag(tag: string): string {
  return String.fromCodePoint(
    0x1f3f4,
    ...[...tag].map((char) => 0xe0000 + char.charCodeAt(0)),
    0xe007f,
  );
}

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  england: { color: "#CC0000", flag: getSubdivisionFlag("gbeng") },
  france: { color: "#002395", flag: "🇫🇷" },
  ireland: { color: "#009A44", flag: "🇮🇪" },
  italy: { color: "#003DA5", flag: "🇮🇹" },
  scotland: { color: "#003087", flag: getSubdivisionFlag("gbsct") },
  wales: { color: "#C8102E", flag: getSubdivisionFlag("gbwls") },
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}

export function getTeamColor(slug: string): string {
  return TEAM_IDENTITY[slug]?.color ?? "#94a3b8";
}
