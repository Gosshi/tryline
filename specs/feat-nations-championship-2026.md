# Nations Championship 2026 取り込み

## 背景

World Rugby が 2026 年より開始した新国際大会「Nations Championship」を Tryline に対応する。Six Nations 6 か国 + 南半球 6 か国（NZ・SA・Australia・Argentina・**Japan**・Fiji）の計 12 チームが参加。**日本代表が全 6 試合出場**するため Tryline ユーザーへの関連度が高い。

開幕は **7 月 4 日**（本仕様書作成時点まであと約 10 日）のため速やかな実装が必要。

### 大会フォーマット

| フェーズ | 日程 | 場所 |
|---------|------|------|
| Round 1〜3（Southern Series） | 7/4・7/11・7/18 | 南半球ホスト |
| Round 4〜6（Northern Series） | 11/6〜8・11/13〜15・11/21 | 北半球ホスト |
| Finals Weekend | 11/27〜29 | Twickenham（ロンドン） |

### 参加 12 チーム（Tryline slug → 既存）

Northern: `england` `france` `ireland` `scotland` `wales` `italy`  
Southern: `new-zealand` `south-africa` `australia` `argentina` `japan` `fiji`

全チームの slug は既存 DB に存在する。

### Autumn Nations Series 2026 との関係

Nations Championship が 7 月・11 月の両試合窓を置き換えるため、2026 年は `2026_Autumn_Nations_Series` の Wikipedia ページが作成されない見込み。既存の `autumn-nations-2026` ソースは空を返すのみで問題は生じないが、ユーザー向けのナビ表記は要検討（後述）。

---

## スコープ

**対象:**
- DB への `nations-championship-2026` 大会レコード追加
- ingestion ソース作成・pipeline への登録
- ナビゲーション・大会ページへの追加
- `lib/format/competition.ts` へのカラー・名前登録

**対象外:**
- コンテンツ生成パイプライン（preview/recap の生成設定）— 既存 pipeline を継承
- 他大会（Nations Cup 2026 等）の取り込み
- `autumn-nations-2026` ソースの削除（空返却のまま残す）

---

## データモデル変更

### competitions テーブル（マイグレーション追加）

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

`name_ja` カラムが存在しない場合は `name` のみで INSERT する。既存マイグレーションのパターンに合わせること。

---

## API サーフェス

既存 `/api/cron/ingest-fixtures` を通じて自動取り込みされる。新規エンドポイント不要。

---

## Ingestion ソース

### 新規ファイル: `lib/ingestion/sources/wikipedia-nations-championship.ts`

Wikipedia URL: `https://en.wikipedia.org/wiki/2026_Nations_Championship`

**実装方針:**
1. `buildWikipediaUrl` で上記 URL を返す
2. `parseWikipediaSixNationsHtml` で HTML をパースする（**互換性を最初に検証すること**、後述）
3. `isMissingWikipediaPage` エラーは空配列を返してフォールバック
4. 12 チームすべての Wikipedia 表記名 → slug マッピングを定義する

**TEAM_SLUG_BY_WIKIPEDIA_NAME（必須エントリ）:**

```typescript
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
```

既存 `wikipedia-autumn-nations.ts` の実装パターンを参照すること。

**パーサー互換性の検証手順:**
1. 実装前に Wikipedia ページを fetch し `parseWikipediaSixNationsHtml` でパースを試みる
2. 各ラウンド 6 試合 × 6 ラウンド = 36 試合 + Finals Weekend 6 試合 = 最大 42 試合が取り込まれることを確認
3. 試合が抽出されない場合は `parseWikipediaSixNationsHtml` を拡張するか、専用パーサーを作成する
4. 7 月 4 日以降はスコアが記入されるため、スコアパースも動作確認すること

### `lib/ingestion/live-competitions.ts` への追加

```typescript
import { fetchNationsChampionship2026 } from "@/lib/ingestion/sources/wikipedia-nations-championship";

// LIVE_COMPETITION_SOURCES 配列に追加（rugby-championship エントリの直後）:
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

## UI サーフェス

### 1. `lib/format/competition.ts`

`COMPETITION_FAMILY_COLORS` に追加:
```typescript
"nations-championship": "#1A3A5C",
```

`FAMILY_DISPLAY_NAMES` に追加:
```typescript
"nations-championship": "Nations Championship",
```

### 2. `app/c/[competition]/page.tsx`

`COMPETITION_HERO_IMAGES` に追加（既存 Unsplash URL を流用）:
```typescript
"nations-championship": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
```

`COMPETITION_DESCRIPTIONS` に追加:
```typescript
"nations-championship": "ネーションズチャンピオンシップは World Rugby が 2026 年に創設した国際ラグビー大会。シックスネイションズ 6 か国と南半球・アジア 6 か国（NZ・南アフリカ・オーストラリア・アルゼンチン・日本・フィジー）が 7 月と 11 月の 2 フェーズで対戦し、11 月末のファイナルズウィークエンドで王者を決めます。",
```

### 3. `components/competition-nav-dropdown.tsx`

`HEADER_COMPETITIONS` に追加（`rugby-championship` の直後）:
```typescript
{
  family: "nations-championship",
  href: "/c/nations-championship",
  label: "ネーションズチャンピオンシップ",
},
```

---

## 受け入れ条件

1. `/c/nations-championship` にアクセスすると大会ページが表示される
2. `/c/nations-championship/2026` に試合一覧が表示される（7/4 以降は結果付き）
3. cron `ingest-fixtures` を実行すると `nations-championship-2026` の試合が取り込まれる
4. ヘッダーナビの「大会」ドロップダウンに「ネーションズチャンピオンシップ」が表示される
5. 日本代表の 6 試合（vs Italy・Ireland・France・Wales・England・Scotland）がすべて取り込まれる
6. Finals Weekend（11/27〜29）の 6 試合も取り込まれる
7. 既存大会（`rugby-championship-2026` 等）の取り込みに影響がない

---

## 未解決の質問

1. **パーサー互換性**: `parseWikipediaSixNationsHtml` が Nations Championship の Wikipedia ページ構造（6 ラウンド×6 試合 + Finals Weekend）に対応できるか。実装前に fetch して確認すること。
2. **`autumn-nations` ナビ表示**: 2026 年は Autumn Nations Series が存在しないため、ナビの「オータムネーションズシリーズ」リンクが空ページになる可能性がある。ナビへの表示条件（matchCount > 0 のシーズンが存在する場合のみ表示）を追加するか、Owner に確認すること。
3. **大会カラー**: `#1A3A5C`（深紺）は仮値。Owner が変更可。
