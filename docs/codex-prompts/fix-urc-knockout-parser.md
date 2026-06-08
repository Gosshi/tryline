# Codex プロンプト: URC knockout イベントパーサー修正

## 仕様書

`specs/fix-urc-knockout-parser.md` を読んで実装してください。

## 概要

`lib/scrapers/wikipedia-urc-match-details.ts` の `parseEventId` 関数が `Round_\d+` 形式しか認識しないため、`Quarter-finals_*`・`Semi-finals_*`・`URC_Grand_Final_*` 形式のノックアウト試合イベント ID で常に `null` を返しパースをスキップしています。これを修正します。

## 対象ファイル

- `lib/scrapers/wikipedia-urc-match-details.ts` のみ

## 手順

### 1. Wikipedia ページの h3 アンカーを確認

以下を実行し、URC 2024-25 シーズンページの h3/h2 アンカー ID を一覧表示してください:

```bash
pnpm tsx -e "
import { fetchWithPolicy } from './lib/scrapers/fetcher';
const res = await fetchWithPolicy('https://en.wikipedia.org/wiki/2024-25_United_Rugby_Championship');
const html = await res.text();
const matches = [...html.matchAll(/<h[23][^>]*id=\"([^\"]+)\"[^>]*>/g)];
matches.forEach(m => console.log(m[1]));
"
```

ノックアウトラウンド（Quarter-finals・Semi-finals・Grand Final）の実際のアンカー ID を確認してください。

### 2. `parseEventId` を修正

現在の L72-L95 の実装に、ノックアウト形式のマッチを追加します。
`Round_\d+` の teamMatch が失敗した後、以下のパターンも試みるようにします:

```typescript
// 仕様書の Step 2 を参照
const knockoutTeamMatch = eventId.match(
  /^(Quarter-finals|Semi-finals|URC_Grand_Final|Grand_Final|...)_(.+)_v_(.+)$/i
);
```

`...` の部分は Step 1 で確認した実際のアンカー ID に基づいて調整してください。

### 3. anchor ID 不一致への対応

event_id の roundId（例: `URC_Grand_Final`）と Wikipedia の h3 anchor（例: `Grand_Final`）が異なる場合は、`findRoundTables` 関数の冒頭でマッピングを行う小さな変換を追加してください。

### 4. dry-run で検証

```bash
pnpm tsx scripts/backfill-urc-match-events.ts --dry-run
```

`events_found > 0` になることを確認してください。

## 完了条件

- dry-run で `events_found > 0`（Q/F または S/F の試合で events が取れていれば OK）
- `pnpm tsc --noEmit` clean
- `pnpm lint` clean
- diff は `lib/scrapers/wikipedia-urc-match-details.ts` のみ
