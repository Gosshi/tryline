# fix: 空状態メッセージに文脈と次のアクションを追加

## 目的

「試合が登録されていません」の一文だけが表示される空状態を改善する。
ユーザーが「なぜ空なのか」「次にどこへ行けばよいか」を理解できるようにする。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 対象ページ・コンポーネント

- `app/c/[competition]/[season]/page.tsx`（シーズンページの試合ゼロ状態）

---

## 現在の表示

```
試合が登録されていません
```

---

## 変更後の表示

空状態ブロックを以下の構造に変更する。

```tsx
<div className="rounded-lg border border-border bg-surface-muted px-6 py-10 text-center">
  <p className="text-sm font-medium text-ink">試合データを準備中です</p>
  <p className="mt-2 text-sm text-ink-muted">
    このシーズンの試合情報はまもなく公開予定です。
  </p>
  <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
    <Link
      href={`/c/${competition}`}
      className="text-sm font-medium text-accent underline underline-offset-4"
    >
      他のシーズンを見る
    </Link>
    <span className="hidden text-ink-muted sm:inline">·</span>
    <Link
      href="/"
      className="text-sm font-medium text-accent underline underline-offset-4"
    >
      トップへ戻る
    </Link>
  </div>
</div>
```

- `competition` は既存のルートパラメータ（`params.competition`）を使う
- クラス名は既存の `design.md` のデザイントークンに合わせる
- `next/link` の `<Link>` を使う（`<a>` タグ直書きは不可）

---

## 変更しないこと

- 試合が 1 件以上ある場合の表示
- ページヘッダー・シーズン選択ナビゲーション
- 順位表セクション（standings）

---

## 完了条件

- [ ] `/c/urc/2025-26` などの空シーズンで新しい空状態が表示される
- [ ] 「他のシーズンを見る」リンクが正しい大会ハブ（例: `/c/urc`）へ遷移する
- [ ] 「トップへ戻る」リンクが `/` へ遷移する
- [ ] モバイル（375px）でレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
