import { describe, expect, it } from "vitest";

import {
  normalizeVenue,
  resolveVenueTimezone,
} from "@/lib/format/venue-timezone";

describe("normalizeVenue", () => {
  it("removes numeric footnotes, folds whitespace, and ignores case", () => {
    expect(
      normalizeVenue("  NORTH  Queensland Stadium,\n Townsville[17][9]  "),
    ).toBe("north queensland stadium, townsville");
  });
});

describe("resolveVenueTimezone", () => {
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
