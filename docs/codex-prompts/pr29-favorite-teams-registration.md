# feat: お気に入りチーム登録（DB・API・チームピッカー UI）

## 背景

ユーザーが応援チームを最大 3 チーム登録し、通知フィルタやホームのパーソナライズに活用する。
`specs/p2-favorite-teams.md` の登録・管理部分に対応する。ホームのパーソナライズは pr30 で行う。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `supabase/migrations/<timestamp>_add_favorite_teams.sql` | `user_profiles` に `favorite_team_slugs` 追加 |
| `lib/auth/server.ts` | `getUserProfile` の select に `favorite_team_slugs` 追加 |
| `lib/db/queries/teams.ts` | 新規: `listAllTeams` 関数 |
| `app/api/user/profile/route.ts` | 新規: `PATCH /api/user/profile` |
| `components/team-picker.tsx` | 新規: チーム選択 UI |
| `components/user-menu.tsx` | `TeamPicker` をドロップダウン内に組み込む |
| `components/site-header.tsx` | `favorite_team_slugs` と `allTeams` を `UserMenu` に渡す |

変更不可:
- `supabase/migrations/` 既存ファイル

---

## 変更内容

### 1. マイグレーション

`supabase/migrations/<timestamp>_add_favorite_teams.sql` を新規作成する。
タイムスタンプは既存ファイルの最大値 + 1（例: `20260510000000`）。

```sql
alter table user_profiles
  add column if not exists favorite_team_slugs text[] not null default '{}';
```

RLS は既存の `"own profile"` ポリシー（`for all using (auth.uid() = id)`）がカバーするため変更不要。

---

### 2. `lib/auth/server.ts` の `getUserProfile`

現在の select:
```typescript
.select("subscription_status, stripe_customer_id, chat_daily_count, chat_daily_reset_date")
```

変更後:
```typescript
.select("subscription_status, stripe_customer_id, chat_daily_count, chat_daily_reset_date, favorite_team_slugs")
```

戻り値の型は Supabase の infer に任せ、`favorite_team_slugs: string[]` が含まれるようにする。

---

### 3. `lib/db/queries/teams.ts`（新規）

```typescript
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type TeamSummary = {
  slug: string;
  name: string;
  country: string | null;
};

export async function listAllTeams(): Promise<TeamSummary[]> {
  const client = getSupabasePublicServerClient();
  const { data } = await client
    .from("teams")
    .select("slug, name, country")
    .order("name");

  return data ?? [];
}
```

---

### 4. `app/api/user/profile/route.ts`（新規）

```typescript
import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth, getUser } from "@/lib/auth/server";

export async function PATCH(request: Request) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    !("favorite_team_slugs" in body) ||
    !Array.isArray((body as { favorite_team_slugs: unknown }).favorite_team_slugs)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const slugs = (body as { favorite_team_slugs: unknown[] }).favorite_team_slugs;

  if (slugs.some((s) => typeof s !== "string")) {
    return NextResponse.json({ error: "invalid slug type" }, { status: 400 });
  }

  const favoriteSlugs = slugs as string[];

  if (favoriteSlugs.length > 3) {
    return NextResponse.json({ error: "max 3 teams" }, { status: 400 });
  }

  const db = await getSupabaseServerClientWithAuth();

  if (favoriteSlugs.length > 0) {
    const { data: teams, error } = await db
      .from("teams")
      .select("slug")
      .in("slug", favoriteSlugs);

    if (error) {
      return NextResponse.json({ error: "db error" }, { status: 500 });
    }

    const validSlugs = new Set(teams?.map((t) => t.slug) ?? []);
    const invalid = favoriteSlugs.filter((s) => !validSlugs.has(s));

    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `unknown slugs: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await db
    .from("user_profiles")
    .update({ favorite_team_slugs: favoriteSlugs })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

### 5. `components/team-picker.tsx`（新規）

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FlagIcon } from "@/components/flag-icon";

export interface TeamOption {
  slug: string;
  name: string;
  country: string | null;
}

interface TeamPickerProps {
  teams: TeamOption[];
  initialSelected: string[];
}

export function TeamPicker({ teams, initialSelected }: TeamPickerProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function toggle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function save() {
    setSaving(true);

    try {
      await fetch("/api/user/profile", {
        body: JSON.stringify({ favorite_team_slugs: selected }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">最大3チームを選択</p>
      <ul className="space-y-1">
        {teams.map((team) => {
          const isSelected = selected.includes(team.slug);
          const isDisabled = !isSelected && selected.length >= 3;

          return (
            <li key={team.slug}>
              <button
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                  isSelected
                    ? "bg-[var(--color-accent)] text-white"
                    : "hover:bg-slate-100 text-slate-700",
                  isDisabled ? "opacity-40 pointer-events-none" : "",
                ].join(" ")}
                disabled={isDisabled}
                onClick={() => toggle(team.slug)}
                type="button"
              >
                <FlagIcon country={team.country ?? ""} size={16} />
                {team.name}
                {isSelected && <span className="ml-auto text-xs">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        className="mt-3 w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        disabled={saving}
        onClick={save}
        type="button"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
```

---

### 6. `components/site-header.tsx` の変更

`listAllTeams` と `getUserProfile` の結果を `UserMenu` に渡す:

```typescript
import { listAllTeams } from "@/lib/db/queries/teams";

// SiteHeader 内で
const [user, allTeams] = await Promise.all([getUser(), listAllTeams()]);
const profile = user ? await getUserProfile(user.id) : null;
const premium = profile?.subscription_status === "premium";

<UserMenu
  allTeams={allTeams}
  favoriteTeamSlugs={profile?.favorite_team_slugs ?? []}
  isPremium={premium}
  user={user}
/>
```

---

### 7. `components/user-menu.tsx` の変更

`UserMenuProps` に `allTeams` と `favoriteTeamSlugs` を追加し、ドロップダウン内に `TeamPicker` を配置する:

```typescript
import { TeamPicker } from "@/components/team-picker";
import type { TeamOption } from "@/components/team-picker";

type UserMenuProps = {
  allTeams: TeamOption[];
  favoriteTeamSlugs: string[];
  isPremium: boolean;
  user: User | null;
};
```

ドロップダウンメニュー（ログイン済み）に「お気に入りチーム」セクションを追加:

```tsx
<div className="border-t border-slate-100 px-2 py-2">
  <p className="mb-1.5 px-2 text-xs font-semibold text-slate-400">お気に入りチーム</p>
  <TeamPicker
    initialSelected={favoriteTeamSlugs}
    teams={allTeams}
  />
</div>
```

---

## 実装上の注意

- `user-menu.tsx` は `"use client"` のため、サーバーから取得したデータは props 経由で渡す
- `FlagIcon` の `country` 引数は null 許容のため空文字列でフォールバックする
- `isPremium` の判定は現在 `isPremium(user.id)` を別途呼んでいるが、`profile.subscription_status` を直接使うよう `site-header.tsx` をリファクタしてよい

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `user_profiles.favorite_team_slugs text[]` カラムがマイグレーションで追加されている
- [ ] `PATCH /api/user/profile` がスラッグ検証・最大3件チェックを行い更新する
- [ ] ログイン済みユーザーのドロップダウンにチームピッカーが表示される
- [ ] 3チーム選択後は追加チームがグレーアウト（pointer-events-none）される
- [ ] 保存後に `router.refresh()` でページが最新状態を反映する

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `specs/p2-favorite-teams.md` | 仕様の全体像 |
| `supabase/migrations/20260507100000_add_user_profiles.sql` | `user_profiles` の現状 |
| `lib/auth/server.ts` | `getUserProfile`・`getUser` の実装 |
| `components/site-header.tsx` | サーバーコンポーネントからの props 渡し方 |
| `components/user-menu.tsx` | Client Component のドロップダウン実装 |
| `components/flag-icon.tsx` | フラグアイコンコンポーネント |
| `lib/db/queries/competitions.ts` | `getSupabasePublicServerClient` の使い方例 |
