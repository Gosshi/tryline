# コアデータモデル（p1-data-model）

## 背景

Tryline は「試合中心のデータモデル」を設計不変条件としています（`CLAUDE.md`、`D004`）。以降の機能仕様書（スクレイパー、コンテンツパイプライン、試合詳細 UI、AI チャット、認証、決済）はすべてこのスキーマの上に載るため、先にテーブル定義・インデックス・RLS を確定する必要があります。

本仕様書は Supabase postgres における全テーブルのマイグレーションを対象とします。LLM 生成物やパイプライン実行ログなど、他仕様書で既に定義されたテーブルはスコープ外です。

## スコープ

対象:
- 基礎マスターテーブル: `competitions`, `teams`, `competition_teams`, `players`
- 試合ハブテーブル: `matches`, `match_raw_data`, `match_events`
- ユーザーテーブル: `users`（Supabase `auth.users` に紐づくプロフィール）, `match_chats`
- 各テーブルの RLS ポリシー
- `updated_at` 自動更新トリガー
- `lib/db/types.ts` の自動生成（`pnpm supabase:types`）

対象外:
- `match_content`, `pipeline_runs`（`p1-content-pipeline.md` で既定義）
- サブスクリプション関連テーブル（Phase 2、`p2-stripe-integration.md`）
- 通知・プッシュ配信テーブル（Phase 2 以降）
- シードデータ投入（`p1-match-ingestion.md` 側でスクレイパーが担う）
- マスターテーブルのシードスクリプト（本 PR では空のスキーマのみ）

## データモデル変更

### 命名規則

- テーブル名: 複数形スネークケース（`competitions`, `match_events`）
- 主キー: `id uuid default gen_random_uuid() primary key`
- タイムスタンプ: `timestamptz`、UTC 保持。JST 変換は UI 層で行う
- 外部 ID: `external_ids jsonb` に `{ "source": "id", ... }` 形式で格納（柔軟性のため）
- enum 値は `text` + `check` 制約で管理（Supabase CLI との相性優先）

### 1. `competitions`

リーグ・トーナメントのマスター。

```sql
create table competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                 -- 'six-nations-2027'
  name text not null,                        -- 'Six Nations 2027'
  country text,                              -- 統括団体の国コード（任意）
  season text not null,                      -- '2026'
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2. `teams`

代表・クラブチーム。

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                 -- 'all-blacks'
  name text not null,                        -- 'All Blacks'
  short_code text,                           -- 'NZL'
  country text not null,                     -- 国コード（ISO-3166 alpha-3）
  logo_url text,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3. `competition_teams`（多対多）

```sql
create table competition_teams (
  competition_id uuid not null references competitions on delete cascade,
  team_id uuid not null references teams on delete cascade,
  primary key (competition_id, team_id)
);
```

### 4. `players`

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  name text not null,
  position text,                             -- 'prop', 'fly-half' 等
  date_of_birth date,
  caps integer,                              -- 代表キャップ数
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);
```

同姓同名やチーム移籍への対応は MVP では行わない。

### 5. `matches`（ハブ）

```sql
create table matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions,
  home_team_id uuid not null references teams,
  away_team_id uuid not null references teams,
  kickoff_at timestamptz not null,           -- UTC
  venue text,
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','finished','postponed','cancelled')),
  home_score integer,
  away_score integer,
  broadcast_jp_url text,                     -- DAZN / J SPORTS / WOWOW リンク
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, home_team_id, away_team_id, kickoff_at),
  check (home_team_id <> away_team_id)
);
```

### 6. `match_raw_data`（短期保持）

スクレイプした生テキスト。`docs/architecture.md` に従い 7 日で削除する。

```sql
create table match_raw_data (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches on delete cascade,
  source text not null,                      -- 'rugbypass' | 'espn' | 'reddit' | ...
  source_url text not null,
  payload jsonb not null,                    -- 取得した HTML または JSON をそのまま
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
```

### 7. `match_events`

```sql
create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches on delete cascade,
  minute integer not null,                   -- 0-80+ (延長は 80 超の値で表現)
  type text not null
    check (type in ('try','conversion','penalty_goal','drop_goal','yellow_card','red_card','substitution')),
  team_id uuid not null references teams,
  player_id uuid references players,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

### 8. `users`（アプリプロフィール）

Supabase `auth.users` と 1:1 で紐づくアプリ側のプロフィール。`auth.users` は書き換えない。

```sql
create table users (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text,
  plan text not null default 'free'
    check (plan in ('free','premium')),
  stripe_customer_id text,                   -- Phase 2 で利用
  interests jsonb not null default '{}'::jsonb,
  -- 例: { "teams": ["all-blacks"], "tactics": ["breakdown","lineout"] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 9. `match_chats`

```sql
create table match_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  match_id uuid not null references matches on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  -- [{ "role": "user" | "assistant", "content": "...", "at": "iso8601" }, ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);
```

### インデックス

```sql
create index matches_kickoff_idx on matches (kickoff_at);
create index matches_competition_kickoff_idx on matches (competition_id, kickoff_at);
create index matches_status_idx on matches (status);

create index players_team_idx on players (team_id);

create index match_raw_data_match_idx on match_raw_data (match_id, source);
create index match_raw_data_expires_idx on match_raw_data (expires_at);

create index match_events_match_idx on match_events (match_id, minute);

create index match_chats_user_match_idx on match_chats (user_id, match_id);
```

### `updated_at` 自動更新

`updated_at` を持つ全テーブルに以下のトリガーを貼る。

```sql
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 各テーブルに: create trigger ... before update on <table> for each row execute function set_updated_at();
```

## RLS ポリシー

`CLAUDE.md` に従い、RLS はセキュリティの主要境界。全テーブルで `enable row level security` を行う。

### 公開読み取り（マスター系）

- `competitions`, `teams`, `competition_teams`, `players`, `matches`, `match_events`: 認証なしでも `select` を許可（プレビューページの SEO のため）
- 書き込みは service role のみ（RLS で遮断）

### 非公開（raw データ）

- `match_raw_data`: `select/insert/update/delete` すべて service role のみ。anon/authenticated 共に不可

### ユーザースコープ

- `users`: 自分の行のみ `select/update` 可能（`auth.uid() = id`）。`insert` は auth トリガー（下記）で実施、クライアントから直接 `insert` しない
- `match_chats`: 自分の `user_id` の行のみ `select/insert/update/delete` 可能

### auth トリガー

Supabase の `auth.users` に新規行が入った際に `users` を作成する:

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

## マイグレーションファイル構成

`supabase/migrations/` 配下に以下の順序でファイルを作成する。タイムスタンプは `supabase migration new` が生成するものに従う。

1. `<ts>_create_core_tables.sql` — competitions / teams / competition_teams / players
2. `<ts>_create_match_tables.sql` — matches / match_raw_data / match_events
3. `<ts>_create_user_tables.sql` — users / match_chats + auth トリガー
4. `<ts>_create_indexes.sql` — 上記のインデックス
5. `<ts>_create_rls_policies.sql` — 全テーブルの RLS 有効化とポリシー
6. `<ts>_create_updated_at_trigger.sql` — `set_updated_at` 関数と各テーブルへのトリガー

ファイルを分割する理由はレビュー時の可読性。Codex が必要に応じて統合しても可だが、ファイル数は 10 以内に収める。

## API サーフェス

本仕様書では API ルートは追加しない。既存 `/api/health` の Supabase チェックが、認証なしで `competitions` テーブルに `select count(*)` できることを確認する形に更新する（テーブルが存在することの疎通確認）。

## UI サーフェス

なし。UI は `p1-match-detail-page.md`（後続）で定義する。

## LLM 連携

なし。本仕様書はスキーマ定義のみ。LLM は `p1-content-pipeline.md` が利用する。

## 型の自動生成

マイグレーション適用後、Codex が以下を実行して `lib/db/types.ts` を更新する:

```bash
pnpm supabase:types
```

生成された型はコミットする（`p0-foundation.md` の決定事項）。

## 受け入れ条件

- [ ] `pnpm supabase start` の初期化後、`pnpm supabase db reset` でマイグレーションが全て成功する
- [ ] 上記 9 テーブルと `p1-content-pipeline.md` の 2 テーブルが共存して作成できる（本 PR は前者のみ、後者は後続 PR で）
- [ ] 全テーブルで RLS が有効になっている（`pg_tables` で `rowsecurity = true` を確認）
- [ ] 匿名クライアントで `competitions` / `teams` / `matches` / `match_events` を `select` できる
- [ ] 匿名クライアントで `match_raw_data` / `users` / `match_chats` を `select` すると 0 行または権限エラー
- [ ] 認証済みクライアントが自分以外の `match_chats` を `select` しても 0 行が返る
- [ ] `auth.users` に新規ユーザーが insert されると `public.users` に対応行が自動生成される
- [ ] `updated_at` が update 時に自動更新される（少なくとも `matches` と `users` でテスト）
- [ ] `home_team_id = away_team_id` の `matches` 行は `check` 制約で拒否される
- [ ] `match_raw_data.expires_at` は insert 時に `now() + 7 days` が自動設定される
- [ ] `lib/db/types.ts` が再生成され、新規テーブルの型が含まれている
- [ ] `/api/health` が Supabase チェックとして `competitions` の count を取得し、成功時 `ok` を返す
- [ ] マイグレーションのテスト（`tests/db/` 配下に最低 3 本）:
  - RLS: 匿名で `match_chats` が読めないこと
  - 制約: `home_team_id = away_team_id` 拒否
  - トリガー: `auth.users` → `users` 自動生成

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
