# PR57: 選手ページに所属チーム複数表示

## 背景

PR55・PR56 で canonical_player_id が設定され、代表エントリ（`yu-tamura`）と
リーグワンエントリ（`player-2a340978`）が紐付いた。

現状、`/players/yu-tamura` のヘッダーには "Japan" しか表示されないが、
この選手は横浜キヤノンイーグルスにも所属している。
alias エントリのチーム情報を合わせて表示することで情報量を改善する。

## スコープ

対象:
- `lib/db/queries/players.ts` — `getPlayerBySlug` の拡張・型定義追加
- `app/players/[slug]/page.tsx` — ヘッダーに alias チーム表示

対象外:
- position の補完（別 PR）
- stats の集計表示（別 PR）

---

## 変更詳細

### 1. `lib/db/queries/players.ts`

#### 型定義に `aliasTeams` を追加

```typescript
export type PlayerDetail = {
  aliasTeams: { name: string; slug: string }[];  // ← 追加
  canonicalSlug: string | null;
  id: string;
  name: string;
  position: string | null;
  slug: string;
  teamName: string;
  teamSlug: string;
};
```

#### `getPlayerBySlug` でエイリアスのチームを取得

`canonicalSlug` を取得する処理の後、自分が canonical である場合（`canonical_player_id` が null）に
エイリアス一覧を取得する処理を追加する。

```typescript
// canonical エントリの場合のみ alias チームを取得
let aliasTeams: { name: string; slug: string }[] = [];

if (!row.canonical_player_id) {
  const { data: aliasData } = await client
    .from("players")
    .select("team:teams!players_team_id_fkey ( name, slug )")
    .eq("canonical_player_id", row.id);

  if (aliasData) {
    const seen = new Set<string>();
    for (const alias of aliasData as { team: { name: string; slug: string } | null }[]) {
      if (alias.team && !seen.has(alias.team.slug) && alias.team.slug !== row.team?.slug) {
        seen.add(alias.team.slug);
        aliasTeams.push({ name: alias.team.name, slug: alias.team.slug });
      }
    }
  }
}

return {
  aliasTeams,
  canonicalSlug,
  ...
};
```

重複除去の条件:
- canonical エントリ自身のチームと同じチームは含めない
- 同じスラグのチームは1回だけ

---

### 2. `app/players/[slug]/page.tsx`

ヘッダー内のチーム表示部分に alias チームを追加する。
`Fragment` を使うため `import { Fragment } from "react"` を先頭に追加する。

```tsx
<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-ink-muted)]">
  {player.position && <span>{player.position}</span>}
  {player.position && <span aria-hidden>·</span>}

  {/* primary チーム */}
  {player.teamSlug ? (
    <Link
      className="font-medium text-[var(--color-ink)] underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={`/teams/${player.teamSlug}`}
    >
      {player.teamName}
    </Link>
  ) : (
    <span>{player.teamName}</span>
  )}

  {/* alias チーム */}
  {player.aliasTeams.map((team) => (
    <Fragment key={team.slug}>
      <span aria-hidden>·</span>
      <Link
        className="font-medium text-[var(--color-ink)] underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        href={`/teams/${team.slug}`}
      >
        {team.name}
      </Link>
    </Fragment>
  ))}
</div>
```

---

## 受け入れ条件

- `/players/yu-tamura` のヘッダーに "Japan · 横浜キヤノンイーグルス" が表示される
- alias チームと primary チームが同じ場合は重複しない
- alias チームがない選手は現状と変わらない
- `pnpm build` でエラーなし

## 参考ファイル

- `lib/db/queries/players.ts` — 変更対象（現行実装参照）
- `app/players/[slug]/page.tsx` — 変更対象（現行実装参照）
