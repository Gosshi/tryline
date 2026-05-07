# p2-league-one-scraper: League One 公式サイトスクレイパー

## 参照仕様書

`specs/p2-league-one-scraper.md` を読んでから実装してください。

---

## 実装する機能

### 1. `lib/scrapers/league-one-schedule.ts`（新規）

スケジュールページ `https://league-one.jp/en/schedule/?season={season}&division=D1` をパースし、
D1 終了試合の一覧を返す関数を実装します。

**注意点:**
- `fetchWithPolicy` を使う（`@/lib/scrapers/fetcher` から import）
- `season` パラメータの実際の形式は HTML を取得して確認する（`2024-25` か `2024` か）
- 「Match Detail」リンクから数値 ID を抽出（URL パターン: `/en/match/(\d+)`）
- 終了済み試合のみ返す（スコアが存在するもの、または試合ステータスが完了のもの）
- cheerio で HTML をパース（他のスクレイパーと同様のパターン）

**エクスポートする型と関数:**
```typescript
export type LeagueOneScheduleEntry = {
  league_one_match_id: number;
  round: number;
  kickoff_at: string;       // ISO 8601 UTC
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  match_url: string;        // https://league-one.jp/en/match/{id}
};

export async function fetchLeagueOneSchedule(
  season: string,
): Promise<LeagueOneScheduleEntry[]>
```

チーム名 → slug の変換テーブル（`TEAM_SLUG_BY_LEAGUE_ONE_NAME`）を同ファイル内に定義:
```typescript
const TEAM_SLUG_BY_LEAGUE_ONE_NAME: Record<string, string> = {
  "Saitama Wild Knights": "saitama-wild-knights",
  "Kubota Spears Funabashi Tokyo-Bay": "kubota-spears",
  "Toyota Verblitz": "toyota-verblitz",
  "Tokyo Suntory Sungoliath": "tokyo-suntory-sungoliath",
  "Kobelco Kobe Steelers": "kobelco-kobe-steelers",
  "Toshiba Brave Lupus Tokyo": "toshiba-brave-lupus",
  "Urayasu D-Rocks": "urayasu-d-rocks",
  "Canon Eagles": "canon-eagles",
  "Mitsubishi Sagamihara DynaBoars": "mitsubishi-dynaboars",
  "Black Rams Tokyo": "ricoh-black-rams",
  "Shizuoka Blue Revs": "shizuoka-blue-revs",
  "Honda Heat": "honda-heat",
};
```

---

### 2. `lib/scrapers/league-one-match.ts`（新規）

`https://league-one.jp/en/match/{id}/print` をパースし、ラインアップと得点イベントを返す。

**エクスポートする型と関数:**
```typescript
export type LeagueOnePlayer = {
  jersey_number: number;
  player_name: string;
  team_side: "home" | "away";
};

export type LeagueOneEvent = {
  minute: number | null;
  player_name: string;
  event_type: "try" | "conversion" | "penalty" | "drop_goal";
  team_side: "home" | "away";
};

export type LeagueOneMatchDetail = {
  players: LeagueOnePlayer[];
  events: LeagueOneEvent[];
};

export async function fetchLeagueOneMatchDetail(
  matchId: number,
): Promise<LeagueOneMatchDetail>
```

**イベント種別マッピング（スクレイパー内部のみ）:**
- HTML の `T` → `"try"`
- HTML の `G` → `"conversion"`
- HTML の `PG` → `"penalty"`
- HTML の `DG` → `"drop_goal"`
- HTML の `PT`（ペナルティトライ）→ `"try"`

---

### 3. `scripts/import-league-one-full.ts`（新規）

**実行コマンド:**
```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-league-one-full.ts 2024-25
```

**既存の参照パターン:** `scripts/import-league-one-results.ts` および `scripts/backfill-match-lineups.ts` を参考にする。

**処理フロー:**

```
1. parseSeasonArg(process.argv[2]) でシーズン検証
2. fetchLeagueOneSchedule(season) で D1 全終了試合を取得
3. upsertCompetition(...) — 既存パターンと同じ
   family = "league-one"
   name = `Japan Rugby League One ${season}`
   slug = `league-one-${season}`
4. getTeamLookup(slugs) — 既存パターンと同じ
5. upsertMatches(...) — external_ids に league-one-jp を記録
6. upsertCompetitionTeams(...) — 既存パターンと同じ
7. 各試合について:
   a. fetchLeagueOneMatchDetail(entry.league_one_match_id)
   b. ensurePlayerIds(teamId, playerNames) でプレイヤー UUID を解決
   c. upsertMatchLineups(matchId, homeTeamId, awayTeamId, players, printUrl)
   d. upsertMatchEvents(matchId, homeTeamId, awayTeamId, events, playerNameToIdMap)
```

**重要: DB スキーマとの対応関係**

`match_lineups` テーブル:
- `player_id uuid NOT NULL` → `ensurePlayerIds()` パターンを使い、プレイヤー名から UUID を解決する
  - `players` テーブルを `(team_id, name)` で検索し、存在しなければ `insert` して UUID を取得
  - `external_ids: { source: "league-one-jp" }` を付けて players を insert する
- `source_url text NOT NULL` → `https://league-one.jp/en/match/{matchId}/print` を渡す
- `position` 列は存在しないため、スクレイパーから取得しても **保存しない**

`match_events` テーブルの `type` 制約（DB 値は以下のみ許可）:
```
'try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card' | 'substitution'
```

スクレイパーが返す `"penalty"` → DB に保存する際は `"penalty_goal"` に変換すること。
変換マッピング:
```typescript
const EVENT_TYPE_TO_DB: Record<LeagueOneEvent["event_type"], string> = {
  try: "try",
  conversion: "conversion",
  penalty: "penalty_goal",   // ← 注意: スクレイパー型と DB 制約で名前が異なる
  drop_goal: "drop_goal",
};
```

`match_events.player_id` は nullable なので、名前解決できなかった場合は `null` で insert する。

**`external_ids` の形式:**
```json
{
  "source": "league-one-jp",
  "league_one_match_id": 29291,
  "match_url": "https://league-one.jp/en/match/29291"
}
```

`matches` の upsert conflict key は `(competition_id, home_team_id, away_team_id, kickoff_at)` なので、
Wikipedia 由来の既存レコードがあれば `external_ids` を上書きする形で更新される。

---

## 既存ファイルの扱い

- `lib/scrapers/wikipedia-league-one-results.ts` — **変更しない**（歴史データ用として残す）
- `scripts/import-league-one-results.ts` — **変更しない**（歴史データ用として残す）

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `import-league-one-full.ts 2024-25` 実行で D1 全試合が `matches` に入る
- 各試合に `match_lineups` が 23 件前後存在する
- 各試合に `match_events` が得点イベント分だけ存在する
- `external_ids.source = 'league-one-jp'` が設定されている
- `fetchWithPolicy` 経由でリクエスト（デフォルト 3 秒インターバル）

## ブランチ・PR

- ブランチ: `feat/league-one-official-scraper`
- PR タイトル: `Feat: League One official site scraper (schedule + lineups + events)`
