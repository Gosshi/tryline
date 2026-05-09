# feat: ホームのパーソナライズ（お気に入りチームのピン表示・登録バナー）

## 背景

pr29 でお気に入りチームの登録機能を追加した。本 PR はその登録情報を活用し、
トップページでお気に入りチームの試合を上部にピン表示する。
未登録ユーザーには一度だけ「応援チームを登録する」バナーを表示する。

前提: pr29（`user_profiles.favorite_team_slugs`、`PATCH /api/user/profile`）がマージ済みであること。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/db/queries/matches.ts` | `getFavoriteTeamMatches` 関数を追加 |
| `app/page.tsx` | お気に入りピン表示・バナー表示を追加 |
| `components/favorite-teams-banner.tsx` | 新規: 未登録ユーザー向けバナー（Client Component）|

変更不可:
- `lib/auth/server.ts`（pr29 で変更済み）
- `supabase/migrations/`（pr29 で完了）

---

## 変更内容

### 1. `lib/db/queries/matches.ts` に `getFavoriteTeamMatches` を追加

お気に入りチームが出場する直近の試合（終了から7日以内 + 今後の予定、計最大5件）を取得する。

```typescript
export type FavoriteTeamMatch = UpcomingMatch;

export async function getFavoriteTeamMatches(
  teamSlugs: string[],
  limit = 5,
): Promise<FavoriteTeamMatch[]> {
  if (teamSlugs.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 直近7日間の終了試合 + 今後の予定試合を kickoff_at 昇順で取得
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (slug, name, short_code),
        away_team:teams!matches_away_team_id_fkey (slug, name, short_code),
        competition:competitions!matches_competition_id_fkey (slug, name, season)
      `,
    )
    .or(
      `and(status.eq.scheduled,kickoff_at.gte.${now}),and(status.eq.finished,kickoff_at.gte.${sevenDaysAgo})`,
    )
    .order("kickoff_at", { ascending: true })
    .limit(50); // チームフィルタは JS 側で行うため余裕を持つ

  if (error) {
    throw error;
  }

  const filtered = (data ?? []).filter(
    (row) =>
      row.competition !== null &&
      (teamSlugs.includes(row.home_team?.slug ?? "") ||
        teamSlugs.includes(row.away_team?.slug ?? "")),
  );

  return filtered.slice(0, limit).map((row) => {
    if (!row.competition) {
      throw new Error("Match is missing competition.");
    }

    return {
      ...mapMatchRow(row),
      competition: row.competition,
    };
  });
}
```

---

### 2. `app/page.tsx` の変更

#### 2a. インポートを追加

```typescript
import { getUser, getUserProfile } from "@/lib/auth/server";
import { getFavoriteTeamMatches } from "@/lib/db/queries/matches";
import { FavoriteTeamsBanner } from "@/components/favorite-teams-banner";
```

#### 2b. `HomePage` でお気に入り情報を取得

`HomePage` は Server Component なのでサーバー側で認証ユーザーを取得できる。

```typescript
export default async function HomePage() {
  const user = await getUser();
  const profile = user ? await getUserProfile(user.id) : null;
  const favoriteTeamSlugs = profile?.favorite_team_slugs ?? [];

  const [families, latest, recentReviews, upcomingMatches, favoriteMatches] =
    await Promise.all([
      listFamilies(),
      getLatestCompetitionWithMatches(),
      getRecentlyReviewedMatches(3),
      getUpcomingMatches(5),
      getFavoriteTeamMatches(favoriteTeamSlugs),
    ]);
  // ...
```

#### 2c. ピン表示セクション

ヒーローセクションの直後、`upcomingMatches` セクションの前に挿入する。
`favoriteMatches` が空なら何も表示しない。

```tsx
{favoriteMatches.length > 0 && (
  <section
    aria-labelledby="favorite-heading"
    className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8"
  >
    <h2
      className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--color-accent)]"
      id="favorite-heading"
    >
      応援チームの試合
    </h2>
    <ul className="space-y-3">
      {favoriteMatches.map((match) => (
        <li key={match.id}>
          <MatchCard match={match} />
        </li>
      ))}
    </ul>
  </section>
)}
```

#### 2d. 未登録バナー

ヒーローセクションの直後（ピン表示セクションの前）に挿入する。
ログイン済みかつ `favoriteTeamSlugs` が空のときのみレンダリングする。

```tsx
{user && favoriteTeamSlugs.length === 0 && (
  <FavoriteTeamsBanner />
)}
```

---

### 3. `components/favorite-teams-banner.tsx`（新規）

セッションストレージを使い、1 セッションにつき 1 回だけ表示する Client Component。

```typescript
"use client";

import { useEffect, useState } from "react";

const BANNER_KEY = "favorite_teams_banner_dismissed";

export function FavoriteTeamsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(BANNER_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem(BANNER_KEY, "1");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-4 py-3">
        <p className="text-sm text-slate-700">
          応援チームを登録すると、トップページに試合を優先表示できます。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-500">
            ヘッダーのメニューから設定できます
          </span>
          <button
            aria-label="バナーを閉じる"
            className="text-slate-400 hover:text-slate-600"
            onClick={dismiss}
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 実装上の注意

- `getUser` / `getUserProfile` はサーバー専用関数。`app/page.tsx` は Server Component なので直接呼び出し可能
- `FavoriteTeamsBanner` は `sessionStorage` を参照するため、hydration mismatch を防ぐため `visible` の初期値を `false` にし `useEffect` 内で `true` にセットする
- `getFavoriteTeamMatches` が返す試合と `getUpcomingMatches` の試合が重複する場合がある。重複排除は行わず、お気に入りセクションは独立して表示する
- `MatchCard` コンポーネントが `FavoriteTeamMatch` 型（= `UpcomingMatch` 型と同一）を受け取れることを確認すること

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] お気に入りチーム登録済みユーザーのホームに「応援チームの試合」セクションが表示される
- [ ] お気に入り未登録のログイン済みユーザーにバナーが表示される
- [ ] バナーを閉じると `sessionStorage` に記録され、同一セッション内では再表示されない
- [ ] 未ログインユーザーにはバナーもピン表示セクションも出ない

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `specs/p2-favorite-teams.md` | 仕様の全体像 |
| `app/page.tsx` | 変更対象の現状 |
| `lib/db/queries/matches.ts` | `getUpcomingMatches`・`mapMatchRow` の実装パターン |
| `lib/auth/server.ts` | `getUser`・`getUserProfile` の実装 |
| `components/match-card.tsx` | 試合カードコンポーネント |
