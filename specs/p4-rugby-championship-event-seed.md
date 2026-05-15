# Rugby Championship イベントシード

## 背景

Premiership・URC の Wikipedia イベントシードが完成した。同じパイプラインを Rugby Championship (RC) に拡張する。

RC の Wikipedia シーズンページは Premiership/URC と HTML 構造が異なるため、新しいパーサーが必要。

### RC Wikipedia ページ構造（Premiership/URC との差異）

| 項目 | Premiership/URC | Rugby Championship |
|---|---|---|
| 試合要素 | `div.vevent` | なし（テーブル/平文） |
| チーム名 | `.vcard` / `.fn` / `<a>` | `<a>` リンクのテキスト |
| 日付 | `<time>` / `abbr.dtstart` | セクション内の平文テキスト |
| 試合識別子 | 試合ごとの `id` 属性 | `Round_1`〜`Round_6`（ラウンド単位） |
| 試合の区切り | 各 `div.vevent` | `<hr>` / 水平線 |
| ラインアップ | **なし** | **あり**（先発15名＋交代） |
| 得点表記 | 個別試合詳細ページ | `Try:` / `Con:` / `Pen:` + 分数（同一ページ内） |

**RC の `wikipedia_event_id` 形式**: `Round_1_0`（ラウンド番号 + ラウンド内インデックス）

## スコープ

対象:
- `lib/scrapers/wikipedia-rc-season-parser.ts` — 新規作成
- `lib/scrapers/wikipedia-rc-match-details.ts` — 新規作成
- `scripts/seed-wikipedia-external-ids.ts` — RC ターゲット追加
- `scripts/backfill-club-match-details.ts` — RC 対応追加

対象外:
- `lib/scrapers/wikipedia-season-parser.ts`（既存パーサー、変更なし）
- `lib/scrapers/wikipedia-club-match-details.ts`（既存スクレイパー、変更なし）
- Six Nations / Autumn Nations / PNC（今回は RC のみ）

## 対象 URL

```ts
// 2025 Rugby Championship
"https://en.wikipedia.org/wiki/2025_Rugby_Championship"
```

`competitionSlug`: `"rugby-championship-2025"`（DB の `competitions.slug` に合わせること）

## 実装: `lib/scrapers/wikipedia-rc-season-parser.ts`

### 出力型（既存 `WikipediaSeasonMatch` と同じ形式）

```ts
export type WikipediaSeasonMatch = {
  awayTeamName: string;
  dateKey: string | null;   // "YYYY-MM-DD"
  dateText: string | null;
  homeTeamName: string;
  sectionId: string | null; // "Round_1_0" 形式
};
```

### 解析アルゴリズム

1. `cheerio` で HTML をロード
2. `h3[id^="Round_"]` を順に処理（Round_1〜Round_6）
3. 各ラウンドセクションの直後の兄弟要素を収集（次の `h3` が来るまで）
4. `<hr>` 要素でセクションを分割 → 各断片が 1 試合
5. 各試合断片から抽出:
   - **チーム名**: `<a>` リンクのテキスト（国名）。スコア（`\d+[–-]\d+`）を含む要素の両隣を基準にする
   - **日付**: セクション内の平文テキストから `ISO_DATE_PATTERN` または `DATE_FORMATS` で解析
   - **sectionId**: `"${roundId}_${matchIndex}"`（例: `"Round_1_0"`）
6. チーム名は `normalizeWikipediaTeamName` で正規化（既存関数を import）

### チーム名マップへの追記（`wikipedia-team-name-map.ts`）

RC のチーム名は Wikipedia 上ではフル国名。DB の `teams.name` との対応を追加:

```ts
// RC 国際チーム（DBの teams.name に合わせて調整すること）
"New Zealand":    "New Zealand",
"Australia":      "Australia",
"South Africa":   "South Africa",
"Argentina":      "Argentina",
```

※ 実装前に `SELECT name FROM teams WHERE name ILIKE '%zealand%'` 等で DB の正確な表記を確認すること。

## 実装: `lib/scrapers/wikipedia-rc-match-details.ts`

RC シーズンページの特定の試合断片から得点イベントとラインアップを抽出する。

### 関数シグネチャ

```ts
export async function scrapeWikipediaRcMatchDetails(source: {
  url: string;
  eventId: string | null; // "Round_1_0" 形式
}): Promise<WikipediaClubMatchDetails>
```

戻り値の型は既存の `WikipediaClubMatchDetails` と同じ形式。

### 解析アルゴリズム

1. ページを fetch（`fetchWithPolicy` を使用）
2. `eventId` を `"Round_1_0"` → `roundId = "Round_1"`, `matchIndex = 0` に分解
3. ラウンドセクション（`h3#Round_1` 以降〜次の `h3` まで）を収集
4. `<hr>` で分割し `matchIndex` 番目の断片を取得
5. その断片から以下を抽出:

#### 得点イベント（`events`）

得点行の形式: `"Try: Player Name (4', 23'), Player Name (45')"`

```
Try: → type = "try"
Con: → type = "conversion"
Pen: → type = "penalty_goal"
DG:  → type = "drop_goal"（存在する場合）
```

- 正規表現 `(\d+)'` で分数を抽出
- チーム判定: ホーム/アウェイの得点セクションは試合断片内のチーム名位置で区別
- `playerName`: リンクのテキスト（`cleanText` で正規化）

#### ラインアップ（`lineup`）

ポジション略語 → 番号のマッピング:

```ts
const POSITION_NUMBER: Record<string, number> = {
  LP: 1, HK: 2, TP: 3, LL: 4, RL: 5,
  BF: 6, OF: 7, N8: 8, SH: 9, FH: 10,
  LW: 11, IC: 12, OC: 13, RW: 14, FB: 15,
};
```

- 先発: 交代マーク（下矢印）なし、または交代元の選手
- リンクのテキストを `playerName` として使用
- `teamSide`: 断片内での順序（ホームチームが先に記載される想定）

## 実装: `scripts/seed-wikipedia-external-ids.ts` の修正

### 1. `WikipediaSeasonFamily` 型を拡張

```ts
type WikipediaSeasonFamily = "premiership" | "urc" | "rugby-championship";
```

### 2. `WIKIPEDIA_SEASON_URLS` にエントリ追加

```ts
"rugby-championship-2025": {
  competitionSlug: "rugby-championship-2025",
  family: "rugby-championship",
  url: "https://en.wikipedia.org/wiki/2025_Rugby_Championship",
},
```

### 3. `parseOptions` の family バリデーション修正

```ts
if (value !== "premiership" && value !== "urc" && value !== "rugby-championship") {
  throw new Error(`Unsupported --family value: ${value}`);
}
```

### 4. `seedTarget` でパーサーを切り替え

```ts
const sourceMatches = target.family === "rugby-championship"
  ? parseWikipediaRcSeasonMatches(html)   // 新規
  : parseWikipediaSeasonMatches(html);    // 既存
```

## 実装: `scripts/backfill-club-match-details.ts` の修正

### 1. `CLUB_FAMILIES` に追加

```ts
const CLUB_FAMILIES = [
  "premiership",
  "urc",
  "top-14",
  "super-rugby-pacific",
  "rugby-championship",
] as const;
```

### 2. スクレイパーを切り替え

```ts
const details =
  match.competition?.family === "rugby-championship"
    ? await scrapeWikipediaRcMatchDetails(source)   // 新規
    : await scrapeWikipediaClubMatchDetails(source); // 既存
```

## 実行手順（実装後に Owner が実行）

```bash
set -a; source .env.production.local; set +a

# Step 1: DB の teams.name を確認
# SELECT name FROM teams WHERE name ILIKE '%zealand%' OR name ILIKE '%australia%' etc.

# Step 2: シード（dry-run）
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=rugby-championship --dry-run

# Step 3: 本番シード
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=rugby-championship

# Step 4: イベントバックフィル（dry-run）
pnpm tsx scripts/backfill-club-match-details.ts --family=rugby-championship --dry-run --limit=5

# Step 5: 本番バックフィル
pnpm tsx scripts/backfill-club-match-details.ts --family=rugby-championship --limit=20
```

## 受け入れ条件

- [ ] `seed --family=rugby-championship --dry-run` でマッチ件数 > 0
- [ ] `backfill --dry-run --limit=5` で `events > 0` の試合が存在
- [ ] RC の試合詳細ページで得点経過グラフが表示される
- [ ] ラインアップが表示される（RC はデータあり）
- [ ] `pnpm tsc --noEmit` が通る

## 変更ファイル

- `lib/scrapers/wikipedia-rc-season-parser.ts`（新規）
- `lib/scrapers/wikipedia-rc-match-details.ts`（新規）
- `lib/scrapers/wikipedia-team-name-map.ts`（RC チーム名追記）
- `scripts/seed-wikipedia-external-ids.ts`（RC ターゲット・型・パーサー切り替え追加）
- `scripts/backfill-club-match-details.ts`（`CLUB_FAMILIES` + スクレイパー切り替え）

## 未解決の質問

1. DB の `competitions.slug` が `"rugby-championship-2025"` であることを Owner が確認する
2. DB の `teams.name` で Argentina / Australia / New Zealand / South Africa の正確な表記を確認する
3. `eventId` が `null`（シード失敗）の場合、バックフィルをスキップする（現状の挙動を維持）
