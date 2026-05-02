type TeamIdentity = {
  color: string;
  flag: string;
};

const TEAM_FLAGS: Record<string, string> = {
  argentina: "🇦🇷",
  australia: "🇦🇺",
  canada: "🇨🇦",
  england:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#D80027" d="M0 136h513v70H0z"/><path fill="#D80027" d="M221.5 0h70v342h-70z"/></svg>',
  fiji: "🇫🇯",
  scotland:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#005EB8" d="M0 0h513v342H0z"/><path fill="#FFF" d="M0 302.1V342h59.9l196.6-131.1L453.1 342H513v-39.9L316.4 171 513 39.9V0h-59.9L256.5 131.1 59.9 0H0v39.9L196.7 171z"/></svg>',
  wales:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v171H0z"/><path fill="#529E3C" d="M0 171h513v171H0z"/><path fill="#D11C1C" d="m201 259.8 28.2-4.8-21.8-10.3 14.9-8.4s25.2 21.2 25.2 14.4c0-7.3 23.7-4.1 22.7-14.4-1.3-14.1-26.2-1-30.6-18.7-2.5-9.9-10.3-8.6-10.3-8.6l-25.1 8.6-12.5 18.7-6.2-18.7s-14.6 11.9-19.5 18.7c-5.2 7.3-10.7 23.5-10.7 23.5l25.6 10.7-37.3-6.6-27.2 6.6-16.7 4.6 7.3-7.7-15-7.6 15-9-7.3-6.1 32.3 6.1s11.8-1.2 16.3-6.1c5.6-6.2 10.1-27.1 10.1-27.1l-14.8-8.6-11.6 21s-8-19.9-15.6-31c-5.7-8.3-24.3-27.3-24.3-27.3l-24 12.6 13.4-26.7s10.6-9.3 3.9-18.8c-6.8-9.5-12.4-30.9-12.4-30.9s14.1 24.4 19.2 22.5c7.2-2.7-9-25 0-28.9 6.5-2.9 7.6 25.5 7.6 25.5l7.3-13.9v17.3s-4.3 20.7 3 33c7.2 12.3 28.7 20.9 28.7 20.9s-5.6-12.3 0-36c3.8-16 17.2-43.4 23.6-52.1 3.3-4.6-26.7 17-26.7 17v-17l-28.6-2.9-7.3 8.3-18.3-30L104 83.1h34.6l-6.7-8.3H104s5.9-12.1 34.6-12.1l13.6-9.2s18.6.5 29 .9c9.3.4 26.1-11.5 26.1-11.5l4.7 11.5-11 17.3 11.1 11.4-4.7 7 8.1 11.5H201l11.1 17.9-11.1-6.3 6.4 17.3-6.4 17.8 28.2-9.5s0-25.6 10.3-37.2C271.1 69.2 322.6 43 322.6 43s-2.7 23.5 4.9 25.4c11.1 2.7 59.4-19.4 59.4-19.4s-29 31.3-23.1 34.1c3.2 1.5 8.5 7 8.5 7s-25.1 20.5-29.3 29.3c-4.2 8.8 6.1 19.4 6.1 19.4s-21.7 0-32.5 9.5c32.5 0 59.1 15.4 74.8 4 10.5-7.6-37.7-2.9-31.4-21.9 2.4-7.1 8.5-15.2 22.6-17.3s19.1 6.3 19.1 6.3l7.6-11.5h-22.4l40.6-39.6 5.3 51.1-13.7-11.4-6.2 19.2c14.6 44.6-52.8 54.1-52.8 54.1l41.6 27.8-14.8 4.2-4.2 41.7 19.1 15.5-25-6.6-49.2 11.2 9.8-15.3-20.6 4.1 13.7-13.1-13.7-6.1 17.6-4.9 22.1 15.2s11-14.2 12.2-21.7c1.3-7.8-4.8-24.2-4.8-24.2s-32.6-.7-44.1-3.5-18.2-11.9-18.2-11.9l-13.1 15.4s45.5 17.1 34.1 24.2c-2.6 1.7-15.7-3.2-15.7-3.2s-22.4 26.2-36.8 29.7c-6.5 1.6 18.3 10.7 18.3 10.7s-21.2-3.4-32-6.6c-11.3-3.4-44.4 6.6-44.4 6.6l-11-10.7zM383.9 138c3.1 0 5.7-2.6 5.7-5.7s-2.6-5.7-5.7-5.7-5.7 2.6-5.7 5.7 2.5 5.7 5.7 5.7z"/></svg>',
  france:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#00318A" d="M0 0h171v342H0z"/><path fill="#D80027" d="M342 0h171v342H342z"/></svg>',
  georgia: "🇬🇪",
  ireland:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#6DA544" d="M0 0h171v342H0z"/><path fill="#FF9811" d="M342 0h171v342H342z"/></svg>',
  italy:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#F4F5F0" d="M342 0H0v341.3h512V0z"/><path fill="#008C45" d="M0 0h171v342H0z"/><path fill="#CD212A" d="M342 0h171v342H342z"/></svg>',
  japan: "🇯🇵",
  namibia: "🇳🇦",
  "new-zealand": "🇳🇿",
  portugal: "🇵🇹",
  romania: "🇷🇴",
  samoa: "🇼🇸",
  "south-africa": "🇿🇦",
  spain: "🇪🇸",
  tonga: "🇹🇴",
  uruguay: "🇺🇾",
  usa: "🇺🇸",
};

function getSubdivisionFlag(tag: string): string {
  return String.fromCodePoint(
    0x1f3f4,
    ...[...tag].map((char) => 0xe0000 + char.charCodeAt(0)),
    0xe007f,
  );
}

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  argentina: { color: "#75AADB", flag: "🇦🇷" },
  australia: { color: "#FFCD00", flag: "🇦🇺" },
  bath: { color: "#002F6C", flag: "🏉" },
  bayonne: { color: "#5BA7D1", flag: "🏉" },
  "bordeaux-begles": { color: "#5B1A7A", flag: "🏉" },
  "bristol-bears": { color: "#0B1F3A", flag: "🏉" },
  canada: { color: "#D80621", flag: "🇨🇦" },
  castres: { color: "#1F75FE", flag: "🏉" },
  clermont: { color: "#FFD100", flag: "🏉" },
  england: { color: "#CC0000", flag: getSubdivisionFlag("gbeng") },
  "exeter-chiefs": { color: "#111111", flag: "🏉" },
  fiji: { color: "#68BFE5", flag: "🇫🇯" },
  france: { color: "#002395", flag: "🇫🇷" },
  georgia: { color: "#FF0000", flag: "🇬🇪" },
  grenoble: { color: "#D71920", flag: "🏉" },
  gloucester: { color: "#C8102E", flag: "🏉" },
  harlequins: { color: "#1E7F3B", flag: "🏉" },
  ireland: { color: "#009A44", flag: "🇮🇪" },
  italy: { color: "#0070B8", flag: "🇮🇹" },
  japan: { color: "#BC002D", flag: "🇯🇵" },
  "la-rochelle": { color: "#F6C400", flag: "🏉" },
  "leicester-tigers": { color: "#006B3F", flag: "🏉" },
  lyon: { color: "#D50032", flag: "🏉" },
  montpellier: { color: "#0A3A8D", flag: "🏉" },
  namibia: { color: "#003580", flag: "🇳🇦" },
  "newcastle-falcons": { color: "#111111", flag: "🏉" },
  "new-zealand": { color: "#111111", flag: "🇳🇿" },
  "northampton-saints": { color: "#006747", flag: "🏉" },
  pau: { color: "#006B3F", flag: "🏉" },
  perpignan: { color: "#C8102E", flag: "🏉" },
  portugal: { color: "#006600", flag: "🇵🇹" },
  "racing-92": { color: "#7FD1E8", flag: "🏉" },
  romania: { color: "#002B7F", flag: "🇷🇴" },
  "sale-sharks": { color: "#003DA5", flag: "🏉" },
  samoa: { color: "#CE1126", flag: "🇼🇸" },
  saracens: { color: "#000000", flag: "🏉" },
  scotland: { color: "#003087", flag: getSubdivisionFlag("gbsct") },
  "south-africa": { color: "#007A4D", flag: "🇿🇦" },
  spain: { color: "#AA151B", flag: "🇪🇸" },
  "stade-francais": { color: "#E91E8F", flag: "🏉" },
  tonga: { color: "#C10000", flag: "🇹🇴" },
  toulon: { color: "#D50032", flag: "🏉" },
  toulouse: { color: "#E30613", flag: "🏉" },
  uruguay: { color: "#0038A8", flag: "🇺🇾" },
  usa: { color: "#3C3B6E", flag: "🇺🇸" },
  vannes: { color: "#003A70", flag: "🏉" },
  wales: { color: "#C8102E", flag: getSubdivisionFlag("gbwls") },
};

const TEAM_STRIPES: Record<string, string[]> = {
  argentina: ["#75AADB", "#FFFFFF", "#FCBF49"],
  australia: ["#FFCD00", "#00843D"],
  bath: ["#002F6C"],
  bayonne: ["#5BA7D1"],
  "bordeaux-begles": ["#5B1A7A"],
  "bristol-bears": ["#0B1F3A"],
  canada: ["#D80621", "#FFFFFF"],
  castres: ["#1F75FE"],
  clermont: ["#FFD100"],
  england: ["#CC0000", "#FFFFFF"],
  "exeter-chiefs": ["#111111"],
  fiji: ["#68BFE5", "#FFFFFF", "#CE1126"],
  france: ["#002395", "#FFFFFF", "#ED2939"],
  georgia: ["#FF0000", "#FFFFFF"],
  grenoble: ["#D71920"],
  gloucester: ["#C8102E"],
  harlequins: ["#1E7F3B"],
  ireland: ["#169B62", "#FFFFFF", "#F77F00"],
  italy: ["#009246", "#FFFFFF", "#CE2B37"],
  japan: ["#BC002D", "#FFFFFF"],
  "la-rochelle": ["#F6C400"],
  "leicester-tigers": ["#006B3F"],
  lyon: ["#D50032"],
  montpellier: ["#0A3A8D"],
  namibia: ["#003580", "#C8102E", "#009A44"],
  "newcastle-falcons": ["#111111"],
  "new-zealand": ["#111111", "#FFFFFF"],
  "northampton-saints": ["#006747"],
  pau: ["#006B3F"],
  perpignan: ["#C8102E"],
  portugal: ["#006600", "#FF0000", "#FFCC00"],
  "racing-92": ["#7FD1E8"],
  romania: ["#002B7F", "#FCD116", "#CE1126"],
  "sale-sharks": ["#003DA5"],
  samoa: ["#CE1126", "#002B7F", "#FFFFFF"],
  saracens: ["#000000"],
  scotland: ["#003F87", "#FFFFFF"],
  "south-africa": ["#007A4D", "#FFB612", "#000000"],
  spain: ["#AA151B", "#F1BF00"],
  "stade-francais": ["#E91E8F"],
  tonga: ["#C10000", "#FFFFFF"],
  toulon: ["#D50032"],
  toulouse: ["#E30613"],
  uruguay: ["#0038A8", "#FFFFFF", "#FCD116"],
  usa: ["#3C3B6E", "#FFFFFF", "#B22234"],
  vannes: ["#003A70"],
  wales: ["#C8102E", "#FFFFFF", "#00712D"],
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}

export function getTeamFlagSvg(slug: string): string {
  const flag = TEAM_FLAGS[slug];

  if (!flag?.startsWith("<svg")) {
    return "";
  }

  return flag;
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
