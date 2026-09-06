const VENUE_TIMEZONES: Record<string, string> = {
  "north queensland stadium, townsville": "Australia/Brisbane", // Townsville, Queensland, Australia (no DST)
  "twickenham stadium, london": "Europe/London", // London, United Kingdom
  "stade de france, saint-denis": "Europe/Paris", // Saint-Denis, France
  "aviva stadium, dublin": "Europe/Dublin", // Dublin, Ireland
  "aviva stadium": "Europe/Dublin", // Dublin, Ireland
  "stadio olimpico, rome": "Europe/Rome", // Rome, Italy
  "prince chichibu memorial rugby ground (tokyo)": "Asia/Tokyo", // Tokyo, Japan
};

export function normalizeVenue(venue: string): string {
  return venue
    .replace(/\[\d+\]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function resolveVenueTimezone(venue: string | null): string | null {
  if (!venue) {
    return null;
  }

  const normalized = normalizeVenue(venue);

  return Object.hasOwn(VENUE_TIMEZONES, normalized)
    ? (VENUE_TIMEZONES[normalized] ?? null)
    : null;
}
