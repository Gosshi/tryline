# ログインモーダルへの課金文脈追加

## 背景

料金ページの「Premium を始める — ¥980/月」ボタンをクリックすると、
タイトルが「ログイン」のみのモーダルが表示される。
ユーザーはなぜ突然ログイン画面が出たか分からず、
「Premium を購入しようとしたのにログインを求められた」という混乱が生じ離脱リスクが高い。

モーダルタイトルと説明文を文脈に応じて切り替えることで、
「ログインしたら決済に進む」という流れを明示し転換率を改善する。

## スコープ

対象:
- ログインモーダルを表示するコンポーネント（`components/login-modal.tsx` または相当）
- 料金ページの「Premium を始める」ボタン（`app/pricing/page.tsx` または相当）
- 試合詳細の paywall CTA（`components/match-content.tsx` または相当）

対象外:
- 認証ロジック・Stripe との連携処理
- ログイン後の遷移先（既存動作を維持）

## 変更内容

### ログインモーダルに `intent` prop を追加

```tsx
type LoginModalProps = {
  intent?: "login" | "subscribe";
};
```

| intent | タイトル | サブテキスト |
|--------|----------|-------------|
| `"login"`（デフォルト） | ログイン | なし（現状維持） |
| `"subscribe"` | Premium を始める | ログイン後、自動的に決済ページに移動します。 |

### 料金ページ・paywall CTA からの呼び出し

「Premium を始める」ボタン押下時に `intent="subscribe"` を渡す。

```tsx
<LoginModal intent="subscribe" />
```

### モーダル内 UI 変更

```tsx
<h2>{intent === "subscribe" ? "Premium を始める" : "ログイン"}</h2>
{intent === "subscribe" && (
  <p className="mt-1 text-sm text-slate-500">
    ログイン後、自動的に決済ページに移動します。
  </p>
)}
```

## 変更ファイル

- `components/login-modal.tsx`（または LoginModal 相当コンポーネント）
- `app/pricing/page.tsx`
- `components/match-content.tsx`（paywall CTA がモーダルを開く場合）

## 受け入れ条件

- [ ] 料金ページの「Premium を始める」を押すと、モーダルタイトルが「Premium を始める」になる
- [ ] モーダル内に「ログイン後、自動的に決済ページに移動します。」という説明文が表示される
- [ ] ヘッダーの「ログイン」ボタンからモーダルを開いた場合はタイトルが「ログイン」のまま（既存動作維持）
- [ ] 試合詳細の paywall CTA からモーダルを開いた場合も `intent="subscribe"` が渡る
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
