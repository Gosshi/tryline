# PR #89 — 大会ページへの Premium インライン CTA 追加

## 背景

現状、大会ページ（`/c/[competition]/[season]`）には Premium への誘導が一切ない。
試合カードに「レビューを読む」ボタンはあるが、
非 Premium ユーザーが試合ページを開くまで課金の動機に触れる機会がない。

大会ページは SEO 流入の主要ランディングページでもあるため、
ページ内に軽量な CTA を置くことで課金転換率を改善する。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx`

対象外:
- `components/match-card.tsx` — 変更不要
- 特定大会への限定なし（全大会共通）

---

## 変更仕様

### 認証状態の取得

`app/c/[competition]/[season]/page.tsx` は現状 auth を参照していない。
`getUser` と `getUserProfile` を追加して `isPremium` を求める:

```ts
import { getUser, getUserProfile } from "@/lib/auth/server";

// export default async function SeasonPage の先頭で:
const user = await getUser();
const profile = user ? await getUserProfile(user.id) : null;
const isPremium = profile?.subscription_status === "premium";
```

### CTA バナーの挿入

`contentStatusMap` から「レビューが存在するか」を判定:

```ts
const hasAnyContent = [...contentStatusMap.values()].some(
  (s) => s.hasRecap || s.hasPreview,
);
```

`<SeasonMatchGroups ... />` の直前（試合一覧の上）に条件付きで挿入する:

```tsx
{hasAnyContent && !isPremium && (
  <div className="rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-5 py-4">
    <p className="text-sm font-semibold text-[var(--color-ink)]">
      AI 日本語レビューを全文読むには Premium が必要です
    </p>
    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
      各試合の詳細分析・プレビュー・AI チャットが月額 ¥980 で読み放題。
    </p>
    <a
      className="mt-3 inline-block rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
      href="/pricing"
    >
      Premium を始める — ¥980/月
    </a>
  </div>
)}
```

`contentStatusMap` は `page.tsx:97` 付近で既に取得済みなので再取得不要。
`matches.length === 0` の分岐ではなく `matches.length > 0` の分岐内に配置するため、
「試合データを準備中です」画面では表示されない。

---

## 完了の定義

- [ ] レビューが存在する大会ページを非ログインで開くと CTA バナーが表示される
- [ ] Premium ユーザーでログイン中は CTA が表示されない
- [ ] 試合データが0件のページ（「試合データを準備中です」表示）では CTA が出ない
- [ ] TypeScript エラーなし・`pnpm build` 通過
