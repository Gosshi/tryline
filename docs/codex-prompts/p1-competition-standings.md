# Codex プロンプト: p1-competition-standings

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-competition-standings.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- OpenAI SDK は `client.responses.create`（Responses API）を使用していること。Chat Completions ではない
- `competition_standings` テーブルは新規作成が必要（既存テーブルなし）

## 実装前に必ず読むファイル

1. `specs/p1-competition-standings.md` — 本仕様書
2. `lib/scrapers/fetcher.ts` — `fetchWithPolicy` のシグネチャ
3. `lib/scrapers/wikipedia-squads.ts` — Wikipedia HTML を cheerio でパースする既存例
4. `lib/ingestion/fixtures.ts` — `ingestSixNations2027Fixtures` の実装（拡張箇所を把握する）
5. `lib/llm/stages/assemble.ts` — `AssembledContentInput` の構築方法と DB クエリパターン
6. `lib/llm/types.ts` — 現行の `AssembledContentInput` 型
7. `lib/llm/prompts/generate-preview.ts` — 現行 `PROMPT_VERSION` を確認する
8. `lib/llm/prompts/generate-recap.ts` — 現行 `PROMPT_VERSION` を確認する
9. `supabase/migrations/` — 既存マイグレーションのタイムスタンプ命名規則を確認する

## 要件

### Step 1: マイグレーション作成

`supabase/migrations/` に新規マイグレーションファイルを作成する（既存ファイルの命名規則に従う）。内容は仕様書の SQL を参照。RLS・インデックスも同じファイルに含める。

### Step 2: `lib/scrapers/wikipedia-standings.ts`（新規）

```typescript
export type ParsedStandingsRow = {
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  bonusPointsTry: number;
  bonusPointsLosing: number;
  totalPoints: number;
};

export async function scrapeCompetitionStandings(
  pageUrl: string
): Promise<ParsedStandingsRow[]>
```

- `fetchWithPolicy` を必ず使用（直接 `fetch` 禁止）
- cheerio で `table.wikitable` を検索し、ヘッダ行から列インデックスを**動的に**解決する（固定インデックスを使わない）
- `tries_for` 列が存在しない場合は `0` を設定する
- 6 チーム分が取得できない場合は `console.warn` を出し取得できた分だけ返す

### Step 3: `lib/ingestion/standings.ts`（新規）

```typescript
export async function upsertCompetitionStandings(params: {
  competitionId: string;
  rows: ParsedStandingsRow[];
  teamLookup: Record<string, string>;
}): Promise<{ upserted: number }>
```

upsert キー: `(competition_id, team_id)`。`updated_at` を現在時刻で更新。`teamLookup` に存在しないチーム名は `console.warn` してスキップ。

### Step 4: `lib/ingestion/fixtures.ts` の拡張

`ingestSixNations2027Fixtures` の末尾で standings を取り込む。同じ Wikipedia ページを再利用し追加 fetch を最小限にする。戻り値に `standings_upserted: number` を追加する。

### Step 5: `lib/llm/types.ts` の変更

`AssembledContentInput` に `competition_standings` フィールドを追加する（仕様書の型定義を参照）。

### Step 6: `lib/llm/stages/assemble.ts` の変更

`competition_id` で `competition_standings` を取得し `position` 昇順でセットする。データがない場合は `[]` を返す。

### Step 7: プロンプト更新

- `generate-preview.ts`: standings ブロックを追加。`PROMPT_VERSION` を `preview@1.3.0` に更新する
- `generate-recap.ts`: standings ブロックを追加。現行 `PROMPT_VERSION` を確認してマイナーバージョンを +0.1.0 する
- いずれも `competition_standings` が空配列の場合はブロックを省略する（壊れない）

### Step 8: 型ファイル再生成

```
pnpm supabase:types
```

を実行して `lib/db/types.ts` を更新する。

## 注意事項

- `fetchWithPolicy` を必ず使う（直接 `fetch` は使わない）
- 新規 npm パッケージは追加しない
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` を書き換えない

## 完了時に必ず報告すること

- `scrapeCompetitionStandings` を実際に実行した結果（何チーム分取得できたか）
- `ingestSixNations2027Fixtures` 実行後に `competition_standings` に 6 件存在するか
- `pnpm lint` / `pnpm typecheck` の結果
