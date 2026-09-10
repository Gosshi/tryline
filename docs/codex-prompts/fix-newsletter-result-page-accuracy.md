仕様書 `specs/fix-newsletter-result-page-accuracy.md` を実装してください。**先に全文を読んでください。**

監査の newsletter 3 項目（confirmed / expired / invalid-link）を **1 本にまとめています**。同一ルートと 3 ページの問題で、別々に直すと文言と分岐が食い違うためです。

## 3 つの事実（2026-09-09 実コード確認）

**(1) 到達と確認完了が結びついていない**

`app/newsletter/confirmed/page.tsx:10` が `<NewsletterConfirmedTracker />` を無条件に描画し、`components/newsletter-confirmed-tracker.tsx:8-10` が **mount しただけで発火**します。DB 更新は `app/api/newsletter/confirm/route.ts:35-46` にあり、ページと切り離されています。**URL を直接開いてもリロードしても発火します。**

**(2) 再申込を案内してカレンダーへ送っている**

`app/newsletter/expired/page.tsx:11-12` は「もう一度ニュースレターの**登録フォーム**からお申し込みください」と書きながら、`:15` のリンク先は `/calendar`、ラベルは「カレンダーへ戻る」です。

**制約（重要）**: **登録フォームの専用ページは存在しません。** `components/newsletter-signup.tsx` は 3 ページに埋め込まれているだけで、id / anchor もありません。

```
app/page.tsx:329                           <NewsletterSignup source="home" />
app/calendar/page.tsx:270                  <NewsletterSignup source="calendar" />
app/c/[competition]/[season]/page.tsx:879  <NewsletterSignup source="competition" />
```

**存在しないページへリンクさせないでください。** アンカーを付けるか導線を作る必要があります。

**(3) 5 つの事象が同じ画面になる**

`app/api/newsletter/confirm/route.ts` は 4 箇所で `invalid-link` へ飛ばします。

```
:14   token が無い
:25   DB エラー / 該当なし / status !== "pending"   ← 3つが混在
:47   update が失敗した                             ← サーバー側の障害
```

`:25` の `status !== "pending"` には「**すでに confirmed**」が含まれます。これは手続き済みであって無効ではありません。`:47` に至っては**こちらの障害を「あなたのリンクが無効」と表示しています。**

## やること

1. `newsletter_confirmed` が、**`status` が `pending` → `confirmed` に変わった遷移でだけ**発火するようにする
2. `expired` の導線を、`NewsletterSignup` が実在するページへ戻す
3. `invalid-link` を、最低限「手続き済み」「リンク無効/期限切れ」「サーバー障害」に分ける

`NewsletterSource` は `"calendar" | "competition" | "home"` の union（`lib/analytics.ts:17`）です。再申込の流入を区別したいなら値を足して構いませんが、**既存 3 値の意味は変えないでください**（元の面の実績が汚れます）。

## やってはいけないこと

- **確認メールのテンプレートを触ること。** Web/モバイル共用で `{{ .Token }}` と `{{ .ConfirmationURL }}` の両方が必須です。片方を消すと片方のログインが壊れます
- `app/newsletter/unsubscribed/page.tsx` を変えること。監査は「明快」と評価しています
- **本人の明示操作なしに再購読させること。** `status === "unsubscribed"` の token で再購読が起きないこと
- `CONFIRMATION_TOKEN_MAX_AGE_MS`（24時間）の値を変えること
- **エラーの詳細を画面に出すこと。** `console.error` は現状どおり残してください
- 新しい API ルートを作ること
- 登録フォーム自体のデザイン・配置を変えること（監査 A-1 7 は計測先行の別項目です）

## 完了の定義

受け入れ条件 1〜14 を満たすこと。特に:

- 直接アクセス・リロードで発火しない（条件 2・3）
- **`expired` が `/calendar` に戻すだけの状態でない**（条件 4）
- **`update` 失敗が「リンクが無効」として表示されない**（条件 6）
- `unsubscribed` の token で再購読が起きない（条件 8）
- `NewsletterSource` の既存 3 値の意味に差分が無い（条件 10）

テストは `tests/api/` と `tests/app/` 配下へ。`exclude` は `tests/api/ingest-lineups.test.ts` と `tests/api/ingest-squads.test.ts` だけなので newsletter 系は該当しません（確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
