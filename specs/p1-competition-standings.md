# 大会順位表取り込み（p1-competition-standings）

## 背景

現在のコンテキストには「この試合に勝てば単独首位」「Grand Slam 達成条件」といった大会文脈が一切ない。Wikipedia の Six Nations ページには順位表（試合数・勝敗・得失点・ボーナスポイント・合計勝点）が掲載されており、これを DB に持たせてアセンブル段階で LLM に渡すことで、試合の意味（順位争い・Grand Slam・木のスプーン回避等）を語れるようになる。

## スコープ

**対象:**
- `supabase/migrations/` — `competition_standings` テーブル追加のマイグレーション（新規）
- `lib/scrapers/wikipedia-standings.ts` — 順位表スクレイパー（新規）
- `lib/ingestion/standings.ts` — competition_standings upsert ロジック（新規）
- `lib/ingestion/fixtures.ts` — `ingestSixNations2027Fixtures` 末尾で standings 取り込みを追加
- `lib/llm/stages/assemble.ts` — `competition_standings` をコンテキストに追加
- `lib/llm/types.ts` — `AssembledContentInput` に `competition_standings` フィールド追加
- `lib/llm/prompts/generate-preview.ts` — standings を使うよう更新（PROMPT_VERSION: `preview@1.3.0`）
- `lib/llm/prompts/generate-recap.ts` — standings を使うよう更新（PROMPT_VERSION: Codex が実装前に現行値を確認し +0.1.0 する）
- `lib/db/types.ts` — `pnpm supabase:types` で再生成

**対象外:**
- 2027 以外のリーグの standings
- 過去年度（2020〜2026）の standings 取り込み（h2h / recent_form への影響はなく不要）
- 管理 UI・手動編集フロー

## データモデル変更

### 新規テーブル: `competition_standings`

```sql
create table competition_standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions not null,
  team_id uuid references teams not null,
  position integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  tries_for integer not null default 0,
  bonus_points_try integer not null default 0,
  bonus_points_losing integer not null default 0,
  total_points integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (competition_id, team_id)
);

create index on competition_standings (competition_id, position);
```

Six Nations のボーナスポイント制:
- `bonus_points_try`: 1 試合で 4 トライ以上を獲得した場合に +1
- `bonus_points_losing`: 7 点差以内で負けた場合に +1

### RLS

`competition_standings` は全ユーザー SELECT 可（public read）。INSERT / UPDATE / DELETE は service role のみ。

## Wikipedia 順位表の構造

Six Nations Wikipedia ページの順位表は以下の形式の wikitable:

```
| Pos | Team     | Pld | W | D | L | PF  | PA  | +/- | Try BP | LBP | Pts |
|-----|----------|-----|---|---|---|-----|-----|-----|--------|-----|-----|
|  1  | Ireland  |  3  | 3 | 0 | 0 | 72  | 31  | +41 |   2    |  0  | 14  |
```

- `Pld` = played, `PF` = points for, `PA` = points against
- `Try BP` = bonus point for 4+ tries（`bonus_points_try`）
- `LBP` = losing bonus point（`bonus_points_losing`）
- `Pts` = total points

大会開幕前（`played=0`）は全行ゼロになる。その場合は upsert を実行してよい（0 で埋める）。「TBD」等の非数値が含まれる場合は `console.warn` を出してスキップ。

## 実装詳細

### `lib/scrapers/wikipedia-standings.ts`

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
- cheerio で `table.wikitable` を検索し、ヘッダ行から列インデックスを動的に解決する（固定インデックスを使わない）
- `tries_for` 列が存在しない場合は `0` を設定（壊れない）
- 6 チーム分のデータが取得できない場合は `console.warn` を出し取得できた分だけ返す

### `lib/ingestion/standings.ts`

```typescript
export async function upsertCompetitionStandings(params: {
  competitionId: string;
  rows: ParsedStandingsRow[];
  teamLookup: Record<string, string>;
}): Promise<{ upserted: number }>
```

- upsert キー: `(competition_id, team_id)`
- `updated_at` を現在時刻で更新
- `teamLookup` に存在しないチーム名があれば `console.warn` してスキップ

### `lib/ingestion/fixtures.ts` の拡張

`ingestSixNations2027Fixtures` の末尾で `scrapeCompetitionStandings` → `upsertCompetitionStandings` を呼ぶ。同じ Wikipedia ページを再利用するため追加 fetch は最小限（HTML を渡す形でリファクタリングするか、同 URL に再 fetch する）。戻り値に `standings_upserted: number` を追加する。

### `lib/llm/types.ts` の変更

`AssembledContentInput` に以下を追加:

```typescript
competition_standings: Array<{
  position: number;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points_for: number;
  points_against: number;
  tries_for: number;
  bonus_points_try: number;
  bonus_points_losing: number;
  total_points: number;
}>;
```

### `lib/llm/stages/assemble.ts` の変更

`competition_id` で `competition_standings` を取得し、`position` 昇順でソートしてセットする。データが存在しない場合は `competition_standings: []` を返す。

### `lib/llm/prompts/generate-preview.ts` / `generate-recap.ts` の変更

`competition_standings.length > 0` の場合に以下ブロックをプロンプトに追加:

```
現在の大会順位表（この試合前時点）:
${JSON.stringify(assembled.competition_standings)}
順位争い・Grand Slam・木のスプーン等の大会文脈をプレビュー/レビューに組み込むこと。
```

`competition_standings` が空配列の場合はこのブロックを省略する（プロンプトが壊れないこと）。

PROMPT_VERSION:
- `generate-preview.ts`: `preview@1.3.0`
- `generate-recap.ts`: Codex が実装前に現行の `PROMPT_VERSION` 定数を確認し、マイナーバージョンを +0.1.0 して設定すること

## API サーフェス

変更なし（内部処理のみ）。

## UI サーフェス

変更なし。順位表の直接表示はしない。LLM が生成したプレビュー・レビュー本文の中で大会文脈として語られる形になる。

## LLM 連携

- アセンブル段階（段階 1）に competition_standings の DB クエリを追加
- ナラティブ生成（段階 3）の preview・recap プロンプトが standings を参照
- PROMPT_VERSION: `preview@1.3.0` / recap は現行値 +0.1.0

## 受け入れ条件

- [ ] `competition_standings` テーブルが作成されており `unique (competition_id, team_id)` 制約が効いている
- [ ] RLS で public ユーザーは SELECT のみ可能
- [ ] `ingestSixNations2027Fixtures` 実行後に 6 チーム分の standings レコードが存在する
- [ ] `upsertCompetitionStandings` が 2 回実行しても重複しない（冪等）
- [ ] 大会開幕前（played=0）でも壊れずにゼロ値で upsert できる
- [ ] `assembleMatchContentInput` が `competition_standings` を返す
- [ ] `competition_standings` が空の場合でもプロンプトが壊れない
- [ ] preview 生成の本文に順位・勝点・Grand Slam 等の大会文脈が含まれる
- [ ] `pnpm lint` / `pnpm typecheck` が通る

## 未解決の質問

現時点なし。
