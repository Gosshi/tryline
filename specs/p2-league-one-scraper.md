# p2-league-one-scraper: League One 公式サイトスクレイパー

## 背景

既存の League One スクレイパーはスペイン語 Wikipedia を参照しており、
プレーオフのみ・ラインアップなし・データ品質が低いという問題がある。

league-one.jp の公式サイト（英語版）には全試合結果・ラインアップ・得点タイムラインが
揃っており、Wikipedia では取得不可能なデータを提供している。
本仕様書はこの公式サイトをソースとした新スクレイパーを定義する。

## スコープ

対象:
- D1 全節全試合の試合結果（スコア・会場・日時）
- D1 全試合のラインアップ（先発 15 人 + リザーブ 8 人）
- D1 全試合の得点タイムライン（try・conversion・penalty・drop goal）
- 対象シーズン: `2024-25`（コマンド引数で指定）

対象外:
- D2 / D3
- 入替戦（別途検討）
- 試合レポートテキスト・動画

## データソース

| ページ | URL パターン | 用途 |
|---|---|---|
| 日程・結果一覧 | `https://league-one.jp/en/schedule/?season={season}&division=D1` | 試合ID収集・スコア確認 |
| 試合詳細（印刷版） | `https://league-one.jp/en/match/{id}/print` | ラインアップ・得点イベント |

robots.txt: 全ボット許可（調査済み）。
レートリミット: `fetchWithPolicy` デフォルト（3秒インターバル）を維持する。

## 新規ファイル

### `lib/scrapers/league-one-schedule.ts`

スケジュールページをパースし、D1 終了試合の一覧を返す。

```typescript
export type LeagueOneScheduleEntry = {
  league_one_match_id: number;     // /en/match/{id} の数値ID
  round: number;                    // 節番号
  kickoff_at: string;               // ISO 8601 UTC
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  match_url: string;                // https://league-one.jp/en/match/{id}
};

export async function fetchLeagueOneSchedule(
  season: string,
): Promise<LeagueOneScheduleEntry[]>
```

パース対象:
- 各試合カードの「Match Detail」リンクから数値 ID を抽出（URL: `/en/match/{数値ID}`）
- スコア・チーム名・日時・会場を抽出
- 終了済みの試合のみ返す（未来試合は除外）

### `lib/scrapers/league-one-match.ts`

`/en/match/{id}/print` をパースし、ラインアップと得点イベントを返す。

```typescript
export type LeagueOnePlayer = {
  jersey_number: number;
  player_name: string;
  position: string;          // "PR" | "HO" | "LK" | "FL" | "N8" | "SH" | "SO" | "W" | "C" | "FB"
  team_side: "home" | "away";
  is_replacement: boolean;   // jersey_number >= 16
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

イベント種別マッピング:
- `T` → `"try"`
- `G` → `"conversion"`
- `PG` → `"penalty"`
- `DG` → `"drop_goal"`
- `PT`（ペナルティトライ）→ `"try"`

### `scripts/import-league-one-full.ts`

実行コマンド:
```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-league-one-full.ts 2024-25
```

処理フロー:
1. `fetchLeagueOneSchedule(season)` で D1 全終了試合を取得
2. `upsertCompetition` / `getTeamLookup` / `upsertMatches`（既存パターンと同じ）
3. `upsertCompetitionTeams`（既存パターンと同じ）
4. 各試合について `fetchLeagueOneMatchDetail(matchId)` を呼び出し
5. ラインアップを `match_lineups` に upsert
6. 得点イベントを `match_events` に upsert

## データマッピング

### `matches.external_ids`

```json
{
  "source": "league-one-jp",
  "league_one_match_id": 29291,
  "match_url": "https://league-one.jp/en/match/29291"
}
```

### `match_lineups` へのマッピング

| League One フィールド | DB カラム |
|---|---|
| `jersey_number` | `jersey_number` |
| `player_name` | `player_name` |
| `position` | `position` |
| `team_side = "home"` → `homeTeamId` | `team_id` |
| `jersey_number >= 16` | `is_replacement`（参考情報、DBカラムがなければ無視）|

### `match_events` へのマッピング

| League One フィールド | DB カラム |
|---|---|
| `minute` | `minute` |
| `player_name` | `player_name` |
| `event_type` | `type` |
| `team_side` → teamId | `team_id` |

## チーム名マッピング

league-one.jp の英語表記 → 既存 slug への変換テーブルを
`lib/scrapers/league-one-match.ts` 内に定義する。

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

## 既存ファイルとの関係

- `lib/scrapers/wikipedia-league-one-results.ts` — **削除しない**。歴史的プレーオフデータ用として残す
- `scripts/import-league-one-results.ts` — **削除しない**。歴史データ用として残す
- 新スクリプト `import-league-one-full.ts` が 2024-25 以降の通常シーズンに使用される

## 受け入れ条件

- [ ] `import-league-one-full.ts 2024-25` を実行すると D1 全試合が `matches` に入る
- [ ] 各試合に `match_lineups` が 23 件前後存在する
- [ ] 各試合に `match_events` が得点イベント分だけ存在する
- [ ] `external_ids.source = 'league-one-jp'` が設定されている
- [ ] `pnpm tsc --noEmit` パス
- [ ] robots.txt チェックが `fetchWithPolicy` 経由で行われている
- [ ] リクエスト間隔が 3 秒以上（`fetchWithPolicy` デフォルト）

## 未解決の質問

- スケジュールページの `season` クエリパラメータの正確な形式（`2024-25` か `2024` か）は実装前に HTML を確認して決める
- 503 が頻発する場合は `minIntervalMs` を 5,000ms に引き上げる
- チーム名が公式サイトで変更された場合のマッピング更新方法
