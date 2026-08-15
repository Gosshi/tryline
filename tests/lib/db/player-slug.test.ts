import { describe, expect, it, vi } from "vitest";

import {
  assignAvailablePlayerSlugs,
  generatePlayerSlug,
  resolveAvailablePlayerSlugs,
} from "@/lib/db/player-slug";

describe("player slugs", () => {
  it("preserves the existing readable slug algorithm", () => {
    expect(generatePlayerSlug("Harry Wilson")).toBe("harry-wilson");
    expect(generatePlayerSlug("Josua Tuisova")).toBe("josua-tuisova");
    expect(generatePlayerSlug("Luke Cowan-Dickie")).toBe(
      "luke-cowan-dickie",
    );
  });

  it("uses a deterministic hash fallback when no ASCII slug is available", () => {
    const slug = generatePlayerSlug("木田晴斗");

    expect(slug).toMatch(/^player-[a-f0-9]{8}$/);
    expect(generatePlayerSlug("木田晴斗")).toBe(slug);
    expect(generatePlayerSlug("")).toMatch(/^player-[a-f0-9]{8}$/);
    expect(generatePlayerSlug("   ")).toMatch(/^player-[a-f0-9]{8}$/);
    expect(generatePlayerSlug("---")).toMatch(/^player-[a-f0-9]{8}$/);
  });

  it("uses the candidate when it is not occupied", () => {
    expect(assignAvailablePlayerSlugs(["Harry Wilson"], [])).toEqual([
      "harry-wilson",
    ]);
  });

  it("adds the next suffix when matching slugs are occupied", () => {
    expect(
      assignAvailablePlayerSlugs(["Harry Wilson"], ["harry-wilson"]),
    ).toEqual(["harry-wilson-2"]);
    expect(
      assignAvailablePlayerSlugs(
        ["Harry Wilson"],
        ["harry-wilson", "harry-wilson-2"],
      ),
    ).toEqual(["harry-wilson-3"]);
  });

  it("keeps the candidate when only a numbered suffix is occupied", () => {
    expect(
      assignAvailablePlayerSlugs(["Harry Wilson"], ["harry-wilson-2"]),
    ).toEqual(["harry-wilson"]);
  });

  it("allocates distinct slugs for duplicate names in one batch", async () => {
    const findExistingSlugs = vi.fn().mockResolvedValue([]);

    await expect(
      resolveAvailablePlayerSlugs(
        ["Harry Wilson", "Harry Wilson"],
        findExistingSlugs,
      ),
    ).resolves.toEqual(["harry-wilson", "harry-wilson-2"]);
    expect(findExistingSlugs).toHaveBeenCalledTimes(1);
    expect(findExistingSlugs).toHaveBeenCalledWith(["harry-wilson"]);
  });
});
