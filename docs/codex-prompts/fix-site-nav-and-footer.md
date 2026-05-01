# Codex Prompt: サイトナビゲーション追加 & フッター新設

## 背景

UI 監査で以下が指摘された。

- `SiteHeader` にナビゲーションリンクがなく、ロゴ（Tryline）しか存在しない
- フッターが皆無で、日本の電子商取引法（特定商取引法）上必要な表記がない

---

## Task 1 — `components/site-header.tsx` にナビリンクを追加

### 現状

```tsx
<div />  // 右側が空
```

### 変更内容

右側の `<div />` をナビリンク群に置き換える。リンク先は現時点で存在するページのみ指定する。

```tsx
<nav aria-label="メインナビゲーション">
  <ul className="flex items-center gap-1">
    <li>
      <Link
        className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        href="/"
      >
        試合
      </Link>
    </li>
    <li>
      <Link
        className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        href="/#standings"
      >
        順位表
      </Link>
    </li>
  </ul>
</nav>
```

また、ホームページの順位表セクションにアンカーが必要になるため、`app/page.tsx` の `<StandingsTable>` を含む要素に `id="standings"` を追加する。

```tsx
// app/page.tsx 内の StandingsTable の外側 div に id を付与
<div id="standings">
  <StandingsTable standings={standings} />
</div>
```

### 完了条件

- [ ] ヘッダー右側に「試合」「順位表」のリンクが表示される
- [ ] モバイル 375px でロゴとナビが同一行に収まる
- [ ] `/#standings` クリックで順位表セクションにスクロールする
- [ ] `pnpm tsc --noEmit` がパスする

---

## Task 2 — `components/site-footer.tsx` を新規作成

```tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-black tracking-tight text-slate-950">
            Tryline
          </p>
          <nav aria-label="フッターナビゲーション">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
              <li>
                <Link className="hover:text-slate-900" href="/legal/tokusho">
                  特定商取引法に基づく表記
                </Link>
              </li>
              <li>
                <Link className="hover:text-slate-900" href="/legal/privacy">
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link className="hover:text-slate-900" href="/legal/terms">
                  利用規約
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          © {new Date().getFullYear()} Tryline. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
```

`/legal/*` ページは現時点で不要（404 のままでよい）。

---

## Task 3 — `app/layout.tsx` に `<SiteFooter />` を追加

### 変更内容

```tsx
import { SiteFooter } from "@/components/site-footer";

// ...

<body className="min-h-screen">
  <SiteHeader />
  {children}
  <SiteFooter />
</body>
```

### 完了条件

- [ ] 全ページのフッターに「Tryline」・法的リンク3本・コピーライトが表示される
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

---

## 変更しないこと

- `site-header.tsx` のロゴ・sticky/backdrop-blur スタイル
- `app/layout.tsx` の `<html lang="ja">` や `metadata`
- `app/page.tsx` の Hero・試合グリッド・順位表の既存ロジック（`id="standings"` の付与のみ）
