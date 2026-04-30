# Codex プロンプト: p1-match-events-ingestion

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-match-events-ingestion.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- `match_events` テーブルは既存だが常に空。今回初めて populate する
- OpenAI SDK は `client.responses.create`（Responses API）を使用していること。Chat Completions ではない

## 実装前に必ず読むファイル

1. `specs/p1-match-events-ingestion.md` — 本仕様書
2. `lib/scrapers/fetcher.ts` — `fetchWithPolicy` のシグネチャ
3. `lib/scrapers/wikipedia-squads.ts` — Wikipedia HTML を cheerio でパースする既存例
4. `lib/ingestion/results.ts` — `ingestSixNations2027Results` の実装（拡張箇所を把握する）
5. `lib/llm/stages/assemble.ts` — `AssembledContentInput` の構築方法と DB クエリパターン
6. `lib/llm/types.ts` — 現行の `AssembledContentInput` 型
7. `lib/llm/prompts/generate-recap.ts` — 現行 `PROMPT_VERSION` を確認する
8. `lib/db/types.ts` — `match_events` テーブルの型

## 要件

### Step 1: `lib/scrapers/wikipedia-match-events.ts`（新規）

```typescript
export type ParsedMatchEvent = {
  type: 'try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card';
  minute: number | null;
  teamSide: 'home' | 'away';
  playerName: string;
  isPenaltyTry: boolean;
};

export async function scrapeMatchEvents(matchUrl: string): Promise<ParsedMatchEvent[]>

export function buildMatchWikipediaUrl(params: {
  year: string;
  homeTeamName: string;
  awayTeamName: string;
}): string
```

- `fetchWithPolicy` を必ず使用（直接 `fetch` 禁止）
- cheerio で infobox の scoring 行をパース（仕様書の Wikipedia infobox 構造を参照）
- 複数 minute（`23', 45'`）は個別イベントに展開する
- `none` / `—` / 空文字は空配列として扱う
- 404 等の場合は `console.warn` を出して空配列を返す（throw しない）
- URL 構築は en-dash（`–`、U+2013）を使用し、`encodeURIComponent` で正しくエンコードする
- DB チーム名 → Wikipedia 正式名マッピング定数を同ファイルで定義する

### Step 2: `lib/ingestion/events.ts`（新規）

```typescript
export async function upsertMatchEvents(params: {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: ParsedMatchEvent[];
}): Promise<{ inserted: number }>
```

- 冪等性: 当該 `match_id` の既存 `match_events` を DELETE してから INSERT
- `player_id`: `players` テーブルを大文字小文字無視の部分一致で検索。一意に特定できない場合は `null`
- `metadata`: `{ player_name: string, is_penalty_try?: boolean }`

### Step 3: `lib/ingestion/results.ts` の拡張

`ingestSixNations2027Results` の末尾で、今回 `finished` に変わった試合について `buildMatchWikipediaUrl` → `scrapeMatchEvents` → `upsertMatchEvents` を呼ぶ。戻り値の `counts.events_inserted` を実際の件数に更新する。

### Step 4: `lib/llm/types.ts` の変更

`AssembledContentInput` に `match_events` フィールドを追加する（仕様書の型定義を参照）。

### Step 5: `lib/llm/stages/assemble.ts` の変更

`finished` 試合のみ DB から `match_events` を取得してセット。`scheduled` 試合は `match_events: []` を返す。

### Step 6: `lib/llm/prompts/generate-recap.ts` の変更

`match_events.length > 0` の場合にスコアリングイベントブロックをプロンプトに追加する（仕様書参照）。空配列の場合は省略する。`PROMPT_VERSION` を `recap@1.3.0` に更新する。

### Step 7: `scripts/backfill-match-events.ts`（新規）

仕様書の CLI 仕様（`--year` / `--dry-run` オプション）を実装する。試合ごとに 1 秒の待機を入れること。

## 注意事項

- `fetchWithPolicy` を必ず使う（直接 `fetch` は使わない）
- 新規 npm パッケージは追加しない
- `generate-preview.ts` は変更しない
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` を書き換えない

## 完了時に必ず報告すること

- `scrapeMatchEvents` を実際の Six Nations 試合 URL で動作確認した結果（取得イベント数）
- `backfill-match-events.ts --dry-run` の出力（対象試合数・想定 events 数）
- `pnpm lint` / `pnpm typecheck` の結果
