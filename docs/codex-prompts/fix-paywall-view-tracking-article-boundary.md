仕様書 `specs/fix-paywall-view-tracking-article-boundary.md` を実装してください。**先に全文を読んでください。**

これは **計測の追加**です。課金導線（CTA の文言・位置・デザイン）は変えません。

## 何が問題か

記事の有料境界に視認計測がありません。`<Paywall>`（`components/paywall.tsx:25` で `PaywallViewTracker` を描画）の利用箇所は **1 箇所だけ**です。

```
components/match-chat.tsx:327   <Paywall contentType="chat" ... >   ← チャットだけ
```

記事本文のロック境界は `components/match-content.tsx:396-428` にあり、**`Paywall` を使っていません**。あるのは `TrackedLink` の `cta_click` だけです。

**結果として「境界に到達した人数」と「クリックした人数」を比較できません。** `paywall_view` が 0 件でも、それは記事側が一度も計測されていないからで、導線が壊れている証拠になりません。

## やること

`components/match-content.tsx:396` の `{hasLockedBlocks && showCta && !lockedLoading && (` ブロック内に視認計測を置いてください。

**`lockedLoading` 中は発火させないでください。** `:386-394` のスケルトンは境界が未確定の状態で、ここで発火すると読み込みごとに水増しされます。

`trackPaywallView` の現在の引数は `{ content_type: string; match_id?: string }`（`lib/analytics.ts:126-131`）です。次を区別できるよう拡張してください。

| 軸 | 現状 |
|---|---|
| 記事 / チャット | `content_type` で可能 |
| **未認証 / 無料（ログイン済み非課金）** | 不可 |
| **sample** | 不可 |
| **表示面**（`match_content_locked_blocks` / `paywall_overlay`） | 不可 |

追加する引数は optional にし、**チャット側にも同じ値を渡して**両者を同じ軸で比較できるようにしてください。

## 気をつけること

**Server Component で `getUser()` を無条件に呼ぶ実装を新たに増やさないでください。** 2026-07 にこれでホーム・大会ハブ・試合詳細のキャッシュが `no-store` になり、#606 / #623 で解消した経緯があります。`components/user-state-provider.tsx` が既存の共通パターンです。

## やってはいけないこと

- **UI を変えること。** 追加するのは `return null` のコンポーネントだけです
- `components/match-content.tsx` のロック表示を `Paywall` のぼかしに変えること。現在は打ち切り表示で、変更は UI 判断です
- **`cta_click`（`cta_id: "match_content_locked_pricing"`）の既存ペイロードを変えること。** 既存の GA4 集計が壊れます
- `components/paywall.tsx:25` の呼び出しを壊すこと。チャット側の計測が止まります
- 新しい計測基盤を作ること。`lib/analytics.ts` の既存パターンを使ってください

## 完了の定義

受け入れ条件 1〜13 を満たすこと。特に:

- `lockedLoading` 中は発火しない（条件 2）
- 同一マウント内で複数回発火しない（条件 3）
- 記事 / チャット・未認証 / 無料・sample を区別できる（条件 4〜6）
- **UI に差分が無い**（条件 11）
- `cta_click` の既存ペイロードに差分が無い（条件 10）

テストは `tests/components/` 配下へ（`vitest.config.ts:16` の `exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。メインの作業ツリーは使わないでください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
