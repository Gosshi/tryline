# fix-evaluation-bugs-round5: 第5回評価バグ修正

## 背景

第5回サイト評価（Playwright）で検出されたバグを修正する。

---

## Bug 1 — パンくず年号重複

### ファイル: `app/matches/[id]/page.tsx`

**問題:** 約 144 行目のパンくず部分で `name` と `season` を直接連結しているため、名前にすでに年号が含まれる場合（例: `"Six Nations 2025"` + `"2025"`）に `"Six Nations 2025 2025"` となる。

```tsx
// 変更前
{match.competition.name} {match.competition.season}

// 変更後
{formatCompetitionTitle(match.competition.name, match.competition.season)}
```

`formatCompetitionTitle` はすでに同ファイルでインポート済み。

---

## Bug 2 — legal ページの title 重複

### ファイル: `app/legal/tokusho/page.tsx`・`app/legal/privacy/page.tsx`・`app/legal/terms/page.tsx`

**問題:** ルートレイアウトの metadata template が `"%s | Tryline"` のため、各ページが `"XXX | Tryline"` と設定すると `"XXX | Tryline | Tryline"` になる。

3ファイルそれぞれの `title` から末尾の `" | Tryline"` を削除する:

```ts
// 変更前
title: "プライバシーポリシー | Tryline",

// 変更後
title: "プライバシーポリシー",
```

`tokusho`・`privacy`・`terms` の3ファイルすべてに適用。

---

## Bug 3 — ヘッダーの `/#standings` 死にリンク

### ファイル: `components/site-header.tsx`

**問題:** 約 40 行目の `href="/#standings"` はページ内アンカーが存在しない死にリンク。

該当の「順位表」リンクを削除する。リンクタグ（`<Link>` または `<a>`）ごと削除してよい。ヘッダーの他のリンクには触れない。

---

## Bug 4 — モバイルでチームコードが欠ける

### ファイル: `components/match-header.tsx`（スコア表示部分）

**問題:** 375px 幅でチームコード（`HIG`・`FRA` 等）が右端で切れて `IIG`・`RA` のように見える。

スコア表示の左右チーム列に `min-w-0` を追加し、flex-shrink を許可する。または CSS Grid で `grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)` に変更する。

チームコードを含む flex 子要素に `min-w-0 truncate` を適用するか、親を grid に変更する。ロジック・スコア値は変更しない。

---

## Bug 5 — W バッジのみで L バッジが存在しない

### ファイル: `components/match-card.tsx`

**問題:** 勝者側にのみ緑の "W" バッジが表示されるが、敗者側に対応するバッジがなく、スコアを読まないと勝敗が判別しにくい。

敗者側に "L" バッジを追加する（`status === "finished"` かつ引き分けでない場合のみ）。

```tsx
// 敗者側に追加
<span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
  L
</span>
```

引き分け（`homeScore === awayScore`）の場合は W も L も表示しない。W バッジのスタイルは変更しない。

---

## 変更しないこと

- `app/matches/[id]/page.tsx` の 144 行目以外のロジック
- `site-header.tsx` の他のリンク・スタイル
- `match-card.tsx` の W バッジのスタイル・条件
- legal ページの本文コンテンツ

---

## 完了条件

- [ ] `/matches/:id` のパンくずが `"Six Nations 2025 · Round 1"`（年号1回）になる
- [ ] legal ページの `<title>` が `"プライバシーポリシー | Tryline"`（1回）になる
- [ ] ヘッダーに「順位表」リンクが表示されない
- [ ] モバイル 375px でチームコードが欠けない
- [ ] 試合カードの敗者側に灰色の "L" バッジが表示される
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
