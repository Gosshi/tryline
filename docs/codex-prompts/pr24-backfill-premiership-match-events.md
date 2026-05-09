# feat: Premiership の match_events バックフィルスクリプト

## 背景

`backfill-match-events.ts` は Six Nations 専用（`slug like 'six-nations-%'`）。

Premiership の Wikipedia シーズンページ（例: `2025–26_Premiership_Rugby`）には
`div.vevent.summary` 構造が80件以上存在し、トライスコアラー・コンバージョン・ペナルティ・カード情報が含まれる。

これらを `match_events` テーブルに取り込み、AI レビューの選手名言及を改善する。

データソースは Wikipedia のみ。公式サイトのクロールは不可。

---

## 作成するファイル

### `scripts/backfill-premiership-match-events.ts`

#### 引数

| 引数 | 必須 | 説明 |
|------|------|------|
| `--season=<YYYY-YY>` | 任意 | 対象シーズン（例: `2025-26`）。省略時は全 premiership シーズン |
| `--dry-run` | 任意 | DB 書き込みなしで対象件数のみ表示 |

#### 処理フロー

1. `competitions` テーブルから `slug like 'premiership-%'` を取得（`--season` 指定時はさらに絞る）
2. 各 competition に対して以下を実行：
   a. `parsePremiershipLiveHtml` を使って Wikipedia シーズンページを fetch・パース
      - URL は `competition.slug` から変換: `premiership-2025-26` → `https://en.wikipedia.org/wiki/2025–26_Premiership_Rugby`（`–` は en-dash `–`）
      - インポート元: `@/lib/ingestion/sources/wikipedia-premiership`
   b. パース結果（`ParsedLiveMatch[]`）から `eventId` と `rawHtml` のマップを構築
      - キー: `eventId`（DB の `external_ids.wikipedia_event_id` と一致する値）
3. `matches` テーブルから対象 competition の `status='finished'` かつ `match_events` が0件の試合を取得
   - `external_ids->>'wikipedia_event_id'` も取得する
4. 各 match について：
   a. `external_ids.wikipedia_event_id` でパース済みマップを検索して `rawHtml` を取得
   b. `parseMatchEventsFromVeventHtml(rawHtml)` でイベントを抽出
      - インポート元: `@/lib/scrapers/wikipedia-match-events`
   c. 取得した `ParsedMatchEvent[]` を `match_events` テーブルに upsert

#### DB への書き込み

`match_events` テーブルへの upsert:
```typescript
{
  match_id: string,        // matches.id
  team_id: string,         // home or away team_id（ParsedMatchEvent.side から判断）
  player_id: string | null, // players テーブルの id（team_id + name で検索。なければ null）
  event_type: string,      // "try" | "conversion" | "penalty" | "yellow_card" | "red_card"
  minute: number | null,   // 分（不明の場合 null）
  source_url: string,      // Wikipedia シーズンページ URL
}
```

`player_id` の解決:
- `ParsedMatchEvent.playerName` を使って `players` テーブルを `team_id` + `name` で検索
- 存在しなければ `null`（player を新規作成しない）

upsert の conflict キーは `(match_id, team_id, event_type, minute)`。

#### slug → Wikipedia URL 変換関数

```typescript
function buildWikipediaUrl(slug: string): string {
  // "premiership-2025-26" → "https://en.wikipedia.org/wiki/2025–26_Premiership_Rugby"
  const season = slug.replace("premiership-", ""); // "2025-26"
  const [startYear, endYY] = season.split("-");
  return `https://en.wikipedia.org/wiki/${startYear}–26_Premiership_Rugby`;
}
```

#### 実装上の注意

- `fetchWithPolicy` で URL を fetch し、取得した HTML を `parsePremiershipLiveHtml(html)` に渡す
- `match_events` が既に存在する試合はスキップ（冪等）
- レート制限: competition 間は 1 秒 sleep
- エラーが発生した試合はスキップしてログ出力し、次に進む
- 並列処理は**しない**（順次処理）

---

## 参照すべき既存コード

| ファイル | 参照目的 |
|---------|---------|
| `scripts/backfill-match-events.ts` | Six Nations 版の全体構造・DB クエリパターン |
| `lib/ingestion/sources/wikipedia-premiership.ts` | `parsePremiershipLiveHtml` の import 元 |
| `lib/scrapers/wikipedia-match-events.ts` | `parseMatchEventsFromVeventHtml` の import 元 |
| `lib/scrapers/fetcher.ts` | `fetchWithPolicy` |

---

## 実行例

```bash
# dry-run で確認
set -a; source .env.production.local; set +a; \
  pnpm tsx scripts/backfill-premiership-match-events.ts --season=2025-26 --dry-run

# 実行
set -a; source .env.production.local; set +a; \
  pnpm tsx scripts/backfill-premiership-match-events.ts --season=2025-26
```

---

## 変更しないこと

- `scripts/backfill-match-events.ts`（Six Nations 版）
- `lib/ingestion/sources/wikipedia-premiership.ts`
- `lib/scrapers/wikipedia-match-events.ts`

---

## 完了条件

- [ ] `--dry-run` で対象試合数が表示される
- [ ] 実行後に Premiership 2025-26 の試合で `match_events` レコードが存在する
- [ ] `match_events.event_type` が `try` / `conversion` / `penalty` / `yellow_card` / `red_card` のいずれか
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
