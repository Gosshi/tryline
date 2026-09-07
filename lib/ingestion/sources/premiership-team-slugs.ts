export const PREMIERSHIP_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bath: "bath",
  "Bath Rugby": "bath",
  Bristol: "bristol-bears",
  "Bristol Bears": "bristol-bears",
  Exeter: "exeter-chiefs",
  "Exeter Chiefs": "exeter-chiefs",
  Gloucester: "gloucester",
  "Gloucester Rugby": "gloucester",
  Harlequins: "harlequins",
  Leicester: "leicester-tigers",
  "Leicester Tigers": "leicester-tigers",
  Newcastle: "newcastle-falcons",
  "Newcastle Falcons": "newcastle-falcons",
  "Newcastle Red Bulls": "newcastle-falcons",
  Northampton: "northampton-saints",
  "Northampton Saints": "northampton-saints",
  Sale: "sale-sharks",
  "Sale Sharks": "sale-sharks",
  Saracens: "saracens",
};

export function resolvePremiershipTeamSlug(teamName: string) {
  return PREMIERSHIP_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName] ?? null;
}
