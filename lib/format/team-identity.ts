type TeamIdentity = {
  flag: string;
};

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  england: { flag: "🏴" },
  france: { flag: "🇫🇷" },
  ireland: { flag: "🇮🇪" },
  italy: { flag: "🇮🇹" },
  scotland: { flag: "🏴" },
  wales: { flag: "🏴" },
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}
