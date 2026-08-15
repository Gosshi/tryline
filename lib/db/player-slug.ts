import { createHash } from "crypto";

export function generatePlayerSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/, "");
  if (cleaned) {
    return cleaned;
  }

  return `player-${createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8)}`;
}

export function assignAvailablePlayerSlugs(
  names: readonly string[],
  existingSlugs: readonly string[],
): string[] {
  const occupiedSlugs = new Set(existingSlugs);

  return names.map((name) => {
    const candidate = generatePlayerSlug(name);
    let slug = candidate;
    let suffix = 2;

    while (occupiedSlugs.has(slug)) {
      slug = `${candidate}-${suffix}`;
      suffix += 1;
    }

    occupiedSlugs.add(slug);
    return slug;
  });
}

export async function resolveAvailablePlayerSlugs(
  names: readonly string[],
  findExistingSlugs: (candidates: readonly string[]) => Promise<readonly string[]>,
): Promise<string[]> {
  const candidates = [...new Set(names.map(generatePlayerSlug))];
  const existingSlugs = await findExistingSlugs(candidates);

  return assignAvailablePlayerSlugs(names, existingSlugs);
}
