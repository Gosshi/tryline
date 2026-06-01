# サイト全体に X フォロー導線を追加

## 背景

SEO インデックスが進み始め、検索流入が増加している。しかし現在のサイトには @tryline_rugbyjp への導線が一切なく、訪問者が X アカウントをフォローする経路が存在しない。

最新試合情報・更新通知は X で発信しており、フォロワー獲得がリテンション向上とシャドウバン解除（通常ユーザーとのエンゲージメント増加）の両方に直結する。

## スコープ

対象（3箇所）:
- `components/site-footer.tsx` — フッターに X フォローリンクを追加
- `components/site-header.tsx` — ヘッダーナビに X アイコンを追加
- `components/match-content.tsx`（または相当するコンポーネント）— 記事末尾に CTA を追加

対象外:
- EN アカウントへの導線（現時点では JA のみ）
- プッシュ通知・メールマガジン登録
- フォロワー数の表示

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 1. フッター — X フォローリンク

既存の `サービス` カラムの隣に「フォロー」セクションを追加する。グリッドを `sm:grid-cols-3` に拡張するか、`サービス` カラム内の末尾に追記するかは Codex が既存レイアウトに合わせて判断すること。

```tsx
<div>
  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
    フォロー
  </h2>
  <ul className="mt-3 space-y-2 text-xs text-slate-500">
    <li>
      <a
        className="flex items-center gap-1.5 hover:text-slate-900"
        href="https://x.com/tryline_rugbyjp"
        rel="noopener noreferrer"
        target="_blank"
      >
        <XIcon className="h-3.5 w-3.5" />
        @tryline_rugbyjp
      </a>
    </li>
  </ul>
</div>
```

---

### 2. ヘッダー — X アイコンリンク

デスクトップナビ（`md:flex` の `<nav>` 内）の `<UserMenu>` の左に X アイコンを追加する。

- アイコンのみ（テキストなし）
- サイズ: `h-4 w-4`

```tsx
<li>
  <a
    aria-label="X (Twitter) @tryline_rugbyjp"
    className="flex items-center rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    href="https://x.com/tryline_rugbyjp"
    rel="noopener noreferrer"
    target="_blank"
  >
    <XIcon className="h-4 w-4" />
  </a>
</li>
```

モバイルヘッダーメニュー（`MobileHeaderMenu`）にも同様に追加すること。

---

### 3. 記事末尾 CTA — 「最新情報は X で」

recap / preview コンテンツの末尾に固定 CTA ブロックを追加する。

**表示条件**: `recap` および `preview` どちらも表示する。

```tsx
<div className="mt-8 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
  <p className="text-sm text-slate-600">
    🏉 最新情報・更新通知は X で
  </p>
  <a
    className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
    href="https://x.com/tryline_rugbyjp"
    rel="noopener noreferrer"
    target="_blank"
  >
    <XIcon className="h-3.5 w-3.5" />
    フォローする
  </a>
</div>
```

配置場所: コンテンツ末尾・シェアボタンの近傍。Codex が `match-content.tsx` の既存レイアウトを確認し、ペイウォールとの位置関係を考慮して自然な箇所に挿入すること。

---

### X アイコン

`lucide-react` に Twitter / X アイコンがある場合はそれを使う。ない場合は以下の SVG をインラインで定義する:

```tsx
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.635 5.903-5.635Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
```

複数コンポーネントで使う場合は `components/icons/x-icon.tsx` などに切り出すこと。

## 受け入れ条件

1. フッターに `@tryline_rugbyjp` への X リンクが表示される。
2. ヘッダーのデスクトップナビに X アイコンが表示され、クリックで `https://x.com/tryline_rugbyjp` が新規タブで開く。
3. モバイルメニューにも X リンクが追加される。
4. 記事末尾（recap / preview）に「フォローする」CTA ブロックが表示される。
5. すべてのリンクに `target="_blank" rel="noopener noreferrer"` が付いている。
6. ヘッダーの X アイコンに `aria-label="X (Twitter) @tryline_rugbyjp"` が付いている。
7. `tsc --noEmit` でビルドエラーなし。

## 未解決の質問

1. `lucide-react` に X (Twitter) アイコンが含まれているか Codex が確認すること。
2. 記事末尾 CTA の配置は `match-content.tsx` の現在のレイアウトを見て、ペイウォールとの位置関係を Codex が判断すること。
3. モバイルメニュー（`MobileHeaderMenu`）の既存構造を確認し、X リンクの追加箇所を Codex が判断すること。
4. フッターのグリッド列数を `sm:grid-cols-3` に拡張するか、`サービス` 内に収めるかは Codex がレイアウト崩れを確認して判断すること。