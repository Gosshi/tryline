仕様書 `specs/fix-paywall-view-boundary-reach.md` を実装してください。**先に全文を読んでください。**

GPT-6 再監査（2026-09-10）の **N3（P2）**。PR #795 で入れた計測の**条件**を直します。軸（`content_type` / `viewer_type` / `is_sample` / `match_id` / `paywall_location`）は有用なので維持します。

## 何が問題か

`components/paywall-view-tracker.tsx` は認証状態の確定後に effect から即座に送ります。**境界が viewport に入ったかを見ていません。**

記事側の境界は `components/match-content.tsx:401-407`、**記事の末尾**にあります。つまり**記事の上部だけ見て離脱した読者も露出の分母に入ります。**

GPT-6 の観測では、合成 DOM の `hidden` な親に置いても 1 回送信されました。StrictMode の effect 再実行では 2 回送信されました（**開発時の条件であって、本番で常に 2 倍という意味ではありません**）。

証拠: `docs/audits/gpt6-followup-2026-09-10/paywall-observation.test.tsx`

## やること

**記事側だけ**、既存の CTA 要素が viewport に入ったときに一度だけ送ってください。

- **新しい要素を DOM に足さない。** `components/match-content.tsx:407` 以降の既存 CTA（`TrackedLink` またはその親 `div`）に ref を付けて観測する
- `IntersectionObserver` を使う場合、**同一対象への送信済み状態**を保持し、再進入で二重に送らない
- `lockedLoading` 中・`isPremium`・有料部分なしで発火しない現行挙動は維持（#795 のテストが通っています）

## チャット側は変えません（Owner 決定・2026-09-10）

`components/match-chat.tsx:329` の `<Paywall>` は **mount のまま**です。理由は 2 つあります。

1. チャットの既存データが不連続にならない
2. 記事とチャットの直接比較は現在の母数では成立しない（28 日で 228 ユーザー・691 page_view。2026-09-10 GA4 実測）

**その代わり、記事が「到達」・チャットが「mount」であることを、コード上のコメントと `docs/` のいずれかに明記してください。** 後から数字だけ見た人が同じ条件だと誤解しないようにするためです。監査もこれを条件にしています。

## やってはいけないこと

- **チャット側の計測方法を変えること**
- **UI を変えること。** 追加するのは `return null` のコンポーネントと ref だけです
- **`cta_click`（`cta_id: "match_content_locked_pricing"`）の既存ペイロードを変えること**
- 課金導線（CTA の文言・位置・デザイン）を変えること
- 軸（`content_type` / `viewer_type` / `is_sample` / `match_id` / `paywall_location`）を減らすこと

## テストについて

**jsdom には実レイアウトがありません。** `IntersectionObserver` をモックして進入/非進入を制御してください。**実ブラウザのレイアウト計測を主張しないこと。**

テストは `tests/components/`（`exclude` 非該当。確認済み）。

## 完了の定義

受け入れ条件 1〜12 を満たすこと。特に:

- **viewport 外では発火しない**（条件 1）
- **進入時に 1 回だけ**（条件 2）
- **再進入・再レンダリングで二重発火しない**（条件 3）
- **チャット側に差分が無い**（条件 8）
- **UI に差分が無い**（条件 9）
- 記事「到達」/ チャット「mount」の非対称がコメントと文書に書かれている（条件 11）

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**これは計測条件の修正で、有料転換の改善ではありません。** また **GA4 にカスタムディメンションが 1 つも登録されていないため、この軸はまだ標準レポートで取り出せません**（2026-09-10 実測）。登録は Owner の GA4 管理画面での作業で、本 spec の対象外です。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
