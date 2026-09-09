# fix-paywall-view-tracking-article-boundary

> GPT-6 監査 A-3 11（P1）。**課金導線の欠落と計測の欠落を別件として扱う**ための spec。本 spec は計測だけを直す。

## 背景

記事の有料境界に**視認計測が無い**（2026-09-09 実コード確認）。

`components/paywall.tsx:25` が `PaywallViewTracker` を描画し、`components/paywall-view-tracker.tsx:16-21` が mount 時に `trackPaywallView` を発火する。しかし `<Paywall>` の利用箇所は **1 箇所だけ**である。

```
components/match-chat.tsx:327   <Paywall contentType="chat" isPremium={false} matchId={matchId}>
```

一方、記事本文のロック境界は `components/match-content.tsx:396-428` にあり、**`Paywall` を使っていない**。ここにあるのは `TrackedLink` の `cta_click` だけで（`cta_id: "match_content_locked_pricing"` / `cta_location: "match_content_locked_blocks"`）、**境界が画面に出たことを示すイベントが無い**。

したがって「有料境界に到達した人数」と「クリックした人数」を比較できない。**`paywall_view` が 0 件であることを、課金導線が機能していない証拠として読めない。** 記事側の境界は一度も計測されていないからである。

監査の指摘（原文）: 「`MatchContent`のロックCTAは`cta_click`を送るが`PaywallViewTracker`を使わない。Trackerはチャットの`Paywall`にあり、mountで発火する。記事の有料境界露出とイベント0を直接比較できない。」

## スコープ

対象:
- `components/match-content.tsx` のロック境界に視認計測を追加する
- `paywall_view` を、**記事 / チャット**、**未認証 / 無料（ログイン済み非課金）**、**sample**、**match_id** で分離できるようにする
- テスト

対象外:
- **課金導線そのものの変更**（CTA の文言・位置・デザイン）。監査 A-1 8 と A-5 pricing は別項目で、Owner 判断が要る
- `Paywall` コンポーネントを `match-content.tsx` に適用して**見た目をぼかしに変える**こと。現在の記事側はぼかしでなく打ち切り表示で、変更は UI 判断
- チャット側 `match-chat.tsx:327` の既存計測
- GA4 側のレポート作成

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

**見た目を変えない。** 追加するのは計測用の非表示コンポーネントのみ（`PaywallViewTracker` は `return null`）。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. 計測の追加位置

`components/match-content.tsx:396` の `{hasLockedBlocks && showCta && !lockedLoading && (` ブロック内に視認計測を置く。

**`lockedLoading` 中は発火させない。** `:386-394` のスケルトンは境界が確定していない状態で、ここで発火すると読み込みごとに水増しされる。

### 2. 区別すべき軸

`trackPaywallView` の現在の引数は `{ content_type: string; match_id?: string }`（`lib/analytics.ts:126-131`）。**記事とチャットを既に `content_type` で分けられる**が、以下が不足している。

| 軸 | 現状 | 必要な理由 |
|---|---|---|
| 記事 / チャット | `content_type` で可能 | — |
| 未認証 / 無料 | **不可** | 「ログインすれば読める」と「課金しないと読めない」で意味が違う |
| sample | **不可** | 無料サンプルは A-1 6 で差し替え候補。混ざると評価できない |
| 表示面 | **不可** | 記事側は `match_content_locked_blocks`、チャット側は `paywall_overlay` |

`trackPaywallView` の引数を拡張する。**既存の呼び出し元（`components/paywall.tsx:25`）を壊さないこと。** 追加する引数は optional にし、チャット側にも同じ値を渡して両者を同じ軸で比較できるようにする。

### 3. 認証状態の取得

`components/user-state-provider.tsx` が既存の共通パターン（`project_site_performance` 参照）。**Server Component で `getUser()` を無条件に呼ぶ実装を新たに増やさないこと。** 2026-07 に `no-store` 化でホーム・大会ハブ・試合詳細のキャッシュを壊した原因がこれで、#606 / #623 で解消済みである。

## 受け入れ条件

1. `components/match-content.tsx` のロック境界が画面に出たとき、`paywall_view` が 1 回発火する
2. **`lockedLoading` が true の間は発火しない**ことを検証するテストがある
3. 同一マウント内で複数回発火しないことを検証するテストがある
4. `paywall_view` のペイロードで、**記事とチャットを区別できる**
5. `paywall_view` のペイロードで、**未認証と無料（ログイン済み非課金）を区別できる**
6. `paywall_view` のペイロードで、**sample を区別できる**
7. `paywall_view` のペイロードに `match_id` が含まれる
8. `isPremium` が true のとき発火しないことを検証するテストがある
9. **既存の `components/paywall.tsx:25` の呼び出しが型エラーにならず、チャット側の計測が止まらない**
10. **`cta_click`（`cta_id: "match_content_locked_pricing"`）の既存ペイロードに差分が無い**。既存の GA4 集計を壊さない
11. **UI に差分が無い**。DOM 上、追加されるのは `null` を返すコンポーネントのみ
12. Server Component での新規 `getUser()` 呼び出しを追加していない
13. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/components/` 配下（`vitest.config.ts:16` の `exclude` に非該当。確認済み）。結果を PR 本文に貼る。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **これは計測の追加であって、課金導線の改善ではない。** 「有料転換を改善した」と報告しないこと
- **過去の `paywall_view` 0 件は遡って埋まらない。** 計測開始後のデータだけが評価対象
