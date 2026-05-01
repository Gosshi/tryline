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

const TEAM_STRIPES: Record<string, string[]> = {
  england: ["#CC0000", "#FFFFFF"],
  france: ["#002395", "#FFFFFF", "#ED2939"],
  ireland: ["#169B62", "#FFFFFF", "#F77F00"],
  italy: ["#009246", "#FFFFFF", "#CE2B37"],
  scotland: ["#003F87", "#FFFFFF"],
  wales: ["#C8102E", "#FFFFFF", "#00712D"],
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}

export function getTeamColor(slug: string): string {
  return TEAM_IDENTITY[slug]?.color ?? "#94a3b8";
}

export function getTeamStripe(
  slug: string,
  direction: "vertical" | "horizontal" = "vertical",
): string {
  const colors = TEAM_STRIPES[slug];

  if (!colors) {
    return "#94a3b8";
  }

  const dir = direction === "vertical" ? "to bottom" : "to right";
  const n = colors.length;
  const stops = colors.flatMap((color, index) => [
    `${color} ${Math.round((index / n) * 100)}%`,
    `${color} ${Math.round(((index + 1) / n) * 100)}%`,
  ]);

  return `linear-gradient(${dir}, ${stops.join(", ")})`;
}
