# PR51: チームページへの選手一覧追加（動線整備）

## 背景

選手ページ（`/players/[slug]`）が PR49/50 で実装されたが、そこへの動線がない。
`/teams/[slug]` にチーム所属の canonical 選手一覧を追加し、
チームページ → 選手ページへの回遊経路を作る。

同時に、選手ページのチームリンクを `/t/[slug]`（簡易チームページ）から
`/teams/[slug]`（詳細チームページ）に変更して相互リンクを成立させる。

## スコープ

対象:
- `lib/db/queries/players.ts` — `getPlayersByTeamSlug` を追加
- `components/team-players-section.tsx` — 新規作成
- `app/teams/[slug]/page.tsx` — 選手セクションを追加
- `app/players/[slug]/page.tsx` — チームリンクを `/t/` から `/teams/` に変更

対象外:
- `/t/[team]/page.tsx`（簡易チームページ）への追加
- ポジション別フィルタリング
- 背番号の表示（season ごとに変わるため）

---

## 変更詳細

### 1. `lib/db/queries/players.ts`

`getPlayersByTeamSlug` を追記する。

```typescript
export type TeamPlayerItem = {
  name: string;
  position: string | null;
  slug: string;
};

export async function getPlayersByTeamSlug(
  teamSlug: string,
): Promise<TeamPlayerItem[]> {
  const client = getSupabasePublicServerClient();

  // 1. team_id を取得
  const { data: teamData } = await client
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (!teamData) {
    return [];
  }

  // 2. canonical 選手のみ取得（canonical_player_id IS NULL）
  const { data, error } = await client
    .from("players")
    .select("name, position, slug")
    .eq("team_id", teamData.id)
    .is("canonical_player_id", null)
    .order("name");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    name: row.name,
    position: row.position ?? null,
    slug: row.slug,
  }));
}
```

---

### 2. `components/team-players-section.tsx`（新規作成）

```tsx
import Link from "next/link";

import type { TeamPlayerItem } from "@/lib/db/queries/players";

type Props = {
  players: TeamPlayerItem[];
};

export function TeamPlayersSection({ players }: Props) {
  if (players.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        選手データがありません
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {players.map((player) => (
        <Link
          className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href={`/players/${player.slug}`}
          key={player.slug}
        >
          <span className="font-medium text-[var(--color-ink)]">
            {player.name}
          </span>
          {player.position && (
            <span className="text-xs text-[var(--color-ink-muted)]">
              {player.position}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
```

---

### 3. `app/teams/[slug]/page.tsx`

#### インポート追加

```typescript
import { TeamPlayersSection } from "@/components/team-players-section";
import {
  getPlayersByTeamSlug,
  // ...既存のインポートはそのまま
} from "@/lib/db/queries/players";
```

#### `Promise.all` に追加

```typescript
const [data, stats, players] = await Promise.all([
  getTeamPageDataBySlug(slug),
  getTeamStatsDataBySlug(slug).catch(() => null),
  getPlayersByTeamSlug(slug),
]);
```

#### JSX — 次戦セクションの直後に追加

```tsx
<section className="space-y-4">
  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
    選手
  </h2>
  <TeamPlayersSection players={players} />
</section>
```

---

### 4. `app/players/[slug]/page.tsx`

チームリンクの `href` を `/t/${player.teamSlug}` から `/teams/${player.teamSlug}` に変更する。

```tsx
// 変更前
href={`/t/${player.teamSlug}`}

// 変更後
href={`/teams/${player.teamSlug}`}
```

---

## 受け入れ条件

- `/teams/england` 等のチームページ末尾に「選手」セクションが表示される
- 各選手カードが `/players/[slug]` へのリンクになっている
- ポジションがある場合は名前の下に小さく表示される
- 選手が 0 件の場合は「選手データがありません」を表示
- 選手ページのチームリンクが `/teams/[slug]` を指す
- `pnpm build` でエラーなし

## 参考ファイル

- `lib/db/queries/players.ts` — PR49/50 で作成・更新済み（追記対象）
- `components/team-stats-panel.tsx` — コンポーネントの書き方の参考
- `app/teams/[slug]/page.tsx` — Promise.all と section JSX の書き方参考
- `app/players/[slug]/page.tsx` — チームリンクの変更対象（87〜111行目付近）
