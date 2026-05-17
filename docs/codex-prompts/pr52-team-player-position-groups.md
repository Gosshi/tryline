# PR52: チーム選手一覧をポジション別グループ表示に変更

## 背景

PR51 で実装した選手一覧は全選手がアルファベット順のフラットなグリッドで表示されており、
国代表チームでは 60 人超が並んで視認性が低い。
ラグビーの基本区分（フォワード / バックス）でグループ化し、
ポジションラベルを活かした一覧にする。

## スコープ

対象:
- `components/team-players-section.tsx` — グループ表示に変更
- `lib/utils/rugby-positions.ts` — ポジション正規化ユーティリティを新規作成

対象外:
- DB クエリの変更（`getPlayersByTeamSlug` はそのまま）
- 5グループ以上の細分化（Front Row / Lock / Back Row 等）
- ポジション不明選手の非表示

---

## 変更詳細

### 1. `lib/utils/rugby-positions.ts`（新規作成）

Wikipedia squad から取得した position 文字列を FW / BK / Unknown に分類する。

```typescript
export type PositionGroup = "fw" | "bk" | "unknown";

const FW_KEYWORDS = [
  "prop",
  "hooker",
  "lock",
  "second row",
  "flanker",
  "number 8",
  "no. 8",
  "no.8",
];

const BK_KEYWORDS = [
  "scrum-half",
  "scrum half",
  "fly-half",
  "fly half",
  "out-half",
  "out half",
  "centre",
  "center",
  "wing",
  "full-back",
  "fullback",
];

export function getPositionGroup(position: string | null): PositionGroup {
  if (!position) return "unknown";
  const lower = position.toLowerCase();
  if (FW_KEYWORDS.some((kw) => lower.includes(kw))) return "fw";
  if (BK_KEYWORDS.some((kw) => lower.includes(kw))) return "bk";
  return "unknown";
}

export const POSITION_GROUP_LABEL: Record<PositionGroup, string> = {
  bk: "バックス",
  fw: "フォワード",
  unknown: "その他",
};
```

---

### 2. `components/team-players-section.tsx`

PR51 で作成したファイルを以下の内容に全面置き換えする。

```tsx
import Link from "next/link";

import { getPositionGroup, POSITION_GROUP_LABEL } from "@/lib/utils/rugby-positions";

import type { PositionGroup } from "@/lib/utils/rugby-positions";
import type { TeamPlayerItem } from "@/lib/db/queries/players";

type Props = {
  players: TeamPlayerItem[];
};

const GROUP_ORDER: PositionGroup[] = ["fw", "bk", "unknown"];

export function TeamPlayersSection({ players }: Props) {
  if (players.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        選手データがありません
      </p>
    );
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: POSITION_GROUP_LABEL[group],
    players: players.filter((p) => getPositionGroup(p.position) === group),
  })).filter((g) => g.players.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map(({ group, label, players: groupPlayers }) => (
        <div key={group}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {groupPlayers.map((player) => (
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
        </div>
      ))}
    </div>
  );
}
```

---

## 受け入れ条件

- チームページの選手セクションが「フォワード」「バックス」（＋「その他」）の見出し付きで分類される
- ポジション不明の選手は「その他」グループにまとめられ、該当者がいない場合はグループ自体を非表示
- 各グループ内の順序は DB から取得したアルファベット順を維持
- 各カードに position 文字列がそのまま表示される（正規化せず元のラベルを使う）
- `pnpm build` でエラーなし

## 参考ファイル

- `components/team-players-section.tsx` — PR51 で作成済み（全面置き換え対象）
- `lib/utils/rugby-positions.ts` — 新規作成
- `lib/format/competition.ts` — ユーティリティ関数の書き方の参考
