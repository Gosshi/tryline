export function formatRoundLabel(round: number): string {
  if (round === 0) return "プレーオフ予選";

  return `Round ${round}`;
}
