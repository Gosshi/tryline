# Codex Prompt: 2020–2024 順位表バックフィル対応

## 前提

`p1-historical-results-backfill.md` が完了済み。
`scripts/import-six-nations-results.ts` と `scripts/calculate-standings.ts` が存在する。
`data/six-nations/2020-results.json` ～ `data/six-nations/2024-results.json` が存在する。

---

## 背景

`scripts/import-six-nations-results.ts` は `competitions` と `matches` をアップサートするが、
`competition_teams` テーブルへの書き込みが抜けている。

`calculate-standings.ts` は `competition_teams` を参照してチームリストを構築するため、
このテーブルが空だと順位表が計算されない（空の Map が返るだけ）。

この修正で 2020–2024 の順位表を生成できるようにする。

---

## 変更対象ファイル

- `scripts/import-six-nations-results.ts`（1 ファイルのみ）

---

## Task — `upsertCompetitionTeams` 関数を追加して `main()` から呼ぶ

### 追加する関数

`upsertMatches` 関数の直後（238 行目付近）に以下を追加する。

```typescript
async function upsertCompetitionTeams(
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = Object.values(teamLookup).map((teamId) => ({
    competition_id: competitionId,
    team_id: teamId,
  }));
  const { error } = await client
    .from("competition_teams")
    .upsert(rows, { onConflict: "competition_id,team_id" });
  if (error) throw error;
  return rows.length;
}
```

### `main()` の変更

`upsertMatches` の呼び出し直後に `upsertCompetitionTeams` を追加する。

```typescript
// 変更前
async function main() {
  const year = parseYearArg(process.argv[2]);
  const results = await readResults(year);
  const competitionId = await upsertCompetition(year);
  const teamLookup = await getTeamLookup(
    results.flatMap((result) => [result.home_team_slug, result.away_team_slug]),
  );
  const upsertedCount = await upsertMatches(
    results,
    competitionId,
    teamLookup,
    year,
  );

  console.log(`Upserted ${upsertedCount} matches for Six Nations ${year}`);
}

// 変更後
async function main() {
  const year = parseYearArg(process.argv[2]);
  const results = await readResults(year);
  const competitionId = await upsertCompetition(year);
  const teamLookup = await getTeamLookup(
    results.flatMap((result) => [result.home_team_slug, result.away_team_slug]),
  );
  const upsertedCount = await upsertMatches(
    results,
    competitionId,
    teamLookup,
    year,
  );
  const teamCount = await upsertCompetitionTeams(competitionId, teamLookup);

  console.log(
    `Upserted ${upsertedCount} matches and ${teamCount} competition_teams for Six Nations ${year}`,
  );
}
```

---

## 完了条件

- [ ] `upsertCompetitionTeams` 関数が `scripts/import-six-nations-results.ts` に追加されている
- [ ] `main()` が `upsertCompetitionTeams` を呼び出している
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] 以下のコマンドを年ごとに順番に実行して各年のインポートと順位計算が成功する

```bash
for year in 2020 2021 2022 2023 2024; do
  pnpm tsx scripts/import-six-nations-results.ts $year
  pnpm tsx scripts/calculate-standings.ts --slug six-nations-$year
done
```

---

## 変更しないこと

- `scripts/calculate-standings.ts`
- `scripts/import-six-nations-results.ts` の既存ロジック（`upsertCompetition`、`getTeamLookup`、`upsertMatches`）
- `data/six-nations/*.json`
- `lib/` 以下のすべてのファイル
