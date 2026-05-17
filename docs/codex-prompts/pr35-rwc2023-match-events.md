# feat: RWC 2023 試合イベント取り込み

## 目的

RWC 2023 の各試合に得点経過イベント（トライ・コンバージョン・ペナルティ）を取り込み、
コンテンツ生成パイプライン（`generate-world-rugby-content.ts`）が実行できる状態にする。

現状: `scripts/generate-world-rugby-content.ts --family rwc --season 2023` を実行すると
全 48 試合が `skipped` になる。原因は `match_events` が空であるため
パイプラインの早期リターン条件（`assembled.match_events.length === 0`）に該当するため。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 前提・既存のもの（変更不要）

- `lib/scrapers/wikipedia-rwc-results.ts` — `RwcMatch` 型と `parseRwcHtml`（pr33 で実装済み）
- `lib/ingestion/sources/wikipedia-rwc.ts` — チームスラグマップ（pr33 で実装済み）
- `lib/ingestion/events.ts` — `upsertMatchEvents`
- `lib/scrapers/fetcher.ts` — `fetchWithPolicy`
- `lib/scrapers/wikipedia-match-events.ts` — `parseScoringCell`・`parseMatchEventsFromVeventHtml`
- `scripts/backfill-club-match-details.ts` — 実装パターンの参照元

各 RWC 2023 試合の `matches.external_ids` には以下が格納済み:
```json
{
  "wikipedia_url": "https://en.wikipedia.org/wiki/South_Africa_v_Ireland_(2023_Rugby_World_Cup)",
  "wikipedia_event_id": "South_Africa_v_Ireland"
}
```

`wikipedia_url` が個別試合ページ、`wikipedia_event_id` がそのページ内のアンカー ID。

---

## ステップ 0: 個別試合ページの HTML 構造確認（実装前に必ず実施）

以下のような代表的な RWC 2023 試合ページを `fetchWithPolicy` で取得し、HTML 構造を確認すること:

```
https://en.wikipedia.org/wiki/South_Africa_v_Ireland_(2023_Rugby_World_Cup)
https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_final
```

確認すべき点:
1. **得点セクションの HTML 構造**
   - `div.vevent.summary` 形式か（Six Nations と同じ → `parseMatchEventsFromVeventHtml` が流用できる）
   - テーブル形式か（RC と同様 → pr34 で修正済みの列インデックス方式が必要）
   - スコアリング行の `<b>Try:</b>`, `<b>Con:</b>` ラベルの有無と表記
2. **ホーム・アウェイの判別**
   - 得点セルがどの列に対応するか（スコアの左列=ホーム か否か）
3. **`wikipedia_event_id` の使われ方**
   - ページ内の `#South_Africa_v_Ireland` アンカーがどの要素にあるか
   - `eventId` が null の試合がある場合、フォールバック方法を確認

確認後、下記の「実装ガイドライン」を適宜調整すること。

---

## 1. `lib/scrapers/wikipedia-rwc-match-events.ts` を新規作成

### 基本方針（ステップ 0 の確認後に調整）

個別試合ページの HTML と `eventId` を受け取り、`ParsedMatchEvent[]` を返す関数を実装する。

```ts
import type { WikipediaClubMatchDetails } from "@/lib/scrapers/wikipedia-club-match-details";

export function parseWikipediaRwcMatchEventsHtml(
  html: string,
  source: { eventId: string | null; url: string },
): WikipediaClubMatchDetails

export async function scrapeWikipediaRwcMatchEvents(source: {
  eventId: string | null;
  url: string;
}): Promise<WikipediaClubMatchDetails>
```

`WikipediaClubMatchDetails` を再利用することで `upsertMatchEvents` へそのまま渡せる。
`lineup` フィールドは `null` で構わない（ラインアップは別途取り込み済み、または対象外）。

**vevent 形式だった場合**:
```ts
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

// eventId でページ内の対象ブロックを特定して parseMatchEventsFromVeventHtml に渡す
// （wikipedia-club-match-details.ts の extractEventBlockHtml と同様のロジック）
```

**テーブル形式だった場合**:
```ts
// pr34 で修正済みの列インデックス方式を適用
// SCORE_PATTERN でスコア列を特定 → 左列=ホーム / 右列=アウェイ
```

**両形式が混在する場合**:
vevent ブロックを優先し、なければテーブル方式にフォールバックする。

---

## 2. `scripts/backfill-rwc-match-events.ts` を新規作成

`scripts/backfill-club-match-details.ts` を参考にした構成。

### 引数

```
pnpm tsx scripts/backfill-rwc-match-events.ts [--season <YYYY>] [--force] [--dry-run] [--limit=N]
```

- `--season`: 対象シーズン（省略時は全 RWC を対象）
- `--force`: 既存イベントがあっても上書き再取り込み
- `--dry-run`: DB 書き込みなしで対象件数のみ表示
- `--limit=N`: 処理上限（デフォルト 100）

### 処理フロー

1. `competitions` から `family='rwc'` の competition を取得（`--season` で絞り込み）
2. `matches` を取得（`status='finished'` かつ `match_events` が空のもの、`--force` 時は全件）
3. `external_ids.wikipedia_url` が存在する試合のみ対象
4. 各試合に対して `scrapeWikipediaRwcMatchEvents` を呼び出す
5. `upsertMatchEvents` で DB に保存（既存イベントは自動で DELETE → INSERT）

### 完了時の出力例

```
Found 48 rwc-2023 matches with missing events
[ok] rwc-2023 South Africa v Ireland: events=14
[ok] rwc-2023 France v New Zealand: events=12
...
Backfill complete: matches=48 events_inserted=580 skipped=0 dry_run=false
```

---

## 変更・作成するファイル

| ファイル | 操作 |
|---------|------|
| `lib/scrapers/wikipedia-rwc-match-events.ts` | 新規作成 |
| `scripts/backfill-rwc-match-events.ts` | 新規作成 |

---

## 変更しないこと

- `lib/scrapers/wikipedia-rwc-results.ts`
- `lib/ingestion/events.ts`
- `lib/scrapers/wikipedia-match-events.ts`
- `scripts/generate-world-rugby-content.ts`

---

## テスト

`tests/scrapers/wikipedia-rwc-match-events.test.ts` を作成:

- 正常系: 実際の試合ページ HTML から正しいホーム・アウェイイベントが取得できる
- 正常系: `eventId` が null でもページから得点セクションを見つけられる
- 異常系: 得点セクションがない場合は空配列を返す（エラーを投げない）

実際の Wikipedia HTML を使ったスナップショットテストを強く推奨（`tests/scrapers/` 以下を参照）。

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm test` パス
- `pnpm tsx scripts/backfill-rwc-match-events.ts --season 2023 --dry-run` が 48 件を検出
- `pnpm tsx scripts/backfill-rwc-match-events.ts --season 2023` が完了し、各試合に 5〜20 件程度のイベントが挿入される
- `pnpm tsx scripts/generate-world-rugby-content.ts --family rwc --season 2023 --dry-run` が `generate=48 skipped=0` を表示する

## ブランチ・PR

- ブランチ: `feat/rwc2023-match-events`
- PR タイトル: `Feat: RWC 2023 match events backfill from individual Wikipedia pages`
