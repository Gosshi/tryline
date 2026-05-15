# Top 14 2025-26 Wikipedia イベントシード

## 背景

`lib/scrapers/wikipedia-top-14-results.ts` は `div.vevent.summary` セレクタを使うため
プレーオフ（Relegation play-off / Semi-finals / Final）のみを処理し、
レギュラーシーズン（Round 1〜26）は完全に無視する。

その結果、Top 14 2025-26 の `matches.external_ids` に `wikipedia_url` が設定されず、
`fill-event-gaps` cron および `backfill-club-match-details.ts` がレギュラーシーズン全試合をスキップしている。
UI 側は実装済みのため、データを投入するだけで得点経過グラフが表示される。

### 確認済み情報

- **Top 14 2025-26 Wikipedia URL**: `https://en.wikipedia.org/wiki/2025%E2%80%9326_Top_14`
- **HTML 構造**: レギュラーシーズンは `div.vevent`（`.summary` クラスなし）を使用。
  Premiership・URC と同じ構造のため、`parseWikipediaSeasonMatches`（`lib/scrapers/wikipedia-season-parser.ts`）がそのまま使える。
- **Round セクション**: `Round_1` 〜 `Round_26`（mw-heading 内の h3/h2）
- **プレーオフ**: `div.vevent.summary`（既存 `parseTop14ResultsHtml` が担当。変更不要）

## スコープ

対象:
- `scripts/seed-wikipedia-external-ids.ts` — Top 14 ターゲット追加
- `lib/scrapers/wikipedia-team-name-map.ts` — Top 14 チーム名マップ追記
- `scripts/backfill-club-match-details.ts` — `top-14` を `CLUB_FAMILIES` に追加（`p4-rugby-championship-event-seed.md` で既に追加済みの場合は確認のみ）

対象外:
- `lib/scrapers/wikipedia-top-14-results.ts`（プレーオフスクレイパー。変更不要）
- `app/matches/[id]/page.tsx`（UI 変更不要）
- ラインアップ（Top 14 Wikipedia に先発データなし。`backfill-club-match-details.ts` のラインアップ処理は既に無効化済みであること）

## `scripts/seed-wikipedia-external-ids.ts` の修正

### 1. `WikipediaSeasonFamily` 型を拡張

```ts
type WikipediaSeasonFamily = "premiership" | "urc" | "rugby-championship" | "top-14";
```

### 2. `WIKIPEDIA_SEASON_URLS` にエントリ追加

```ts
"top-14-2025-26": {
  competitionSlug: "top-14-2025-26",
  family: "top-14",
  url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_Top_14",
},
```

`competitionSlug` の正確な値は実装前に `SELECT slug FROM competitions WHERE slug ILIKE '%top-14%'` で確認すること。

### 3. `parseOptions` の family バリデーション修正

```ts
if (!["premiership", "urc", "rugby-championship", "top-14"].includes(value)) {
  throw new Error(`Unsupported --family value: ${value}`);
}
```

### 4. パーサーの切り替え（既存ロジックを流用）

Top 14 のレギュラーシーズンは Premiership/URC と同じ `parseWikipediaSeasonMatches` で解析できる。
`target.family` が `"top-14"` の場合も同関数を呼び出す（追加の分岐不要）。

## `lib/scrapers/wikipedia-team-name-map.ts` の修正

Top 14 のチーム名マップを追記する。実装前に `SELECT name FROM teams WHERE name ILIKE '%toulouse%'` 等で DB の正確な表記を確認すること。

```ts
// Top 14（DB の teams.name の正確な表記を要確認）
"Bayonne":          "Aviron Bayonnais",
"Bordeaux Bègles":  "Union Bordeaux Bègle",
"Castres":          "Castres Olympique",
"Clermont":         "ASM Clermont",
"Grenoble":         "FC Grenoble",
"La Rochelle":      "La Rochelle",
"Lyon":             "Lyon",
"Montpellier":      "Montpellier Hérault",
"Pau":              "Section Paloise",
"Perpignan":        "Perpignan",
"Racing":           "Racing 92",
"Racing 92":        "Racing 92",
"Stade Français":   "Stade Français",
"Toulon":           "RC Toulon",
"Toulouse":         "Toulouse",
"Vannes":           "Stade Aurillacois",
```

マッチング順: 完全一致 → マップ参照 → 部分一致（`teams.name.includes(wikiName)`）。
失敗した場合は警告ログを出してスキップ。

## `scripts/backfill-club-match-details.ts` の修正

`CLUB_FAMILIES` に `"top-14"` が未追加の場合のみ追加する（`p4-rugby-championship-event-seed.md` で追加済みであれば変更不要）:

```ts
const CLUB_FAMILIES = [
  "premiership",
  "urc",
  "top-14",
  "super-rugby-pacific",
  "rugby-championship",
] as const;
```

## 実行手順（実装後に Owner が実行する）

```bash
set -a; source .env.production.local; set +a

# Step 1: DB の competitions.slug と teams.name を確認
# SELECT slug FROM competitions WHERE slug ILIKE '%top-14%';
# SELECT name FROM teams WHERE name ILIKE '%toulouse%' OR name ILIKE '%clermont%';

# Step 2: シード（dry-run）
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=top-14 --dry-run

# Step 3: マッチ件数が > 0 なら本番シード
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=top-14

# Step 4: イベントバックフィル（dry-run）
pnpm tsx scripts/backfill-club-match-details.ts --family=top-14 --dry-run --limit=5

# Step 5: 本番バックフィル
pnpm tsx scripts/backfill-club-match-details.ts --family=top-14 --limit=50
```

## 変更ファイル

- `scripts/seed-wikipedia-external-ids.ts`（Top 14 ターゲット・型・バリデーション追加）
- `lib/scrapers/wikipedia-team-name-map.ts`（Top 14 チーム名追記）
- `scripts/backfill-club-match-details.ts`（`top-14` を `CLUB_FAMILIES` に追加、未追加の場合のみ）

## 受け入れ条件

- [ ] `seed --family=top-14 --dry-run` でマッチ件数 > 0 が表示される
- [ ] `seed --family=top-14` 実行後、対象試合の `external_ids` に `wikipedia_url` が設定される
- [ ] `backfill --family=top-14 --dry-run --limit=5` で `events > 0` の試合が存在する
- [ ] Top 14 の終了済み試合詳細ページで得点経過グラフが表示される
- [ ] ラインアップセクションは非表示のまま（データなし = 正常）
- [ ] プレーオフスクレイパー（`wikipedia-top-14-results.ts`）の動作に変化なし
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. DB の `competitions.slug` が `"top-14-2025-26"` であることを Owner が確認する
2. DB の `teams.name` で Top 14 クラブの正確な表記を確認する（上記マップは仮）
3. Top 14 2025-26 の試合レコードが DB に存在するか確認する。存在しない場合は別途データ投入が必要（`ingest-results` cron に Top 14 を追加する）
