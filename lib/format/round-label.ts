const RWC_KNOCKOUT_ROUND_LABELS: Record<number, string> = {
  5: "準々決勝",
  6: "準決勝",
  7: "3位決定戦",
  8: "決勝",
};

export function formatRoundLabel(round: number, family?: string): string {
  if (family === "rwc" && RWC_KNOCKOUT_ROUND_LABELS[round]) {
    return RWC_KNOCKOUT_ROUND_LABELS[round];
  }

  if (round === 0) return "プレーオフ予選";

  return `第${round}節`;
}
