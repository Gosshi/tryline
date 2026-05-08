# fix-world-rugby-duplicate-upsert: lineup/events の重複 upsert エラー修正

## 背景

`import-world-rugby-full.ts` で `match_lineups` または `match_events` を一括 upsert する際、
同一試合内に重複エントリが存在すると以下のエラーが発生する:

```
ON CONFLICT DO UPDATE command cannot affect row a second time
```

Supabase の upsert は同一バッチ内に同じ主キーの行が2件以上あると失敗する。

## 変更内容: `scripts/import-world-rugby-full.ts`

`match_lineups` を upsert する直前に重複排除を追加する:

```typescript
// jersey_number + team_side をキーに最初の1件を残す
const dedupedLineups = Array.from(
  new Map(
    lineups.map((row) => [
      `${row.match_id}-${row.team_side}-${row.jersey_number}`,
      row,
    ])
  ).values()
);
```

`match_events` も同様に重複排除する:

```typescript
// minute + type + player_name + team_id をキーに最初の1件を残す
const dedupedEvents = Array.from(
  new Map(
    events.map((row) => [
      `${row.match_id}-${row.minute ?? "null"}-${row.type}-${row.player_name}-${row.team_id}`,
      row,
    ])
  ).values()
);
```

upsert 呼び出しは `lineups` → `dedupedLineups`、`events` → `dedupedEvents` に置き換えること。

## 完了条件

- `pnpm tsc --noEmit` パス
- `import-world-rugby-historical.ts` を実行して `ON CONFLICT DO UPDATE` エラーが出ない
- autumn-nations/2021 が正常にインポートされる

## ブランチ・PR

- ブランチ: `fix/world-rugby-duplicate-upsert`
- PR タイトル: `Fix: deduplicate lineups/events before upsert in World Rugby import`
