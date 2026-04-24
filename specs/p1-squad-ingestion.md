# スカッド取り込み（p1-squad-ingestion）

## 背景

`lib/llm/stages/assemble.ts` はコンテンツパイプラインの入力を組み立てるが、現状 `projected_lineups` と `injuries` は空配列のまま LLM に渡されている。Six Nations は固定メンバー傾向があるとはいえ毎年スカッド入れ替えがあり、LLM が古い知識でラインアップを書くとプレビュー品質が致命的に低下する。

本仕様書は以下の 2 つを担う:

1. **スカッド取り込み**: Wikipedia から 6 チームの選手情報を取得し `players` テーブルを埋める
2. **ラインアップ取り込み**: 試合 T-48h に公式ラインアップ（Starting XV + ベンチ）を `match_lineups` テーブルへ保存し、`assemble.ts` が `projected_lineups` を実データで埋められるようにする

故障情報（`injuries`）は Phase 1 では取り込まない（D010 準拠）。

## スコープ

**対象:**
- `lib/scrapers/wikipedia-squads.ts` — スカッドページのパーサー
- `lib/scrapers/wikipedia-lineups.ts` — 試合ラインアップページのパーサー
- `app/api/cron/ingest-squads/route.ts` — スカッド upsert エンドポイント
- `app/api/cron/ingest-lineups/route.ts` — ラインアップ upsert エンドポイント
- マイグレーション: `match_lineups` テーブル追加・RLS
- `lib/llm/types.ts`: `projected_lineups` の型を強化
- `lib/llm/stages/assemble.ts`: `match_lineups` を参照するよう更新
- 既存プロンプト・テストのモック更新（型変更追随）

**対象外:**
- 故障情報の取り込み（`injuries: { home: [], away: [] }` は継続）
- LLM プロンプトへの「故障情報は言及しない」指示追加（別タスク）
- B2: 過去大会データ取り込み
- C1: Vercel Cron スケジューリング（本仕様書では API エンドポイントのみ定義）
- 各協会公式サイトのスクレイプ（Phase 2）
- ESPN Scrum 連携（Phase 2）

## データモデル変更

### `players` テーブル（スキーマ変更なし）

既存の `(team_id, name)` unique 制約で upsert できる。`external_ids` カラムに Wikipedia の記事タイトルを格納する:

```json
{ "wikipedia_title": "Henry Slade" }
```

### 新規: `match_lineups` テーブル

```sql
create table public.match_lineups (
  id            uuid       primary key default gen_random_uuid(),
  match_id      uuid       not null references public.matches on delete cascade,
  team_id       uuid       not null references public.teams,
  player_id     uuid       not null references public.players,
  jersey_number smallint   not null check (jersey_number between 1 and 23),
  is_starter    boolean    not null generated always as (jersey_number <= 15) stored,
  announced_at  timestamptz,
  source_url    text       not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (match_id, team_id, jersey_number)
);
```

**RLS:**
```sql
alter table public.match_lineups enable row level security;

create policy "match lineups are publicly readable"
  on public.match_lineups
  for select
  to anon, authenticated
  using (true);
```

書き込みは service_role のみ（RLS デフォルトで拒否）。

### `lib/llm/types.ts` の型変更

`AssembledContentInput.projected_lineups` を以下に変更する:

```typescript
projected_lineups: {
  home: Array<{
    name: string;
    position: string | null;
    jersey_number: number | null;  // match_lineups から取得時は 1-23、スカッドフォールバック時は null
    is_starter: boolean | null;    // match_lineups から取得時は true/false、フォールバック時は null
  }>;
  away: Array<{
    name: string;
    position: string | null;
    jersey_number: number | null;
    is_starter: boolean | null;
  }>;
};
```

## スクレイパー

### `lib/scrapers/wikipedia-squads.ts`

```typescript
export type WikipediaSquadPlayer = {
  team_slug: string;      // "england" | "france" | "ireland" | "scotland" | "wales" | "italy"
  name: string;
  position: string | null;
  caps: number | null;
  date_of_birth: string | null;  // ISO 8601 ("1998-03-15")
};

export async function scrapeSquads(pageUrl: string): Promise<WikipediaSquadPlayer[]>
```

- `pageUrl` は環境変数 `WIKIPEDIA_SQUAD_URL` から注入する（デフォルト値は設けない。未設定なら起動エラー）
- `fetchWithPolicy` を使用（`lib/scrapers` 経由。robots.txt + レート制限 + リトライ自動適用）
- `User-Agent`: 環境変数 `SCRAPER_USER_AGENT`
- `cheerio` で `.wikitable` の各行をパース。ヘッダー行はスキップ
- チームごとのスカッドテーブルが並ぶ構造を想定（Wikipedia の Six Nations ページ標準レイアウト）
- テーブルが見つからない場合（ページ未作成 / 構造変更）は空配列を返す。例外は投げない
- 同一選手の重複行（ポジション別複数表記等）は `name` で dedup する
- テスト用に 2025 六カ国対抗のページ URL を fixture として使用可（`WIKIPEDIA_SQUAD_URL` で差し替え）

### `lib/scrapers/wikipedia-lineups.ts`

```typescript
export type WikipediaLineupPlayer = {
  jersey_number: number;  // 1-23
  name: string;
};

export type WikipediaMatchLineup = {
  home_players: WikipediaLineupPlayer[];
  away_players: WikipediaLineupPlayer[];
  source_url: string;
  announced_at: string;  // ISO 8601。Wikipedia の更新日時が不明な場合はスクレイプ実行時刻
};

export async function scrapeMatchLineup(matchPageUrl: string): Promise<WikipediaMatchLineup | null>
```

- `matchPageUrl` は `matches.external_ids.wikipedia_url` から取得する
- ラインアップセクションが存在しない場合は `null` を返す（エラーにしない）
- ラインアップは 23 人未満でも受け入れる（未発表の枠がある場合を想定）

## API サーフェス

### `POST /api/cron/ingest-squads`

**用途**: 環境変数 `WIKIPEDIA_SQUAD_URL` のページを取得し `players` テーブルを upsert する。

**認証**: `Authorization: Bearer ${CRON_SECRET}` ヘッダー検証（既存 cron ルートと同方式）

**処理フロー**:
1. `scrapeSquads(process.env.WIKIPEDIA_SQUAD_URL)` を呼び出す
2. `teams` テーブルから `slug` でチームを検索
3. `players` へ `(team_id, name)` キーで upsert（`position`, `caps`, `date_of_birth`, `updated_at` を上書き）
4. `scrapeSquads` が空配列を返した場合（Wikipedia ページ未作成）は upsert をスキップし 200 を返す

**レスポンス**:
```json
{ "upserted": 138, "skipped_teams": [], "no_data": false }
```

**エラーレスポンス**: スクレイプ失敗時は 500。チームが `teams` テーブルに存在しない場合はそのチームをスキップしログに記録する（処理は継続）。

---

### `POST /api/cron/ingest-lineups`

**用途**: 指定試合の Wikipedia ラインアップページを取得し `match_lineups` を upsert する。

**クエリパラメータ**: `match_id` (UUID、必須)

**認証**: `Authorization: Bearer ${CRON_SECRET}` ヘッダー検証

**処理フロー**:
1. `matches.external_ids.wikipedia_url` を取得
2. `external_ids.wikipedia_url` が未設定なら 400 を返す
3. `scrapeMatchLineup(url)` を呼び出す
4. `null` が返った場合（ラインアップ未発表）は 200 + `{ announced: false }` を返す
5. 選手名を `players` テーブルで検索（`team_id + name` で照合）
6. `players` に存在しない選手（緊急招集等）は `players` に insert してから `match_lineups` に upsert
7. `match_lineups` へ `(match_id, team_id, jersey_number)` キーで upsert

**レスポンス**:
```json
{ "announced": true, "home_count": 23, "away_count": 22 }
```

## `assemble.ts` の変更

`projected_lineups` の組み立てロジックを以下の優先順位で実装する:

**フェーズ 1: `match_lineups` にデータあり（公式ラインアップ）**
- `match_lineups` を `match_id` + `team_id` でクエリし、`player` を JOIN
- `jersey_number` 昇順でソート
- `{ name, position, jersey_number, is_starter }` を返す

**フェーズ 2: `match_lineups` が空（スカッドフォールバック）**
- `players` テーブルを `team_id` でクエリ
- `{ name, position, jersey_number: null, is_starter: null }` を返す
- `caps` 降順でソート（経験豊富な選手を上位に）

**フェーズ 3: `players` も空**
- 空配列を返す（現状維持）

## LLM 連携

パイプラインの **段階 1（集約 / assemble）** のみ影響する。`projected_lineups` の型変更により `assemble.ts` が返すオブジェクトが変わり、それを受け取る段階 2〜4 のプロンプトが自動的に充実する。プロンプトテンプレート自体（`lib/llm/prompts/`）の修正は不要だが、Codex はテスト内のモックを新しい型に合わせて更新すること。

使用モデル: なし（本仕様書は LLM 呼び出しを追加しない）

## 受け入れ条件

- [ ] `POST /api/cron/ingest-squads` を実行すると `players` テーブルに 6 チーム全選手が upsert される（Wikipedia ページが存在する場合）
- [ ] Wikipedia ページが存在しない / ラインアップセクションがない場合、両スクレイパーはエラーを投げず空配列または `null` を返す
- [ ] `POST /api/cron/ingest-lineups?match_id=<uuid>` を実行すると `match_lineups` が upsert される（`announced_at` 含む）
- [ ] `players` に存在しない選手が `ingest-lineups` で登場した場合、自動的に `players` へ insert される（エラーにならない）
- [ ] `assemble.ts` は `match_lineups` にデータがある試合では `projected_lineups` に jersey_number と is_starter を含む配列を返す
- [ ] `match_lineups` が空の試合では `players` テーブルのスカッドデータへフォールバックする（`jersey_number: null`, `is_starter: null`）
- [ ] `players` も空の場合のみ `projected_lineups` が空配列になる
- [ ] `match_lineups` の RLS: anon + authenticated で select 可、write は service_role のみ
- [ ] `pnpm typecheck` が通る（`AssembledContentInput` 型変更に追随したモック更新を含む）
- [ ] `pnpm test` が全グリーン（パイプライン 6 本 + コンテンツ表示 5 本 + 本仕様書の新規テスト）
- [ ] 実ネットワークを叩くテストを含めない（Wikipedia スクレイパーは全てモック）
- [ ] 両 cron エンドポイントで `CRON_SECRET` 認証が機能する

## 決定事項

1. **テスト用 Wikipedia URL**: `WIKIPEDIA_SQUAD_URL` の開発・テスト時のデフォルト値として、既存の 2025 Six Nations スカッドページ URL を使用する。Codex は `.env.example` にコメント付きで記載すること。

2. **`matches.external_ids.wikipedia_url` の設定方法**: Owner が Supabase Studio で手動入力する。Wikipedia の試合ページ URL はパターンが規則的（`https://en.wikipedia.org/wiki/2027_Six_Nations_Championship_–_[HomeTeam]_v_[AwayTeam]`）なため、15 試合分を試合ページ作成後に一括入力する運用とする。Codex は URL が未設定の場合に 400 を返し、運用手順を `docs/runbooks/` に別途記載する（C1 仕様書策定時）。

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
