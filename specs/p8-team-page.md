# チームページ

## 背景

現状、チーム情報への導線がない。試合詳細ページのチーム名をタップしても遷移先がなく、
ユーザーがチーム軸でコンテンツを探せない。

チームページを導入し、「このチームの最近の試合・次戦」を一覧できるようにする。

## スコープ

対象:
- `app/teams/[slug]/page.tsx`（新規）
- `lib/db/queries/teams.ts`（関数追加）
- `components/match-header.tsx`（チーム名リンク化）

対象外:
- 選手名鑑・ロスター（DB にデータなし）
- 過去シーズンの統計（Phase 1 外）
- チーム同士の対戦成績（H2H）ページ（Phase 1 外）

## URL 設計

```
/teams/[slug]
例: /teams/bath, /teams/stade-toulousain, /teams/leinster
```

`slug` は `teams.slug` と一致する。

## データモデル

### 新規クエリ（`lib/db/queries/teams.ts` に追加）

```ts
export type TeamDetail = {
  slug: string;
  name: string;
  shortCode: string | null;
  country: string;
};

export async function getTeamBySlug(slug: string): Promise<TeamDetail | null>
```

```ts
export type TeamMatchItem = {
  id: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { slug: string; name: string; shortCode: string | null };
  awayTeam: { slug: string; name: string; shortCode: string | null };
  competition: { slug: string; name: string; season: string };
};

// 直近10件の終了試合（kickoff_at 降順）
export async function getTeamRecentMatches(
  teamId: string,
  limit?: number,
): Promise<TeamMatchItem[]>

// 次戦5件（kickoff_at 昇順）
export async function getTeamUpcomingMatches(
  teamId: string,
  limit?: number,
): Promise<TeamMatchItem[]>
```

`getTeamRecentMatches` は `status = 'finished'` + `kickoff_at desc`。
`getTeamUpcomingMatches` は `status = 'scheduled'` + `kickoff_at asc`。

チームの特定には `home_team_id = teamId OR away_team_id = teamId` を使う。

## UI サーフェス

### `app/teams/[slug]/page.tsx`

```
[チームバッジ(64px)]  チーム名
                      国名（country）

──── 直近の試合 ────────────────────────
[大会名・シーズン]
[ホームチーム] スコア − スコア [アウェイチーム]  日付
…（最大10件）

──── 次戦 ──────────────────────────────
[大会名・シーズン]
[ホームチーム] vs [アウェイチーム]  日時
…（最大5件、なければセクション非表示）
```

- 試合行は `/matches/[id]` へのリンク
- スコア未確定（scheduled）の行には時刻を表示
- 試合行のレイアウトは `MatchCard` コンポーネントを流用するか、新規コンポーネントを作成する
- 「直近の試合」が 0 件の場合は「試合データがありません」と表示

### パンくずリスト

```
Tryline > [チーム名]
```

### メタデータ

```ts
title: `${team.name} | Tryline`
description: `${team.name}の最近の試合と次戦の日程`
```

## 変更: `components/match-header.tsx`

試合詳細ページのチーム名（`TeamBlock` 内の name）を
`<Link href={/teams/${slug}}>` でラップする。

変更箇所（L173-179 付近の `TeamBlock`）:
- `name` を表示している `<p>` または `<span>` を `<Link>` に変える
- スタイルは既存のままで、`hover:underline` を追加する

## 受け入れ条件

- [ ] `/teams/bath` 等にアクセスするとチームページが表示される
- [ ] 存在しない slug にアクセスすると 404 を返す（`notFound()` 使用）
- [ ] 直近10件の終了試合が表示され、試合詳細ページへのリンクがある
- [ ] 次戦が表示される（なければセクション自体が非表示）
- [ ] 試合詳細ページのチーム名（ホーム・アウェイ両方）がチームページへのリンクになっている
- [ ] モバイル（375px）・デスクトップ（1280px）ともにレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- チームバッジ画像（`logo_url`）が未投入の場合の fallback →
  `TeamBadge` コンポーネント（`short_code` ベースの SVG バッジ）を使えばよい
- サイドバーやグローバルナビへのチームリンク追加は Phase 2 以降
