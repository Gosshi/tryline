# p3-rwc-2027-prep: RWC 2027 先行準備

## 背景

RWC 2027（2027年10〜11月、オーストラリア開催）は Tryline の最大集客機会。
フィクスチャー確定・プール抽選は 2026 年末〜2027 年初の見込みで、
現時点では試合データが存在しない。
ただしデータモデル・チームカラー・スタブページを今から準備することで、
本番データ投入時の実装コストを最小化する。

上位仕様: `specs/p2-rwc-2027.md`。本仕様書はその中の「今すぐ着手できる部分」に絞る。

## スコープ

対象:
- `lib/format/team-identity.ts`: RWC 参加予定チームのカラー・フラグ定義を追加
- `supabase/migrations/`: `competition_pools` テーブルのマイグレーション作成
- `app/c/rwc/2027/page.tsx`: 「近日公開」スタブページの新規作成
- `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES`: `rwc` キーを追加
- `supabase/seeds/` 等: 追加チームの INSERT（既存テーブル確認後）

対象外:
- 実際の RWC 2027 フィクスチャーデータの投入（フィクスチャー未確定）
- ノックアウトブラケット UI（`p2-rwc-2027.md` に記載、本番データ確定後に実装）
- プール別順位表 UI（同上）

## データモデル変更

### `competition_pools` テーブル（新規マイグレーション）

`p2-rwc-2027.md` のスキーマに従いマイグレーションファイルを作成する。

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

### `teams` テーブルへのチーム追加

まず既存の teams テーブルを SELECT して未登録チームを確認してから INSERT する。

追加対象（Six Nations 6 チーム以外の RWC 主要出場国）:

| slug | name | short_code |
|---|---|---|
| `new-zealand` | New Zealand All Blacks | NZL |
| `south-africa` | South Africa Springboks | RSA |
| `australia` | Australia Wallabies | AUS |
| `argentina` | Argentina Los Pumas | ARG |
| `japan` | Japan Brave Blossoms | JPN |
| `fiji` | Fiji Flying Fijians | FIJ |
| `samoa` | Samoa Manu Samoa | SAM |
| `tonga` | Tonga | TGA |
| `georgia` | Georgia | GEO |
| `romania` | Romania | ROM |
| `uruguay` | Uruguay | URU |

既存レコードがある場合は INSERT しない（`on conflict do nothing`）。
本番 Supabase への適用は Owner が行う。

## `team-identity.ts` への追加

`lib/format/team-identity.ts` 内の既存定数オブジェクトに追記する。
既存のパターン（`getTeamColor` / `getTeamStripe` が参照する箇所）に合わせる。

```ts
'new-zealand': { primary: '#000000', secondary: '#FFFFFF' },
'south-africa': { primary: '#007A4D', secondary: '#FFB81C' },
'australia': { primary: '#FFD700', secondary: '#00843D' },
'argentina': { primary: '#74ACDF', secondary: '#FFFFFF' },
'japan': { primary: '#BC002D', secondary: '#FFFFFF' },
'fiji': { primary: '#68BFE5', secondary: '#003F87' },
'samoa': { primary: '#CE1126', secondary: '#003087' },
'tonga': { primary: '#C10000', secondary: '#FFFFFF' },
'georgia': { primary: '#FF0000', secondary: '#FFFFFF' },
'romania': { primary: '#002B7F', secondary: '#FCD116' },
'uruguay': { primary: '#75AADB', secondary: '#FFFFFF' },
```

実際のフィールド名は既存コードの構造に合わせること。

## UI サーフェス

### RWC 2027 スタブページ（新規: `app/c/rwc/2027/page.tsx`）

既存の `/c/[competition]/[season]` ルートとは別に、
`app/c/rwc/2027/page.tsx` をファイルベースで直接作成する
（dynamic route より static route が優先されるため）。

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

### 大会ハブのヒーロー画像（`app/c/[competition]/page.tsx`）

`COMPETITION_HERO_IMAGES` に `'rwc'` キーを追加:

```ts
'rwc': 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80',
```

暫定で Six Nations と同じ画像を使用。本番前に差し替え可。

## 受け入れ条件

- [ ] `competition_pools` テーブルのマイグレーションファイルが作成されている
- [ ] `team-identity.ts` に 11 チームの定義が追加されている
- [ ] `/c/rwc/2027` にアクセスすると「Coming Soon」スタブページが表示される
- [ ] `/c/rwc` にアクセスすると大会ハブページのヒーロー画像が表示される
- [ ] teams INSERT は既存レコードの有無を確認してから実施している
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- `/c/rwc/2027/page.tsx` の static ファイルが dynamic route の
  `/c/[competition]/[season]/page.tsx` より優先されるか、Next.js のルーティングを確認すること
  （優先されない場合は `not-found` で動的ルートが 404 を返す別対応が必要）
- `teams` テーブルに既存の NZL / RSA / AUS 等のレコードがあるか（Premiership の外国籍チームなど）
