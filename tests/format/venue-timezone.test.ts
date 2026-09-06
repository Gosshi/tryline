import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  normalizeVenue,
  resolveVenueTimezone,
} from "@/lib/format/venue-timezone";

describe("normalizeVenue", () => {
  it.each([
    ["Eden Park, Auckland[a]", "eden park, auckland"],
    [
      "Navigation Homes Stadium, Pukekohe[e][f]",
      "navigation homes stadium, pukekohe",
    ],
    ["Hnry Stadium, Wellington[42][a]", "hnry stadium, wellington"],
    [
      "SPEARS EDORIKU FIELD（Edogawa Athletic Stadium） (Tokyo)[note 1]",
      "spears edoriku field（edogawa athletic stadium） (tokyo)",
    ],
  ])(
    "removes letter and repeated footnotes from %s while retaining parentheses",
    (venue, expected) => {
      expect(normalizeVenue(venue)).toBe(expected);
    },
  );

  it("removes numeric footnotes, folds whitespace, and ignores case", () => {
    expect(
      normalizeVenue("  NORTH  Queensland Stadium,\n Townsville[17][9]  "),
    ).toBe("north queensland stadium, townsville");
  });
});

describe("resolveVenueTimezone", () => {
  it("covers every venue with at least five matches in the production coverage snapshot", () => {
    const coverage = readFileSync(
      new URL(
        "../../docs/venue-timezone-coverage-2026-09-06.md",
        import.meta.url,
      ),
      "utf8",
    );
    const venues = [...coverage.matchAll(/^\| \d+ \| `([^`]+)` \| (\d+) \|/gm)]
      .filter(([, , matches]) => Number(matches) >= 5)
      .map(([, venue]) => venue!);

    expect(venues).toHaveLength(58);
    expect(
      venues.filter((venue) => resolveVenueTimezone(venue) === null),
    ).toEqual([]);
  });

  it.each([
    ["Allianz Stadium, Sydney", "Australia/Sydney"],
    ["Adelaide Oval, Adelaide", "Australia/Adelaide"],
    ["HBF Park, Perth", "Australia/Perth"],
    ["Eden Park, Auckland[a]", "Pacific/Auckland"],
    ["Hnry Stadium, Wellington[42]", "Pacific/Auckland"],
    ["Kings Park Stadium, Durban", "Africa/Johannesburg"],
    ["Ravenhill Stadium, Belfast", "Europe/London"],
    ["CorpAcq Stadium", "Europe/London"],
    ["The Sportsground, Galway", "Europe/Dublin"],
    ["Stadio Monigo, Treviso", "Europe/Rome"],
    ["Kumagaya Rugby Stadium (Saitama)", "Asia/Tokyo"],
  ])("maps the confirmed location of %s to %s", (venue, timezone) => {
    expect(resolveVenueTimezone(venue)).toBe(timezone);
  });

  it.each([
    ["Ellis Park Stadium, Jo'burg", "Ellis Park Stadium, Johannesburg"],
    ["Stadio Sergio Lanfranchi", "Stadio Sergio Lanfranchi, Parma"],
    ["Sky Stadium, Wellington", "Sky Stadium, Wellington, New Zealand"],
    ["Cape Town Stadium", "Cape Town Stadium, Cape Town"],
    ["HBF Park, Perth", "HBF Park, Perth | Boorloo, Australia"],
    ["Stadio Monigo, Treviso", "Stadio Comunale di Monigo, Treviso"],
  ])("resolves confirmed aliases %s and %s identically", (venue, alias) => {
    expect(resolveVenueTimezone(venue)).not.toBeNull();
    expect(resolveVenueTimezone(alias)).toBe(resolveVenueTimezone(venue));
  });

  it.each(["Allianz Stadium", "Allianz Stadium[a]", "TBC"])(
    "does not guess the location of %s",
    (venue) => {
      expect(resolveVenueTimezone(venue)).toBeNull();
    },
  );

  it.each([
    "North Queensland Stadium, Townsville",
    "North Queensland Stadium, Townsville[17]",
    "  NORTH  Queensland Stadium,\nTownsville[9]  ",
  ])("resolves %s without using a home team", (venue) => {
    expect(resolveVenueTimezone(venue)).toBe("Australia/Brisbane");
  });

  it.each([
    null,
    "",
    "   ",
    "[17]",
    "Nonexistent Stadium",
    "constructor",
    "__proto__",
  ])("returns null for %s without a fallback", (venue) => {
    expect(resolveVenueTimezone(venue)).toBeNull();
  });

  it.each([
    ["Twickenham Stadium, London", "Europe/London"],
    ["Stade de France, Saint-Denis", "Europe/Paris"],
    ["Aviva Stadium, Dublin", "Europe/Dublin"],
    ["Aviva Stadium", "Europe/Dublin"],
    ["Stadio Olimpico, Rome", "Europe/Rome"],
    ["Prince Chichibu Memorial Rugby Ground (Tokyo)", "Asia/Tokyo"],
  ])("resolves the known venue %s to %s", (venue, timezone) => {
    expect(resolveVenueTimezone(venue)).toBe(timezone);
  });
});
