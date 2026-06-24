# feat-nations-championship-2026: ネーションズチャンピオンシップ 2026 取り込み

## 背景

World Rugby が 2026 年に創設した新国際大会「Nations Championship」を Tryline に追加する。
**開幕は 7 月 4 日**で、仕様書作成時点まで約 10 日。速やかに実装すること。

参照仕様書: `specs/feat-nations-championship-2026.md`

### 大会概要

- 参加 12 チーム: Six Nations 6 か国 + 南半球 6 か国（NZ・南アフリカ・オーストラリア・アルゼンチン・**日本**・フィジー）
- Round 1〜3: 7/4・7/11・7/18（南半球ホスト）
- Round 4〜6: 11/6〜8・11/13〜15・11/21（北半球ホスト）
- Finals Weekend: 11/27〜29（Twickenham）
- Wikipedia ページ: `https://en.wikipedia.org/wiki/2026_Nations_Championship`（200 OK 確認済み）

### Autumn Nations Series との関係

Nations Championship が 7 月・11 月の両窓を置き換えるため、2026 年は `2026_Autumn_Nations_Series` Wikipedia ページが存在しない可能性が高い。
既存の `autumn-nations-2026` ソースは空配列を返して正常終了するため、**削除・変更は不要**。

---

## Task 0 — パーサー互換性の検証（実装前に必ず行うこと）

以下のコードを一時スクリプトとして実行し、`parseWikipediaSixNationsHtml` が Nations Championship の Wikipedia ページを正しくパースできるか確認する。

```typescript
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";

const url = "https://en.wikipedia.org/wiki/2026_Nations_Championship";
const res = await fetchWithPolicy(url);
const html = await res.text();
const matches = parseWikipediaSixNationsHtml(html);
console.log(`Found ${matches.length} matches`);
console.log(JSON.stringify(matches.slice(0, 3), null, 2));
```

**期待する結果:**
- 試合数: 36〜42（6 ラウンド × 6 試合 + Finals Weekend 6 試合）
- 各試合に `homeTeamName`, `awayTeamName`, `kickoffAt` が含まれる

**パーサーが正しく動かない場合:**
既存の `lib/ingestion/sources/wikipedia-autumn-nations.ts` の実装パターンを参考に、`lib/ingestion/sources/` に専用パーサーを作成すること。

---

## Task 1 — DB マイグレーション

### ファイル: `supabase/migrations/<timestamp>_seed_nations_championship_2026.sql`（新規作成）

タイムスタンプは既存ファイルの最大値 +1 秒で生成すること。

```sql
INSERT INTO competitions (name, slug, family, season)
VALUES (
  'Nations Championship 2026',
  'nations-championship-2026',
  'nations-championship',
  '2026'
)
ON CONFLICT (slug) DO NOTHING;
```

`name_ja` カラムが `competitions` テーブルに存在する場合は以下に差し替えること:

```sql
INSERT INTO competitions (name, name_ja, slug, family, season)
VALUES (
  'Nations Championship 2026',
  'ネーションズチャンピオンシップ 2026',
  'nations-championship-2026',
  'nations-championship',
  '2026'
)
ON CONFLICT (slug) DO NOTHING;
```

---

## Task 2 — Ingestion ソース

### ファイル: `lib/ingestion/sources/wikipedia-nations-championship.ts`（新規作成）

`lib/ingestion/sources/wikipedia-autumn-nations.ts` を手本に実装する。

```typescript
import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "New Zealand": "new-zealand",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Wales: "wales",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Nations_Championship`;
}

export function parseNationsChampionshipLiveHtml(html: string): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

export async function fetchNationsChampionship2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2026");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseNationsChampionshipLiveHtml(await response.text());
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
```

Task 0 でパーサーが動かないことが判明した場合は `parseNationsChampionshipLiveHtml` 内を修正すること。`toEmptyWhenMissingOrUnstructured` のエラーメッセージは実際の例外に合わせること。

---

## Task 3 — `live-competitions.ts` への登録

### ファイル: `lib/ingestion/live-competitions.ts`

既存の `rugby-championship` エントリの直後に追加する。

```typescript
// 追加インポート
import { fetchNationsChampionship2026 } from "@/lib/ingestion/sources/wikipedia-nations-championship";

// LIVE_COMPETITION_SOURCES 配列に追加
{
  competitionName: "Nations Championship 2026",
  competitionSlug: "nations-championship-2026",
  family: "nations-championship",
  fetch: fetchNationsChampionship2026,
  season: "2026",
  sourceLabel: "wikipedia",
},
```

---

## Task 4 — `lib/format/competition.ts`

`COMPETITION_FAMILY_COLORS` に追加:

```typescript
"nations-championship": "#1A3A5C",
```

`FAMILY_DISPLAY_NAMES` に追加:

```typescript
"nations-championship": "Nations Championship",
```

---

## Task 5 — `app/c/[competition]/page.tsx`

`COMPETITION_HERO_IMAGES` に追加:

```typescript
"nations-championship": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
```

`COMPETITION_DESCRIPTIONS` に追加:

```typescript
"nations-championship":
  "ネーションズチャンピオンシップは World Rugby が 2026 年に創設した国際ラグビー大会。シックスネイションズ 6 か国と南半球・アジア 6 か国（NZ・南アフリカ・オーストラリア・アルゼンチン・日本・フィジー）が 7 月と 11 月の 2 フェーズで対戦し、11 月末のファイナルズウィークエンドで王者を決めます。",
```

---

## Task 6 — ナビゲーション

### ファイル: `components/competition-nav-dropdown.tsx`

`HEADER_COMPETITIONS` 配列の `rugby-championship` エントリ直後に追加する。

```typescript
{
  family: "nations-championship",
  href: "/c/nations-championship",
  label: "ネーションズチャンピオンシップ",
},
```

---

## 完了条件

- [ ] `/c/nations-championship` にアクセスすると大会ページが表示される
- [ ] `/c/nations-championship/2026` に試合一覧が表示される
- [ ] cron `ingest-fixtures` を手動実行すると `nations-championship-2026` の試合が取り込まれる
- [ ] 日本代表の 6 試合（vs Italy・Ireland・France・Wales・England・Scotland）が DB に存在する
- [ ] Finals Weekend 6 試合も取り込まれる
- [ ] ヘッダーナビに「ネーションズチャンピオンシップ」が表示される
- [ ] 既存大会（`rugby-championship-2026` 等）の取り込みが壊れていない
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## ブランチ・PR

- ブランチ: `feat/nations-championship-2026`
- PR タイトル: `Feat: Nations Championship 2026 ingestion`

## 変更しないこと

- `lib/scrapers/` 以下の既存スクレイパー
- `lib/ingestion/live-competitions.ts` の既存エントリ（`autumn-nations-2026` を含む）
- 既存の cron ルート・GitHub Actions ワークフロー
