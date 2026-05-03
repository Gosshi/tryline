# fix: Top 14 プレーオフ スクレイパーの修正

## 問題

```
node --env-file=.env.production.local tools/run-ts.cjs scripts/import-top-14-results.ts 2024-25
Error: No finished Top 14 playoff matches were found.
```

`lib/scrapers/wikipedia-top-14-results.ts` が試合データを取得できず 0 件になっている。

## Wikipedia ページ情報

URL: `https://en.wikipedia.org/wiki/2024%E2%80%9325_Top_14_season`
（`buildWikipediaUrl` で `2024-25` → `2024–25`（em-dash）に変換している。URL は正しい）

ページのプレーオフセクション構造:

```
h2: Playoffs
  h3: Semi-final_Qualifiers  ← 2試合
  h3: Semi-finals            ← 2試合
  h3: Final                  ← 1試合
h2: Relegation_play-off      ← 1試合
```

確認済みの実試合データ（2024-25シーズン）:

| セクション | 試合 | スコア |
|---|---|---|
| Semi-finals | Toulouse vs Bayonne | 32–25 |
| Semi-finals | Bordeaux Bègles vs Toulon | 39–24 |
| Final | Toulouse vs Bordeaux Bègles | 39–33 (a.e.t.) |

## 現在の実装の問題点

`getSectionLines` 関数はセクション内テキストを収集して日付正規表現でパースするアプローチを取っている。
しかし Wikipedia の Top 14 ページはプレーオフ試合を `div.vevent.summary` 要素で表現しており、
このアプローチでは試合データを取得できない。

## 修正方針

`parseSection` / `getSectionLines` / `parseMatchLine` アプローチを廃止し、
`div.vevent.summary` ベースのアプローチに全面変更する。

**参考実装**: `lib/scrapers/wikipedia-premiership-results.ts`（同じ vevent 構造を使用）

### セクション → ラウンド番号マッピング

| セクション h3/h2 ID | ラウンド番号 |
|---|---|
| `Relegation_play-off` | 0 |
| `Semi-final_Qualifiers` | 1 |
| `Semi-finals` | 2 |
| `Final` | 3 |

### 実装の流れ

1. `$("div.vevent.summary")` で全 vevent を取得
2. 各 vevent の直前の h2/h3 要素の id を取得して所属セクションを判定
3. 上記マッピングに含まれないセクションの vevent はスキップ
4. vevent 内から日付・時刻・スコア・チーム名・会場を抽出（Premiership スクレイパーと同じロジック）
5. チームを `TEAM_SLUG_BY_WIKIPEDIA_NAME` で解決

### セクション判定のヘルパー関数

Premiership の `isWithinRegularSeason` を参考に実装する:

```typescript
function getSectionId(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
): string | null {
  let cursor = block.prev();
  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      return cursor.find("h2, h3").attr("id") ?? null;
    }
    cursor = cursor.prev();
  }
  return null;
}
```

## 変更するファイル

- `lib/scrapers/wikipedia-top-14-results.ts`
  - `getSectionLines`, `parseSection`, `parseMatchLine`, `STAGES` を削除
  - vevent ベースの実装に置き換え
  - セクション ID → ラウンド番号の `SECTION_ROUNDS` マップを追加

## 変更しないこと

- `buildWikipediaUrl`（em-dash 変換は正しい）
- `TEAM_SLUG_BY_WIKIPEDIA_NAME`（チームマッピングはそのまま）
- `parseSeason`（バリデーションはそのまま）
- `parseKickoffAt`（タイムゾーン処理はそのまま）
- `scripts/import-top-14-results.ts`（インポートスクリプトは変更不要）

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `node --env-file=.env.local tools/run-ts.cjs scripts/import-top-14-results.ts 2024-25` が正常終了し、5〜7 件程度の試合がインポートされること

## ブランチ・PR

- ブランチ: `fix/top-14-scraper`
- PR タイトル: `Fix Top 14 playoff scraper to use vevent-based parsing`
