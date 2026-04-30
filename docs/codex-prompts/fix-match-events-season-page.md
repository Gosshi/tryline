# Codex プロンプト: fix-match-events-season-page

以下の内容をそのまま Codex にコピペして使用します。

---

`lib/scrapers/wikipedia-match-events.ts` の実装が根本的に間違っています。修正してください。

## 問題

現在の実装は `buildMatchWikipediaUrl` で個別試合ページの URL を生成し `scrapeMatchEvents(url)` でそのページを fetch しています。しかし Six Nations の Wikipedia には対戦カードごとの個別ページは存在しません。すべての試合情報（スコアラーを含む）は `https://en.wikipedia.org/wiki/2025_Six_Nations_Championship` のようなシーズンページに集約されています。

## 解決策

シーズンページはすでに fetch 済みです。`lib/ingestion/sources/wikipedia-six-nations.ts` の `parseWikipediaSixNationsHtml` が返す各 `ParsedWikipediaMatch` には `rawHtml` フィールドがあり、これは `div.vevent.summary` ブロック 1 試合分の HTML です。この `rawHtml` にスコアラー情報（Tries / Conversions / Penalties 等）が含まれているため、追加の HTTP fetch は一切不要です。

## 実装前に必ず読むファイル

1. `lib/scrapers/wikipedia-match-events.ts` — 現行実装（削除・変更対象）
2. `lib/ingestion/sources/wikipedia-six-nations.ts` — `ParsedWikipediaMatch.rawHtml` の取得方法を把握する
3. `lib/ingestion/results.ts` — `buildMatchWikipediaUrl` + `scrapeMatchEvents` の呼び出し箇所
4. `scripts/backfill-match-events.ts` — 大幅書き換え対象
5. `lib/scrapers/index.ts` — export の更新対象

## 変更内容

### Step 1: `lib/scrapers/wikipedia-match-events.ts` の修正

**削除する:**
- `WIKIPEDIA_TEAM_NAME_BY_DB_NAME`（URL 構築用のマッピング。不要になる）
- `resolveWikipediaTeamName`
- `buildMatchWikipediaUrl`
- `scrapeMatchEvents`

**変更する:**
- `parseWikipediaMatchEventsHtml(html: string)` を `parseMatchEventsFromVeventHtml(rawHtml: string)` にリネームする
- セレクターを `"table.infobox tr, table.vevent tr"` から `"tr"` に変更する

  **理由:** `rawHtml` は `div.vevent.summary` ブロック 1 件のみの HTML なので、全 `tr` を対象にしても他の試合のデータは混入しない。`EVENT_TYPE_BY_LABEL` に一致しない行（日付・会場テーブルの行等）は自動的にスキップされる。

**export するもの（最終的に残るもの）:**
```typescript
export type { ParsedMatchEvent };
export { parseMatchEventsFromVeventHtml };
```

### Step 2: `lib/ingestion/results.ts` の修正

`buildMatchWikipediaUrl` + `scrapeMatchEvents` の呼び出しを削除し、`parseMatchEventsFromVeventHtml` を使うよう変更する。

変更前:
```typescript
const matchUrl = buildMatchWikipediaUrl({
  awayTeamName: match.awayTeamName,
  homeTeamName: match.homeTeamName,
  year: competition.season,
});
const events = await scrapeMatchEvents(matchUrl);
```

変更後:
```typescript
const events = parseMatchEventsFromVeventHtml(match.rawHtml);
```

`match` は `resolvedMatches[record.candidateIndex]` であり `rawHtml` を持っている（`ResolvedResultMatch` 型を確認すること）。`await` は不要になる。

### Step 3: `scripts/backfill-match-events.ts` の大幅書き換え

現行は「DB の matches を取得 → 試合ごとに個別 URL を fetch」という設計になっているため、シーズンページベースに書き直す。

**新しいフロー:**

```
competition を season 単位でグループ化
  ↓
各 season について:
  Wikipedia シーズンページを fetchWithPolicy で 1 回だけ取得
    URL: `https://en.wikipedia.org/wiki/${season}_Six_Nations_Championship`
  parseWikipediaSixNationsHtml(html) で vevent 一覧を取得
  vevent を `${homeTeamName}_${awayTeamName}` をキーとする Map に変換
    ↓
  その season の DB 上の finished かつ match_events が空の matches を取得
  各 match について:
    Map から home_team.name + away_team.name でマッチング
    見つかった vevent の rawHtml を parseMatchEventsFromVeventHtml に渡す
    upsertMatchEvents を呼ぶ（dry-run 時はスキップ）
    ↓
  次の season へ（season 間で 1 秒 sleep）
```

**Wikipedia シーズンページ URL の構築:**
competition の `slug` フィールドが `"six-nations-2025"` 形式なので、year を抽出して URL を構築する:
```typescript
const year = competition.slug.replace("six-nations-", "");
const pageUrl = `https://en.wikipedia.org/wiki/${year}_Six_Nations_Championship`;
```

**マッチングキー:** vevent の `homeTeamName` / `awayTeamName` は DB の `teams.name` と一致する（どちらも同じ Wikipedia ページ由来）ので直接比較できる。

**マッチングが見つからない場合:** `console.warn` してスキップ。

### Step 4: `lib/scrapers/index.ts` の更新

```typescript
// 変更前
export {
  buildMatchWikipediaUrl,
  parseWikipediaMatchEventsHtml,
  scrapeMatchEvents,
} from "@/lib/scrapers/wikipedia-match-events";

// 変更後
export {
  parseMatchEventsFromVeventHtml,
} from "@/lib/scrapers/wikipedia-match-events";
```

### Step 5: テストの更新

- `tests/scrapers/wikipedia-match-events.test.ts`: `parseWikipediaMatchEventsHtml` → `parseMatchEventsFromVeventHtml` にリネーム。`buildMatchWikipediaUrl` / `scrapeMatchEvents` のテストは削除
- `tests/scrapers/index.test.ts`: 削除した export のテストを除去
- その他、削除した関数を参照しているテストがあれば更新

## 注意事項

- `fetchWithPolicy` を必ず使う（直接 `fetch` は使わない）
- 新規 npm パッケージは追加しない
- `CLAUDE.md` / `specs/` / `docs/decisions.md` を書き換えない

## 完了時に必ず報告すること

- `pnpm lint` / `pnpm typecheck` の結果
- `parseMatchEventsFromVeventHtml` に実際の `rawHtml` サンプルを渡したときのパース結果（テスト上でよい）
