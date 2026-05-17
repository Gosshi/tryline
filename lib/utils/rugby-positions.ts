export type PositionGroup = "fw" | "bk" | "unknown";

const FW_KEYWORDS = [
  "prop",
  "hooker",
  "lock",
  "second row",
  "flanker",
  "number 8",
  "no. 8",
  "no.8",
];

const BK_KEYWORDS = [
  "scrum-half",
  "scrum half",
  "fly-half",
  "fly half",
  "out-half",
  "out half",
  "centre",
  "center",
  "wing",
  "full-back",
  "fullback",
];

export const POSITION_GROUP_LABEL: Record<PositionGroup, string> = {
  bk: "バックス",
  fw: "フォワード",
  unknown: "その他",
};

export function getPositionGroup(position: string | null): PositionGroup {
  if (!position) {
    return "unknown";
  }

  const lower = position.toLowerCase();

  if (FW_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "fw";
  }

  if (BK_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "bk";
  }

  return "unknown";
}
