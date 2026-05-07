# p3-world-rugby-scraper: World Rugby 公式サイト データ取得モジュール

## コンテキスト（最初に読むこと）

これはスポーツデータ集計サービス（Tryline）の開発タスクです。
worldrugby.org は全ボットへの HTTP アクセスを公式に許可しており（`robots.txt: Disallow:` が空）、
正当なデータ取得です。実装する内容は公開ページへの通常の HTTP GET リクエストです。

## 背景

PNC・Autumn Nations の Wikipedia データは品質が低く、ラインアップが取得できない。
worldrugby.org の公式サイトには全テストマッチの結果・ラインアップ・得点イベントが揃っている。

## スコープ

対象:
- テストマッチ全試合の結果（スコア・会場・日時）
- ラインアップ（先発 15 人 + リザーブ 8 人）
- 得点タイムライン（try・conversion・penalty・drop goal）
- 対象大会: PNC・Autumn Nations（family: `pnc`, `autumn-nations`）

対象外:
- クラブ大会（Six Nations はソースが別途あるため低優先）
- U20・セブンズ

## データソース調査（実装前に必ず確認）

worldrugby.org の実際の URL パターンをブラウザで確認すること:
- 試合一覧候補: `https://www.worldrugby.org/match-centre` / `/competitions/{id}/matches`
- 試合詳細候補: `https://www.worldrugby.org/match/{id}` / `/match-centre/{id}`

## 新規ファイル

### `lib/scrapers/world-rugby-schedule.ts`

```typescript
export type WorldRugbyMatchEntry = {
  world_rugby_match_id: string;
  competition_family: string;   // "pnc" | "autumn-nations" など
  season: string;               // "2024" など
  round: number | null;
  kickoff_at: string;           // ISO 8601 UTC
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  match_url: string;
};

export async function fetchWorldRugbySchedule(
  competitionId: string,
  season: string,
): Promise<WorldRugbyMatchEntry[]>
```

### `lib/scrapers/world-rugby-match.ts`

`lib/scrapers/league-one-match.ts` と同じ構造:

```typescript
export type WorldRugbyPlayer = {
  jersey_number: number;
  player_name: string;
  team_side: "home" | "away";
};

export type WorldRugbyEvent = {
  minute: number | null;
  player_name: string;
  event_type: "try" | "conversion" | "penalty" | "drop_goal";
  team_side: "home" | "away";
};

export type WorldRugbyMatchDetail = {
  players: WorldRugbyPlayer[];
  events: WorldRugbyEvent[];
};

export async function fetchWorldRugbyMatchDetail(
  matchId: string,
): Promise<WorldRugbyMatchDetail>
```

チーム名マッピング:
```typescript
const TEAM_SLUG_BY_WORLD_RUGBY_NAME: Record<string, string> = {
  Japan: "japan",
  "Japan XV": "japan",
  Fiji: "fiji",
  Samoa: "samoa",
  Tonga: "tonga",
  "United States": "usa",
  USA: "usa",
  Canada: "canada",
  England: "england",
  France: "france",
  Ireland: "ireland",
  Scotland: "scotland",
  Wales: "wales",
  Italy: "italy",
  "New Zealand": "new-zealand",
  Australia: "australia",
  "South Africa": "south-africa",
  Argentina: "argentina",
  "Hong Kong": "hong-kong",
  Uruguay: "uruguay",
};
```

### `scripts/import-world-rugby-full.ts`

```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-world-rugby-full.ts --family pnc --season 2024
```

`scripts/import-league-one-full.ts` と同じパターン:
1. `fetchWorldRugbySchedule` で試合一覧取得
2. `upsertCompetition` / `getTeamLookup` / `upsertMatches`
3. 各試合: `fetchWorldRugbyMatchDetail` → lineups + events upsert
4. `external_ids`: `{ source: "world-rugby", world_rugby_match_id: "...", round: 1, match_url: "..." }`

## DB スキーマとの対応

`import-league-one-full.ts` と同じ:
- `match_lineups.player_id NOT NULL` → `ensurePlayerIds()` パターン
- `match_lineups.source_url NOT NULL` → match detail URL
- `match_events.type`: `"penalty"` → `"penalty_goal"` に変換

## 既存ファイルの扱い

- `wikipedia-pacific-nations-cup-results.ts` → **削除しない**（歴史データ用）
- `wikipedia-autumn-nations-results.ts` → **削除しない**（歴史データ用）

## 受け入れ条件

- `pnpm tsc --noEmit` パス
- PNC 2024 の試合が `matches` に入り `external_ids.source = "world-rugby"` が設定される
- 各試合に `match_lineups` が 23 件前後存在する
- `fetchWithPolicy` 経由でリクエスト（3 秒インターバル）

## ブランチ・PR

- ブランチ: `feat/world-rugby-scraper`
- PR タイトル: `Feat: World Rugby official site data fetcher (schedule + lineups + events)`
