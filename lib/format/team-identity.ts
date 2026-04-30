type TeamIdentity = {
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
  england: { flag: getSubdivisionFlag("gbeng") },
  france: { flag: "🇫🇷" },
  ireland: { flag: "🇮🇪" },
  italy: { flag: "🇮🇹" },
  scotland: { flag: getSubdivisionFlag("gbsct") },
  wales: { flag: getSubdivisionFlag("gbwls") },
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}
