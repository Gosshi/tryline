# p3-funnel-entry-points: 課金動線エントリーポイント改善

## 背景

現状、未ログインユーザーが Premium の存在に気づく導線が極めて少ない。
ヘッダーのナビリンクは「試合」のみ、ホームのヒーローに CTA ボタンがなく、
フッターは法的ページへのリンクしかない。
ヘッダー・ホームヒーロー・フッターの 3 点を改善し、
初回訪問から料金ページへの流入経路を増やす。

## スコープ

対象:
- `components/site-header.tsx`: ヘッダーに「料金」ナビリンクを追加（未ログイン時）
- `app/page.tsx`: ホームヒーローセクションに CTA ボタンを追加
- `components/site-footer.tsx`: フッターに大会・料金へのリンクを追加

対象外:
- 料金ページ自体のリデザイン（`p3-pricing-page-redesign.md` に分離）
- ポップアップ・バナー的な UI
- ログイン済み Premium ユーザーへの追加表示

## UI サーフェス

### 1. ヘッダー（`components/site-header.tsx`）

現状のナビ:
```
試合  [ログイン]
```

変更後:
```
試合  料金  [ログイン]     ← user === null（未ログイン）時
試合         [username ▾]  ← ログイン済み（UserMenu の既存リンクで対応済み）
```

実装方針:
- `SiteHeader` はすでに Server Component で `user` を取得している
- `user === null` の場合のみ「料金」リンクを `<li>` に追加する
- スタイル: 既存の「試合」リンクと同じ `text-sm font-medium text-slate-600` クラス

### 2. ホームヒーロー（`app/page.tsx`）

現状: 見出し + キャッチコピーのみ

変更後: キャッチコピーの直下にボタン行を追加

```tsx
<div className="mt-8 flex flex-wrap gap-3">
  <a
    className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
    href="/pricing"
  >
    Premium を始める — ¥980/月
  </a>
  <a
    className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/80 hover:border-white/60 hover:text-white"
    href="/c/six-nations/2025"
  >
    試合を見る
  </a>
</div>
```

表示条件: 全ユーザーに表示（条件分岐なし）。  
既にサブスク済みのユーザーに料金ページリンクが見えても問題ない。

### 3. フッター（`components/site-footer.tsx`）

現状: 法的ページ 3 リンクのみ

変更後: 2 カラム構成に拡充

```
Tryline

大会                    サービス
Six Nations             料金プラン
Premiership             プライバシーポリシー
URC                     特定商取引法に基づく表記
Top 14                  利用規約
Super Rugby Pacific
Rugby Championship

© 2026 Tryline. All rights reserved.
```

実装方針:
- 大会リンクはハードコードで 6 大会（各 `/c/{family}` ページへ）
- Server Component のまま維持（データフェッチ不要）
- モバイルでは 2 カラムが縦 1 列に折り返す

## 受け入れ条件

- [ ] 未ログイン時のヘッダーに「料金」ナビリンクが表示される
- [ ] ログイン済みユーザーのヘッダーには「料金」リンクが表示されない
- [ ] ホームヒーローに「Premium を始める」ボタンが表示される
- [ ] ホームヒーローの「試合を見る」が `/c/six-nations/2025` に遷移する
- [ ] フッターに主要 6 大会へのリンクが表示される
- [ ] フッターに「料金プラン」リンク（`/pricing`）が表示される
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- ホームヒーローの「試合を見る」リンク先: 固定（`/c/six-nations/2025`）か、
  `getLatestCompetitionWithMatches()` の結果を使う動的 URL か
