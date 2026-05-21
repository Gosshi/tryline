# PR #95 — 大会名の重複表示を修正

## 背景

Discord 通知の embed タイトルおよびツイートドラフトに
`"URC 2025-26 2025-26"` のように大会名とシーズンが重複して表示される。

原因: `competitions.name` にはすでにシーズンが含まれている（例: `"URC 2025-26"`）のに、
`notify-discord/route.ts` で `name + " " + season` と結合しているため。

## スコープ

対象:
- `app/api/cron/notify-discord/route.ts`

対象外:
- `competitions` テーブルのデータ変更なし
- 他ファイルの変更なし

---

## 変更仕様

`route.ts` の `competitionLabel` 生成を以下のように変更する:

```ts
// Before
const competitionLabel = [competition?.name, competition?.season]
  .filter(Boolean)
  .join(" ");

// After
const competitionLabel = competition?.name ?? "";
```

---

## 完了の定義

- [ ] Discord embed タイトルが `"URC 2025-26 2025-26"` でなく `"URC 2025-26"` になっている
- [ ] TypeScript エラーなし・`pnpm build` 通過
