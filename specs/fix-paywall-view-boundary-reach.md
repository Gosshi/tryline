# fix-paywall-view-boundary-reach

> GPT-6 再監査（2026-09-10）**N3（P2）**。記事の `paywall_view` が mount で発火し、有料境界への**到達**を測っていない。

## 背景

`components/paywall-view-tracker.tsx` は、認証状態の確定後に effect から即座にイベントを送る。**境界が viewport に入ったかを確認していない。**

記事側の設置は `components/match-content.tsx:401-407`。

```tsx
{hasLockedBlocks && showCta && !lockedLoading && (
  <>
    <PaywallViewTracker contentType={...} isSample={...} matchId={...}
      paywallLocation="match_content_locked_blocks" />
    <div className="mt-4 flex flex-col items-center gap-3 text-center">
      ...
      <TrackedLink analytics={{ cta_id: "match_content_locked_pricing", ... }}>
```

境界は記事の**末尾**にある。**記事の上部だけを見て離脱した読者も、露出の分母に入る。**

PR #795 で入れた軸（`content_type` / `viewer_type` / `is_sample` / `match_id` / `paywall_location`）は有用だが、**それだけでは spec が要求した「有料境界に到達した人数」を測れない。**

GPT-6 の観測: 合成 DOM の `hidden` な親に置いても 1 回送信された。StrictMode の effect 再実行では 2 回送信された（**開発時の再実行条件の証拠であり、本番で常に 2 倍になるという意味ではない**）。jsdom の結果を実ブラウザのレイアウト計測としては扱っていない。証拠: `docs/audits/gpt6-followup-2026-09-10/paywall-observation.test.tsx`。

### 記事とチャットで測定条件が非対称になる（Owner 決定・2026-09-10）

**記事は「到達」、チャットは「mount」に分かれる。**

`components/match-chat.tsx:329` の `<Paywall>` は現状どおり mount で発火させる。理由は 2 つ。

1. **チャットの既存データが不連続にならない。** 変えると今日までの計測と比較できなくなる
2. **記事とチャットの直接比較は、現在の母数では成立しない。** 28 日で 228 ユーザー・691 page_view（2026-09-10 GA4 実測）。有意差の議論にならない

監査も「チャットの既存 mount 計測を維持する場合は、記事到達とは測定条件が異なることを明記する」としている。**明記することが条件。**

## スコープ

対象:
- 記事側の `paywall_view` を、境界の可視化時に一度だけ送る
- 同一対象への二重送信を防ぐ
- 記事とチャットで測定条件が異なることをコード上と文書に明記する
- テスト

対象外:
- **チャット側（`components/match-chat.tsx:329` の `<Paywall>`）の計測方法**。mount のまま
- **課金導線そのものの変更**（CTA の文言・位置・デザイン）
- **見た目の変更**
- GA4 側のレポート作成・カスタムディメンション登録（**Owner の GA4 管理画面。別件**）

## データモデル変更 / API サーフェス

なし。

## UI サーフェス

**見た目を変えない。** `PaywallViewTracker` は `return null` のまま。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. 既存の CTA 要素を観測する

**新しい要素を DOM に足さない。** `components/match-content.tsx:407` 以降の既存 CTA 要素（`TrackedLink` またはその親 `div`）を参照し、**viewport 内に入ったときに一度だけ**送る。

`IntersectionObserver` を使う場合、**同一対象への送信済み状態**を保持し、再進入で二重に送らないこと。

**`return null` と「見た目を変えない」は、既存要素の監視と両立する。** ref を既存要素に付ける形でよい。

### 2. 発火しない条件は維持する

`lockedLoading` 中、`isPremium` のとき、有料部分が無いときは**従来どおり発火しない**（#795 のテストが通っている）。

### 3. 非対称であることの明記

`paywall_location` は既に `match_content_locked_blocks` / `paywall_overlay` で分かれている。**それに加えて、記事が「到達」・チャットが「mount」であることを、コード上のコメントと `docs/` のいずれかに残す。** 後から数字だけを見た人が、両者を同じ条件だと誤解しないようにする。

## 受け入れ条件

1. **境界が viewport 外にある間は `paywall_view` が発火しない**ことを検証するテストがある
2. **境界が viewport 内に入ったとき 1 回だけ発火する**ことを検証するテストがある
3. **再進入・再レンダリングで二重に発火しない**ことを検証するテストがある
4. `lockedLoading` が true の間は発火しないことを検証するテストがある（#795 の既存テストを壊さない）
5. `isPremium` のとき発火しないことを検証するテストがある
6. 有料部分が無い記事で発火しないことを検証するテストがある
7. **`content_type` / `viewer_type` / `is_sample` / `match_id` / `paywall_location` の各軸が維持されている**
8. **チャット側（`components/match-chat.tsx:329`）の計測に差分が無い**
9. **UI に差分が無い**。DOM 上、追加されるのは `null` を返すコンポーネントと ref だけ
10. **`cta_click`（`cta_id: "match_content_locked_pricing"`）の既存ペイロードに差分が無い**
11. 記事が「到達」・チャットが「mount」であることが、コメントと文書に書かれている
12. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/components/`（`exclude` 非該当。確認済み）。**jsdom には実レイアウトが無いので、`IntersectionObserver` はモックして進入/非進入を制御すること。** 実ブラウザのレイアウト計測を主張しない。

## 未解決の質問

なし。**記事のみ viewport 計測に変えることは 2026-09-10 に Owner が決定済み。**

**本 spec で解決しないと明示するもの**:

- **これは計測条件の修正であって、有料転換の改善ではない**
- **これまでの `paywall_view` は「露出」で、以後は「到達」。混ぜて評価できない。** #795 のマージが 2026-09-10 なので実データはほぼ無く、実害は小さい
- **GA4 にカスタムディメンションが 1 つも登録されていないため、この軸はまだ標準レポートで取り出せない**（2026-09-10 実測）。登録は Owner の GA4 管理画面での作業で、本 spec の対象外
