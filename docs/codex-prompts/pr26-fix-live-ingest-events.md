# fix: Premiership 点数経過が表示されない（live-ingest イベント挿入フック）

## 背景

Premiership の試合詳細ページで点数経過（スコアリングイベント）が表示されない。

`lib/ingestion/results.ts`（Six Nations 用）は試合が `finished` になった瞬間に
`statusChangedToFinished` を検知して `upsertMatchEvents()` を呼ぶ。
しかし `lib/ingestion/live-ingest.ts`（Premiership を含む全 live competition 用）には
このフックが存在しない。その結果、試合完了後も `match_events` テーブルに何も挿入されない。

加えて `toExternalIds()` が `wikipedia_url` を書かないため、
自動補完 cron (`app/api/cron/fill-event-gaps/route.ts`) も Premiership を処理対象に選ばない。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/ingestion/live-ingest.ts` | `statusChangedToFinished` フック追加 |

変更不可:
- `lib/ingestion/results.ts`（Six Nations 版）
- `app/api/cron/fill-event-gaps/route.ts`

---

## 変更内容

### `lib/ingestion/live-ingest.ts`

#### 1. import 追加

ファイル先頭の import に以下を追加する:

```typescript
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
```

#### 2. `ingestLiveCompetition` に statusChangedToFinished フックを追加

`saveRawData` の `Promise.all` の直後、`console.info` の前に以下を挿入する:

```typescript
// rawHtml に vevent 構造を持つ competition（Premiership 等）のみイベントが挿入される。
// rawHtml が空の場合（League One 等）は events が空配列になり何も挿入しない（冪等）。
let eventsInserted = 0;
const newlyFinishedMatches = result.records.filter(
  (record) => record.statusChangedToFinished,
);

for (const record of newlyFinishedMatches) {
  const match = resolvedMatches[record.candidateIndex];

  if (!match?.rawHtml) {
    continue;
  }

  try {
    const events = parseMatchEventsFromVeventHtml(match.rawHtml);

    if (events.length > 0) {
      const upserted = await upsertMatchEvents({
        awayTeamId: match.awayTeamId,
        events,
        homeTeamId: match.homeTeamId,
        matchId: record.id,
      });
      eventsInserted += upserted.inserted;
    }
  } catch (err) {
    console.warn(
      `[${source.competitionSlug}] event parse failed for match ${record.id}:`,
      err,
    );
  }
}
```

#### 3. `console.info` に `events_inserted` を追加

```typescript
console.info(
  `[${source.competitionSlug}] inserted=${result.matchesInserted} updated=${result.matchesUpdated} events_inserted=${eventsInserted}`,
);
```

#### 4. 戻り値に `events_inserted` を追加

```typescript
return {
  competition: source.competitionSlug,
  counts: {
    events_inserted: eventsInserted,
    matches_inserted: result.matchesInserted,
    matches_updated: result.matchesUpdated,
  },
};
```

`LiveIngestResult` 型の `counts` に `events_inserted?: number` が存在しない場合は追加する。

---

## 実装上の注意

- `resolvedMatches[record.candidateIndex]` は `upsertMatches` 戻り値の `candidateIndex` で
  `resolvedMatches` 配列を引く。`results.ts`（L134-L155）と同じパターン。
- `rawHtml` が `""` の場合は `!match.rawHtml` で早期 continue される。
  League One のように Wikipedia ソースを持たない competition では rawHtml が空なので
  このフックは何もしない（冪等）。
- `parseMatchEventsFromVeventHtml(rawHtml)` は vevent 構造がなければ空配列を返す。
  events が空配列なら `upsertMatchEvents` を呼ばない。
- エラーは try/catch でスキップする（live-ingest は複数大会を一括処理するため、
  1 試合のイベント解析失敗で全体をクラッシュさせない）。

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `ingestLiveCompetition` 内に `statusChangedToFinished` フィルタと `upsertMatchEvents` 呼び出しが追加されている
- [ ] `rawHtml` が空の場合は `upsertMatchEvents` を呼ばない
- [ ] try/catch でエラーをスキップしてログ出力する
- [ ] `LiveIngestResult.counts` に `events_inserted` が追加されている

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `lib/ingestion/results.ts` | `statusChangedToFinished` フックの実装例（L134-L155） |
| `lib/ingestion/live-ingest.ts` | 変更対象 |
| `lib/ingestion/events.ts` | `upsertMatchEvents` のインターフェース確認 |
| `lib/scrapers/wikipedia-match-events.ts` | `parseMatchEventsFromVeventHtml` の import 元 |
