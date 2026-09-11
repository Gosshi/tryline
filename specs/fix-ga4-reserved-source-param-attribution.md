仕様書 `specs/fix-ga4-reserved-source-param-attribution.md` を実装してください。**先に全文を読んでください。**

**最優先です。集客判断の土台が汚染されています。**

## 何が起きているか

GA4 property `538067713`、2026-08-14〜09-10（28 日）の実測。

```
sessionSource  sessionMedium   users  sessions
bing           organic          102     113
(direct)       (none)            60      62
google         organic           31      36
home           (not set)          7      26   ← 実在しない流入元
competition    (not set)          6       7   ← 同上
calendar       (not set)          1       4   ← 同上
```

**3 値とも `lib/analytics.ts:17` の `NewsletterSource` と完全一致**し、`sessionMedium` が `(not set)` です。**37 セッション / 全 325 = 11.4% の流入元が上書きされています。**

機序はこれです。

```ts
lib/analytics.ts:136  trackNewsletterView(params: { source: NewsletterSource })
                :137    trackEvent("newsletter_view", params)
                :88     window.gtag("event", eventName, params)
```

**`gtag` に `source` という名前のパラメータが渡っています。** GA4 は `source` / `medium` / `campaign` 等を流入元の指定として扱うため、イベント送信のたびにセッションの流入元が上書きされます。

該当は 4 箇所です（`trackEvent` 呼び出し 11 件を全数確認）。

```
lib/analytics.ts:136  trackNewsletterView
                :140  trackNewsletterSubmit
                :145  trackNewsletterResult
                :105  trackFavoriteTeamAdded    ← components/team-picker.tsx:51 が "team_picker" を渡す
```

`medium` / `campaign` / `term` / `content` を送っている箇所はありません。

## やること

`source` を予約名と衝突しない名前に変えてください。**名前は実装が決めて構いませんが、4 箇所で同じ命名規則にしてください**（newsletter と favorite で別の流儀にしない）。

**採用した名前と、予約名と衝突しないと判断した根拠を PR 本文に書いてください。**

## 連続性が切れます

改名すると過去のイベントデータと別のパラメータになります。`newsletter_view` は 90 日で 154 件あります。**避けられません** — 予約名のまま残すと汚染が続きます。

**新旧を混ぜて集計しない**旨を、コメントか `docs/measurement-plan-2026-06.md` に残してください。

## やってはいけないこと

- **`NewsletterSource` の値（`calendar` / `competition` / `home`）を変えること。** 変えるのは**キー名**であって値ではありません
- 他のイベントパラメータ（`cta_id` / `cta_location` / `paywall_location` / `viewer_type` / `is_sample` / `match_id`）を変えること。予約名ではありません
- GA4 管理画面の設定に言及した実装をすること。カスタムディメンション登録は Owner の作業です
- GTM 設定を触ること

## 完了の定義

受け入れ条件 1〜9 を満たすこと。特に:

- **`gtag("event", ...)` に渡る params に `source` / `medium` / `campaign` / `term` / `content` が 1 つも含まれない**（条件 2）。**関数ごとではなく `trackEvent` を通る全イベントに対して**検証してください
- 4 箇所が同じ命名規則（条件 3）
- **`NewsletterSource` の値に差分が無い**（条件 5）
- 他のイベントパラメータに差分が無い（条件 6）

テストは `tests/lib/`（`exclude` 非該当。確認済み）。既存の `tests/lib/analytics-gtag-queue.test.ts` を壊さないでください。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**過去 28 日の 37 セッションは復元できません。** 「流入元を直した」ではなく「壊すのをやめた」です。改名しても標準レポートで分解できるようにはなりません（カスタムディメンション未登録のため）。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
