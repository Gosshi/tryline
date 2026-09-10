# fix-newsletter-result-page-accuracy

> GPT-6 監査 A-5 の newsletter 3 項目（confirmed P1 / expired P1 / invalid-link P2）をまとめて扱う。同一ルート `app/api/newsletter/confirm/route.ts` と 3 つの結果ページの問題で、別々に直すと文言と分岐が食い違う。

## 背景

2026-09-09 に実コードを確認した。3 つとも事実である。

### (1) 到達と確認完了が結びついていない（confirmed・P1）

`app/newsletter/confirmed/page.tsx:10` が `<NewsletterConfirmedTracker />` を無条件に描画し、`components/newsletter-confirmed-tracker.tsx:8-10` が **mount しただけで `trackNewsletterConfirmed()` を発火**する。

DB の確認処理は `app/api/newsletter/confirm/route.ts:35-46` にあり、ページとは切り離されている。**URL を直接開いても、リロードしても、`newsletter_confirmed` は発火する。** ページ閲覧数と DB の `status = "confirmed"` 件数は一致しない。

監査の指摘（原文）: 「ページに来たこととDBの確認完了が同義ではない。」

### (2) 再申込を案内してカレンダーへ送る（expired・P1）

`app/newsletter/expired/page.tsx:11-12` の本文は「もう一度ニュースレターの**登録フォーム**からお申し込みください」。しかし `:15` のリンク先は `/calendar`、ラベルは「カレンダーへ戻る」。**言っていることとリンク先が違う。**

**制約（重要）**: 登録フォームの専用ページは存在しない。`components/newsletter-signup.tsx` は 3 ページに埋め込まれているだけである。

```
app/page.tsx:329                        <NewsletterSignup source="home" />
app/calendar/page.tsx:270               <NewsletterSignup source="calendar" />
app/c/[competition]/[season]/page.tsx:879  <NewsletterSignup source="competition" />
```

`NewsletterSignup` に id / anchor は無い（`components/newsletter-signup.tsx` 確認済み）。**「登録フォームへ直接戻す」には、アンカーを付けるか導線を作る必要がある。** 存在しないページへリンクさせないこと。

`NewsletterSource` は `"calendar" | "competition" | "home"` の union（`lib/analytics.ts:17`）。**再申込の流入を既存 3 値のどれかに混ぜると、元の面の実績が汚れる。**

### (3) 5 つの異なる事象が同じ画面になる（invalid-link・P2）

`app/api/newsletter/confirm/route.ts` は **4 箇所**で `invalid-link` へ飛ばす。

| 行 | 事象 | 利用者にとっての意味 |
|---|---|---|
| `:14` | token が無い | リンクが壊れている |
| `:25` | DB エラー / 該当なし / `status !== "pending"` | **3 つが混在** |
| `:47` | `update` が失敗した | **サーバー側の障害** |

`:25` の `status !== "pending"` には「**すでに confirmed**」が含まれる。これは「手続き済み」であって無効ではない。`:47` に至っては**こちらの障害を「あなたのリンクが無効」と表示している**。

画面文言は「すでに手続き済みか、リンクが無効になっています」（`app/newsletter/invalid-link/page.tsx:11-12`）で、利用者は次に何をすればよいか判断できない。

## スコープ

対象:
- `newsletter_confirmed` を**実際の確認処理の成否**に結びつける
- `expired` の導線を、実在する登録フォームへ戻す
- `invalid-link` を、少なくとも「手続き済み」「リンク無効/期限切れ」「サーバー障害」に分ける
- テスト

対象外:
- `unsubscribed`（`app/newsletter/unsubscribed/page.tsx`）。監査は「明快」と評価しており変更不要
- **確認メールのテンプレート**。`reference_supabase_auth_email_template` のとおり Web/モバイル共用で、`{{ .Token }}` と `{{ .ConfirmationURL }}` の両方が必須。触らない
- 登録フォーム自体のデザイン・配置（A-1 7 は計測先行で別項目）
- `CONFIRMATION_TOKEN_MAX_AGE_MS`（24時間）の値の変更
- **本人の明示操作なしに再購読させること**。監査も明記している

## データモデル変更

なし。`email_subscribers` の既存列（`id` / `status` / `created_at` / `confirmation_token` / `confirmed_at`）だけを使う。

## API サーフェス

`app/api/newsletter/confirm/route.ts` のリダイレクト先を分岐させる。**新しい API ルートは作らない。**

サーバー障害（`:47` の `updateError`）を利用者の入力ミスとして表示しないこと。**ただしエラーの詳細を画面に出さないこと**（`console.error` は現状どおり残す）。

## UI サーフェス

`app/newsletter/expired/page.tsx` / `app/newsletter/invalid-link/page.tsx` の文言と導線。`app/newsletter/confirmed/page.tsx` の計測。

**新しいページを増やすかは実装判断でよい**が、増やす場合も `app/newsletter/` 配下に揃えること。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. confirmed の計測

`newsletter_confirmed` が、**実際に `status` が `pending` → `confirmed` に変わった遷移でだけ**発火するようにする。リロードや直接アクセスで発火しないこと。

実現方法は実装判断でよいが、**確認処理の成否をページ側が知れる形にすること**。`lib/analytics.ts` の既存パターンに従い、新しい計測基盤を作らない。

### 2. expired の導線

**実在する場所へ送ること。** `NewsletterSignup` が埋め込まれた 3 ページのいずれかにアンカーを付けて、そこへ戻すのが最小の変更である。

再申込の流入を区別したい場合、`NewsletterSource`（`lib/analytics.ts:17`）に値を足してよい。**既存 3 値の意味は変えないこと。**

### 3. invalid-link の分岐

最低限、次の 3 つを区別する。

| 事象 | 利用者への案内 |
|---|---|
| すでに確認済み（`status === "confirmed"`） | 手続きは完了している。何もしなくてよい |
| token 無し / 該当なし / 期限切れ | 登録フォームから再申込 |
| `update` 失敗（サーバー障害） | 時間をおいて再試行。**利用者の落ち度としない** |

`status` が `unsubscribed` の場合の扱いも決めること。**無断で再購読させないこと。**

## 受け入れ条件

1. **`status` が `pending` → `confirmed` に変わったときだけ `newsletter_confirmed` が発火する**ことを検証するテストがある
2. **`/newsletter/confirmed` を直接開いただけでは発火しない**ことを検証するテストがある
3. **リロードで二重発火しない**ことを検証するテストがある
4. `expired` の導線が、`NewsletterSignup` が実在するページを指していることを検証するテストがある。**`/calendar` に戻すだけの状態でないこと**
5. すでに `status === "confirmed"` の token で、「手続き済み」と分かる画面になることを検証するテストがある
6. **`update` 失敗（`:47`）が「リンクが無効」として表示されない**ことを検証するテストがある
7. token 無し（`:14`）と該当なし（`:25`）が、再申込を案内する画面になることを検証するテストがある
8. `status === "unsubscribed"` の token で**再購読が起きない**ことを検証するテストがある
9. **`CONFIRMATION_TOKEN_MAX_AGE_MS` に差分が無い**
10. **`NewsletterSource` の既存 3 値（`calendar` / `competition` / `home`）の意味に差分が無い**
11. 確認メールのテンプレートに差分が無い
12. `app/newsletter/unsubscribed/page.tsx` に差分が無い
13. **エラーの詳細（DB のエラーメッセージ等）が画面に出ない**
14. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/api/` と `tests/app/` 配下。`vitest.config.ts:16` の `exclude` は `tests/api/ingest-lineups.test.ts` と `tests/api/ingest-squads.test.ts` だけなので、newsletter 系は該当しない（確認済み）。結果を PR 本文に貼る。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **過去の `newsletter_confirmed` は遡って補正されない。** 到達ベースの旧データと混ぜて評価しないこと
- **登録フォームの配置・文言は変えない。** A-1 7 は「submit/result/確認実績で摩擦箇所を特定してから移動」で、計測先行の項目である
