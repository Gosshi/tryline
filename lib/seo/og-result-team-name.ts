export function getResultTeamNameFontSize(teamName: string): number {
  const length = teamName.trim().length;

  if (length <= 4) {
    return 58;
  }

  if (length <= 7) {
    return 46;
  }

  if (length <= 9) {
    return 38;
  }

  if (length <= 12) {
    return 30;
  }

  return 26;
}
