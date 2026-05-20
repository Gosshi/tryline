const RWC_KNOCKOUT_ROUND_LABELS: Record<number, string> = {
  5: "準々決勝",
  6: "準決勝",
  7: "3位決定戦",
  8: "決勝",
};

const WIKIPEDIA_LARGE_ROUND_LABELS: Record<number, string> = {
  100: "準々決勝",
  101: "準決勝",
  102: "決勝",
  103: "3位決定戦",
};

export const PLAYOFF_STAGE_LABELS: Record<string, string> = {
  final: "決勝",
  "quarter-final": "準々決勝",
  "quarter-finals": "準々決勝",
  quarterfinal: "準々決勝",
  quarterfinals: "準々決勝",
  "semi-final": "準決勝",
  "semi-finals": "準決勝",
  semifinal: "準決勝",
  semifinals: "準決勝",
  "third-place": "3位決定戦",
  "third-place play-off": "3位決定戦",
  "third-place playoff": "3位決定戦",
};

export function formatPlayoffStageLabel(roundName: string): string {
  return PLAYOFF_STAGE_LABELS[roundName.trim().toLowerCase()] ?? roundName;
}

export function formatRoundLabel(round: number, family?: string): string {
  if (family === "rwc" && RWC_KNOCKOUT_ROUND_LABELS[round]) {
    return RWC_KNOCKOUT_ROUND_LABELS[round];
  }

  if (WIKIPEDIA_LARGE_ROUND_LABELS[round]) {
    return WIKIPEDIA_LARGE_ROUND_LABELS[round];
  }

  if (round === 0) return "プレーオフ予選";

  return `第${round}節`;
}
