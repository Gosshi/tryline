# Top 14 得点経過イベントのバックフィル

## 背景

`match_events` テーブルに Top 14 の得点イベントが一切存在しない。
これにより試合詳細ページの「得点経過」グラフが表示されない。

Premiership では `backfill-premiership-match-events.ts` が機能しているが、
Top 14 の Wikipedia ページは構造が異なるため流用できない。

### Premiership との構造差異

| 項目 | Premiership | Top 14 |
|------|------------|--------|
| vevent の `id` 属性 | あり（例: `e12345`）| なし |
| `wikipedia_event_id` の意味 | vevent 自身の id | 親セクション見出しの id（例: `Round_1`）|
| バックフィルの課題 | なし（id で直接参照可） | sectionId で vevent を特定する別ロジックが必要 |

## スコープ

対象:
- `scripts/backfill-top14-match-events.ts`（新規作成）

対象外:
- URC（Wikipedia がテーブル形式のみで得点詳細なし）

## 事前調査（Codex が実施すること）

実装前に以下を確認すること:

1. Top 14 Wikipedia シーズンページ（例: `https://en.wikipedia.org/wiki/2024%E2%80%9325_Top_14_season`）を
   fetch して、各 vevent ブロック内に try スコアラー・コンバージョン・ペナルティ等の
   **得点詳細が記載されているか** を確認する

2. 得点詳細がある場合: `parseMatchEventsFromVeventHtml` が解析できるか確認する
   （同関数は Premiership vevent HTML を想定しているため、構造が異なれば別パーサーが必要）

3. 得点詳細がない（スコアのみ）場合: このスペックを実装せず、
   このファイルにその旨を追記して終了する

## 実装方針（得点詳細が存在する場合）

### sectionId による vevent 特定アプローチ

```
1. Wikipedia シーズンページを fetch
2. `parseWikipediaSeasonMatches` で全試合の vevent を取得
   → 各試合の `sectionId`（親セクションid）+ チーム名 + 日付 で識別可能
3. DB から Top 14 の finished matches で `wikipedia_event_id` が設定されているものを取得
4. `wikipedia_event_id`（= sectionId）でページ内の vevent を特定し、rawHtml を取得
5. `parseMatchEventsFromVeventHtml(rawHtml)` でイベント抽出
6. `upsertMatchEvents` で保存
```

### ファイル構成

```
scripts/backfill-top14-match-events.ts   ← 新規
```

参照: `scripts/backfill-premiership-match-events.ts`（同様のパターンを踏襲）

### CLI インターフェース

```bash
pnpm tsx scripts/backfill-top14-match-events.ts [--season=2024-25] [--dry-run]
```

## 受け入れ条件

- [ ] 事前調査を実施し、得点詳細の有無をコメントで記録する
- [ ] 得点詳細がある場合: dry-run で対象試合数が 0 より多く表示される
- [ ] 本番実行後、Top 14 の終了済み試合詳細ページで「得点経過」グラフが表示される
- [ ] 得点詳細がない場合: その旨をこのファイルに追記して完了とする
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 注意

`seed-wikipedia-external-ids.ts --family=top-14 --season=2024-25` が実行済みであること。
`external_ids.wikipedia_event_id` が設定されていない試合は対象外。
