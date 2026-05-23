# Codex 指示書: RWC 2027 先行準備

仕様書: `specs/p3-rwc-2027-prep.md`

## タスク概要

RWC 2027 の先行準備として、スタブページ・マイグレーション・チームカラー定義を実装する。
フィクスチャーデータは未確定のため、今回はデータ構造とティーザー UI のみ。

## 作業一覧

### 1. マイグレーション作成（新規ファイル）

`supabase/migrations/<timestamp>_add_competition_pools.sql` を作成:

```sql
create table competition_pools (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  pool_name text not null,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, team_id)
);

alter table competition_pools enable row level security;

create policy "competition_pools are publicly readable"
  on competition_pools for select using (true);
```

### 2. `lib/format/team-identity.ts`

既存の `getTeamColor` / `getTeamStripe` が参照するオブジェクトに追記する。
**既存ファイルの実際のフィールド名・構造に合わせること。**

```ts
'new-zealand':  { primary: '#000000', secondary: '#FFFFFF' },
'south-africa': { primary: '#007A4D', secondary: '#FFB81C' },
'australia':    { primary: '#FFD700', secondary: '#00843D' },
'argentina':    { primary: '#74ACDF', secondary: '#FFFFFF' },
'japan':        { primary: '#BC002D', secondary: '#FFFFFF' },
'fiji':         { primary: '#68BFE5', secondary: '#003F87' },
'samoa':        { primary: '#CE1126', secondary: '#003087' },
'tonga':        { primary: '#C10000', secondary: '#FFFFFF' },
'georgia':      { primary: '#FF0000', secondary: '#FFFFFF' },
'romania':      { primary: '#002B7F', secondary: '#FCD116' },
'uruguay':      { primary: '#75AADB', secondary: '#FFFFFF' },
```

### 3. `app/c/rwc/2027/page.tsx`（新規作成）

Next.js では static route が dynamic route より優先されるため、
`app/c/[competition]/[season]/page.tsx` より優先されることを確認すること。

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rugby World Cup 2027 | Tryline',
  description: 'RWC 2027 の試合・プール順位表・AI 日本語レビューを準備中です。',
}

export default function RWC2027Page() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
          Coming Soon
        </p>
        <h1 className="mt-4 font-serif text-4xl font-bold text-[var(--color-ink)]">
          Rugby World Cup 2027
        </h1>
        <p className="mt-6 text-base leading-relaxed text-[var(--color-ink-muted)]">
          2027年10〜11月、オーストラリア開催。
          <br />
          プール振り分け・フィクスチャー確定後に順次公開予定です。
        </p>
        <div className="mt-8">
          <Link
            className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
            href="/"
          >
            トップへ戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
```

### 4. `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES`

`'rwc'` キーを追加（暫定画像、本番前に差し替え可）:

```ts
'rwc': 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80',
```

### 5. teams INSERT 用 SQL ファイルを生成（Owner が手動適用）

`supabase/seeds/rwc-teams.sql` として保存するだけでよい（実行は Owner が Supabase ダッシュボードで行う）:

```sql
insert into teams (slug, name, short_code) values
  ('new-zealand',  'New Zealand All Blacks',   'NZL'),
  ('south-africa', 'South Africa Springboks',  'RSA'),
  ('australia',    'Australia Wallabies',       'AUS'),
  ('argentina',    'Argentina Los Pumas',       'ARG'),
  ('japan',        'Japan Brave Blossoms',      'JPN'),
  ('fiji',         'Fiji Flying Fijians',       'FIJ'),
  ('samoa',        'Samoa Manu Samoa',          'SAM'),
  ('tonga',        'Tonga',                     'TGA'),
  ('georgia',      'Georgia',                   'GEO'),
  ('romania',      'Romania',                   'ROM'),
  ('uruguay',      'Uruguay',                   'URU')
on conflict (slug) do nothing;
```

## 完了条件

- [ ] `supabase/migrations/` に `competition_pools` マイグレーションファイルが存在する
- [ ] `lib/format/team-identity.ts` に 11 チームの定義が追加されている
- [ ] `/c/rwc/2027` にアクセスすると「Coming Soon」スタブページが表示される
- [ ] `/c/[competition]/page.tsx` に `rwc` ヒーロー画像キーが追加されている
- [ ] `supabase/seeds/rwc-teams.sql` が生成されている
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## Owner 向け注意

マイグレーション（`competition_pools`）の Supabase 本番適用と、
`rwc-teams.sql` の実行は Owner が手動で行うこと。