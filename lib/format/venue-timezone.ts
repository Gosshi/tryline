const VENUE_TIMEZONES: Record<string, string> = {
  "kings park stadium, durban": "Africa/Johannesburg", // Durban, South Africa
  "ravenhill stadium, belfast": "Europe/London", // Belfast, United Kingdom
  "cape town stadium": "Africa/Johannesburg", // Cape Town, South Africa
  "corpacq stadium": "Europe/London", // Salford, United Kingdom
  "edinburgh rugby stadium": "Europe/London", // Edinburgh, United Kingdom
  "franklin's gardens": "Europe/London", // Northampton, United Kingdom
  "parc y scarlets, llanelli": "Europe/London", // Llanelli, United Kingdom
  "sandy park": "Europe/London", // Exeter, United Kingdom
  "the sportsground, galway": "Europe/Dublin", // Galway, Ireland
  "cardiff arms park": "Europe/London", // Cardiff, United Kingdom
  "rodney parade, newport": "Europe/London", // Newport, United Kingdom
  "welford road": "Europe/London", // Leicester, United Kingdom
  "ashton gate": "Europe/London", // Bristol, United Kingdom
  kingsholm: "Europe/London", // Gloucester, United Kingdom
  "the recreation ground": "Europe/London", // Bath, United Kingdom
  "stonex stadium": "Europe/London", // London, United Kingdom
  "twickenham stoop": "Europe/London", // London, United Kingdom
  "thomond park, limerick": "Europe/Dublin", // Limerick, Ireland
  "ellis park stadium, jo'burg": "Africa/Johannesburg", // Johannesburg, South Africa
  "ellis park stadium, johannesburg": "Africa/Johannesburg", // Johannesburg, South Africa
  "kingston park": "Europe/London", // Newcastle upon Tyne, United Kingdom
  "loftus versfeld, pretoria": "Africa/Johannesburg", // Pretoria, South Africa
  "one nz stadium, christchurch": "Pacific/Auckland", // Christchurch, New Zealand
  "st helen's, swansea": "Europe/London", // Swansea, United Kingdom
  "stadio monigo, treviso": "Europe/Rome", // Treviso, Italy
  "stadio sergio lanfranchi": "Europe/Rome", // Parma, Italy
  "fmg stadium waikato, hamilton": "Pacific/Auckland", // Hamilton, New Zealand
  "kumagaya rugby stadium (saitama)": "Asia/Tokyo", // Kumagaya, Japan
  "loftus versfeld stadium, pretoria": "Africa/Johannesburg", // Pretoria, South Africa
  "rds arena, dublin": "Europe/Dublin", // Dublin, Ireland
  "scotstoun stadium": "Europe/London", // Glasgow, United Kingdom
  "allianz stadium, sydney": "Australia/Sydney", // Sydney, Australia
  "gio stadium, canberra": "Australia/Sydney", // Canberra, Australia
  "hnry stadium, wellington": "Pacific/Auckland", // Wellington, New Zealand
  "murrayfield stadium, edinburgh": "Europe/London", // Edinburgh, United Kingdom
  "suncorp stadium, brisbane": "Australia/Brisbane", // Brisbane, Australia
  "adelaide oval, adelaide": "Australia/Adelaide", // Adelaide, Australia
  "brewery field, bridgend": "Europe/London", // Bridgend, United Kingdom
  "brisbane stadium, brisbane": "Australia/Brisbane", // Brisbane, Australia
  "docklands stadium, melbourne": "Australia/Melbourne", // Melbourne, Australia
  "eden park, auckland": "Pacific/Auckland", // Auckland, New Zealand
  "forsyth barr stadium, dunedin": "Pacific/Auckland", // Dunedin, New Zealand
  "hbf park, perth": "Australia/Perth", // Perth, Australia
  "kobe universiade memorial stadium (hyogo)": "Asia/Tokyo", // Kobe, Japan
  "scotstoun stadium, glasgow": "Europe/London", // Glasgow, United Kingdom
  "spears edoriku field（edogawa athletic stadium） (tokyo)": "Asia/Tokyo", // Tokyo, Japan
  "millennium stadium, cardiff": "Europe/London", // Cardiff, United Kingdom
  "north harbour stadium, albany": "Pacific/Auckland", // Auckland (Albany), New Zealand
  "paloma mizuho rugby stadium (aichi)": "Asia/Tokyo", // Nagoya, Japan
  "perth stadium, perth": "Australia/Perth", // Perth, Australia
  "stadio comunale di monigo, treviso": "Europe/Rome", // Treviso, Italy
  "yamaha stadium (shizuoka)": "Asia/Tokyo", // Iwata, Japan
  "north queensland stadium, townsville": "Australia/Brisbane", // Townsville, Queensland, Australia (no DST)
  "twickenham stadium, london": "Europe/London", // London, United Kingdom
  "stade de france, saint-denis": "Europe/Paris", // Saint-Denis, France
  "aviva stadium, dublin": "Europe/Dublin", // Dublin, Ireland
  "aviva stadium": "Europe/Dublin", // Dublin, Ireland
  "stadio olimpico, rome": "Europe/Rome", // Rome, Italy
  "prince chichibu memorial rugby ground (tokyo)": "Asia/Tokyo", // Tokyo, Japan

  // Confirmed full-string aliases from the coverage snapshot. Do not match by prefix:
  // the cityless "Allianz Stadium" can refer to stadiums in different timezones.
  "aviva stadium, dublin, ireland": "Europe/Dublin", // Dublin, Ireland
  "brisbane stadium, brisbane | meeanjin, australia": "Australia/Brisbane", // Brisbane, Australia
  "cape town stadium, cape town": "Africa/Johannesburg", // Cape Town, South Africa
  "eden park, auckland, new zealand": "Pacific/Auckland", // Auckland, New Zealand
  "hanazono rugby stadium, higashiōsaka": "Asia/Tokyo", // Higashiosaka, Japan
  "hanazono rugby stadium (osaka)": "Asia/Tokyo", // Higashiosaka, Japan
  "hbf park, perth | boorloo, australia": "Australia/Perth", // Perth, Australia
  "loftus versfeld, pretoria, south africa": "Africa/Johannesburg", // Pretoria, South Africa
  "millennium stadium": "Europe/London", // Cardiff, United Kingdom
  "newcastle stadium, newcastle": "Australia/Sydney", // Newcastle, Australia
  "newcastle stadium, newcastle | awabakal-worimi, australia":
    "Australia/Sydney", // Newcastle, Australia
  "principality stadium, cardiff, wales": "Europe/London", // Cardiff, United Kingdom
  "principality stadium": "Europe/London", // Cardiff, United Kingdom
  "sky stadium, wellington": "Pacific/Auckland", // Wellington, New Zealand
  "sky stadium, wellington, new zealand": "Pacific/Auckland", // Wellington, New Zealand
  "stade de france, saint-denis, france": "Europe/Paris", // Saint-Denis, France
  "stadio sergio lanfranchi, parma": "Europe/Rome", // Parma, Italy
  "sydney football stadium, sydney": "Australia/Sydney", // Sydney, Australia
  "sydney football stadium, sydney | gadigal, australia": "Australia/Sydney", // Sydney, Australia
  "twickenham stadium": "Europe/London", // London, United Kingdom
};

export function normalizeVenue(venue: string): string {
  return venue
    .replace(/\[[^\]]*\]/g, "")
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
