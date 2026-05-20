# PR #87 — 大会ページ バグ修正 3件

## 背景

Playwright による全大会ページ評価（2026-05-21）で発見した表示バグ。
いずれも小規模変更で、ユーザーの信頼感・可読性に直結する。

---

## スコープ

対象:

- `lib/format/round-label.ts`
- `components/season-match-groups.tsx`
- `app/c/[competition]/[season]/page.tsx`

対象外:

- DB データの変更
- 順位表追加・Premium CTA 等の改善系（別 PR）

---

## バグ 1 — URC「第100節」→「準々決勝」

### 症状

`/c/urc/2025-26` でプレーオフ節が「第100節」と表示される。

### 原因

URC の Wikipedia 取り込みはプレーオフ節に `wikipedia_round = 100` を使う慣習がある。
`lib/db/queries/matches.ts` の `getRoundFromExternalIds` は
`externalIds.round ?? externalIds.wikipedia_round` で取得するため、
`100` がそのまま `round` に渡り `formatRoundLabel(100)` → "第100節" になる。

`urc-2025-26` では `wikipedia_round = 100` に 4 試合（準々決勝に相当）が入っている。
今後 round 101 = 準決勝、102 = 決勝 が追加される見込み。

### 修正箇所: `lib/format/round-label.ts`

100 番台を共通プレーオフラベルとして追加する。
URC 固有にせず全 family 共通で適用する（他リーグも同慣習を使う可能性があるため）。

```ts
// 既存の RWC_KNOCKOUT_ROUND_LABELS の下に追記
const WIKIPEDIA_LARGE_ROUND_LABELS: Record<number, string> = {
  100: "準々決勝",
  101: "準決勝",
  102: "決勝",
  103: "3位決定戦",
};

export function formatRoundLabel(round: number, family?: string): string {
  if (family === "rwc" && RWC_KNOCKOUT_ROUND_LABELS[round]) {
    return RWC_KNOCKOUT_ROUND_LABELS[round]!;
  }

  if (WIKIPEDIA_LARGE_ROUND_LABELS[round]) {
    return WIKIPEDIA_LARGE_ROUND_LABELS[round]!;
  }

  if (round === 0) return "プレーオフ予選";

  return `第${round}節`;
}
```

---

## バグ 2 — アコーディオンの展開節数が少なすぎる（URC）

### 症状

`/c/urc/2025-26` を開くと第1〜18節が折りたたまれた行の羅列になり、
「第100節（準々決勝）」4試合だけが展開されて見える。

### 原因

`components/season-match-groups.tsx` の `getDefaultOpenGroupIndex` は
「最後に全試合が開始済みのグループ、またはその次のグループ」を**1つだけ**返す。
シーズン後半で全通常節が完了している URC では、
プレーオフ節のみが開いた状態になる。

### 修正箇所: `components/season-match-groups.tsx`

`getDefaultOpenGroupIndex`（単数）を `getDefaultOpenGroupIndexes`（複数）に拡張し、
**基点の前後 1 グループ（合計最大 3 節）** を初期展開する。

```ts
export function getDefaultOpenGroupIndexes(
  groupedMatches: Array<[GroupKey, MatchListItem[]]>,
  now = new Date(),
): Set<number> {
  if (groupedMatches.length === 0) return new Set();

  const completedIndex = groupedMatches.reduce(
    (latestIndex, [, matches], index) => {
      const allStarted = matches.every(
        (match) => new Date(match.kickoffAt).getTime() <= now.getTime(),
      );
      return allStarted ? index : latestIndex;
    },
    -1,
  );

  // 全節未開始 → 第1節だけ開く
  if (completedIndex === -1) return new Set([0]);

  const open = new Set<number>();
  const last = groupedMatches.length - 1;
  for (
    let i = Math.max(0, completedIndex - 1);
    i <= Math.min(last, completedIndex + 1);
    i++
  ) {
    open.add(i);
  }
  return open;
}
```

`SeasonMatchGroups` 内の `useState` を差し替える:

```ts
const [openIndexes, setOpenIndexes] = useState<Set<number>>(() =>
  collapsible
    ? getDefaultOpenGroupIndexes(groupedMatches)
    : new Set(groupedMatches.map((_, index) => index)),
);
```

`getDefaultOpenGroupIndex`（単数）は export されておりテストで参照されている可能性があるため、
削除せずに残す。ただし内部実装は `getDefaultOpenGroupIndexes` から導出する形で統一してよい。

> `pnpm test` を実行して既存テストが通ることを確認すること。
> 必要に応じて `getDefaultOpenGroupIndexes` 用のテストを追記する。

---

## バグ 3 — `/c/rugby-championship/2024` が 404

### 症状

`/c/rugby-championship/2024` にアクセスすると 404 になる。

### 原因

DB に `rugby-championship-2024` は存在しない（`rugby-championship-2025` が最古）。
`app/c/[competition]/[season]/page.tsx` は slug が見つからなければ即 `notFound()` を返す。

### 修正箇所: `app/c/[competition]/[season]/page.tsx`

slug が見つからなかったとき、**同 family の最新シーズンにリダイレクト**する。

`listSeasonsByFamily` のソート順（実装を確認して昇順 or 降順を把握する）に応じて
先頭または末尾の要素を「最新シーズン」として選ぶ。

```ts
import { redirect } from "next/navigation";

// ...

const comp = await getCompetitionBySlug(`${competition}-${season}`);

if (!comp) {
  const available = await listSeasonsByFamily(competition);
  if (available.length > 0) {
    // listSeasonsByFamily が降順なら [0]、昇順なら [available.length - 1]
    const latest = available[0]; // 実装を確認して適切な方を選ぶこと
    redirect(`/c/${competition}/${latest.season}`);
  }
  notFound();
}
```

このリダイレクトは `rugby-championship/2024` だけでなく、
存在しない任意の大会×シーズン組み合わせ全般に有効。

---

## 完了の定義

- [ ] `/c/urc/2025-26` でプレーオフ節が「準々決勝」と表示される
- [ ] `/c/urc/2025-26` を開いたときデフォルトで 2〜3 節が展開されている
- [ ] `/c/rugby-championship/2024` が 404 でなく `/c/rugby-championship/2025` にリダイレクトされる
- [ ] `/c/six-nations/2025` など既存の正常ページに影響がない
- [ ] TypeScript エラーなし・`pnpm build` 通過
- [ ] `pnpm test` 通過
