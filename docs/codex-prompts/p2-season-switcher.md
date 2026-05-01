# Codex Prompt: シーズンスイッチャー追加

## 前提

`p2-competition-routing.md` が完了していること（`app/c/[competition]/[season]/page.tsx` が存在する）。

## 背景

`/c/six-nations/2025` にアクセスしても、他のシーズン（2020〜2024）に移動する手段がない。シーズン間を移動できるセグメントコントロール型のスイッチャーをシーズンページに追加する。

---

## Task 1 — `components/season-switcher.tsx` を新規作成

Server Component。JavaScript 不要（リンクのみ）。

```tsx
import Link from "next/link";

type SeasonSwitcherProps = {
  seasons: { season: string }[];
  currentSeason: string;
  competition: string;
};

export function SeasonSwitcher({
  seasons,
  currentSeason,
  competition,
}: SeasonSwitcherProps) {
  if (seasons.length <= 1) return null;

  return (
    <nav aria-label="シーズン選択">
      <ul className="flex gap-1 overflow-x-auto pb-1">
        {seasons.map(({ season }) => {
          const isCurrent = season === currentSeason;
          return (
            <li key={season} className="flex-shrink-0">
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-flex items-center rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white"
                >
                  {season}
                </span>
              ) : (
                <Link
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  href={`/c/${competition}/${season}`}
                >
                  {season}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

---

## Task 2 — `app/c/[competition]/[season]/page.tsx` を更新

### データ取得に seasons を追加

```typescript
import { getCompetitionBySlug, listSeasonsByFamily } from "@/lib/db/queries/competitions";

// Promise.all に listSeasonsByFamily を追加:
const [matches, standings, seasons] = await Promise.all([
  listMatchesForCompetition(comp.slug),
  getStandingsForCompetition(comp.slug),
  listSeasonsByFamily(comp.family),
]);
```

### SeasonSwitcher を競技名見出しの上に挿入

```tsx
import { SeasonSwitcher } from "@/components/season-switcher";

// <header className="space-y-3 ..."> の直前に挿入:
<SeasonSwitcher
  competition={competition}
  currentSeason={comp.season}
  seasons={seasons}
/>
```

`competition` は `const { competition, season } = await params;` で取得済みの変数をそのまま使う。

---

## 完了条件

- [ ] `/c/six-nations/2025` にシーズンスイッチャーが表示される
- [ ] `2025` が emerald のアクティブ状態（`aria-current="page"`）で表示される
- [ ] 他の年がリンクとして表示され、クリックで該当シーズンページに遷移する
- [ ] シーズンが 1 件以下の場合はスイッチャーが表示されない
- [ ] モバイル 375px で横スクロールできる
- [ ] `pnpm tsc --noEmit` がパスする

## 変更しないこと

- `components/site-header.tsx`
- `lib/db/queries/competitions.ts`
- 試合一覧・順位表の表示ロジック
