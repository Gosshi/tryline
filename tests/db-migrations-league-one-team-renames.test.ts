import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261114000000_rename_league_one_teams_2026_27.sql",
  "utf8",
);

describe("AC12: League One team rename migration", () => {
  it.each([
    ["honda-heat", "栃木ホンダヒート", "Tochigi Honda Heat"],
    [
      "toshiba-brave-lupus",
      "東芝ブレイブルーパス武蔵",
      "Toshiba Brave Lupus Musashi",
    ],
  ])(
    "updates the three display names by slug: %s",
    (slug, name, englishName) => {
      const statements = sql
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(statements).toHaveLength(2);
      const statement = statements.find((s) =>
        s.includes(`WHERE slug = '${slug}'`),
      );
      expect(statement).toBe(`UPDATE public.teams
SET name = '${name}',
    name_ja = '${name}',
    english_name = '${englishName}'
WHERE slug = '${slug}'`);
    },
  );
});
