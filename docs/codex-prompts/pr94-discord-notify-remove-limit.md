# PR #94 — Discord 通知の件数上限を撤廃

## 背景

`notify-discord` は X 自動投稿時代の名残で `.limit(5)` を設けていたが、
手動投稿フローでは件数制限は不要。
溜まったコンテンツを一度に全件通知できるよう上限を撤廃する。

## スコープ

対象:
- `app/api/cron/notify-discord/route.ts`

対象外:
- その他のロジック変更なし

---

## 変更仕様

`jaResult` と `enResult` それぞれの `.limit(5)` を削除する。

```ts
// Before
.limit(5),

// After
// (limit() 呼び出しを削除)
```

日本語・英語それぞれのクエリから `.limit(5)` を取り除くだけ。

---

## 完了の定義

- [ ] `app/api/cron/notify-discord/route.ts` の `.limit(5)` が両クエリから削除されている
- [ ] TypeScript エラーなし・`pnpm build` 通過
