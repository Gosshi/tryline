# 試合ページ: AI チャットをスコア直下に移動

## 背景

`app/matches/[id]/page.tsx:238` で `PremiumMatchChat` はページ最下部に配置されており、
プレビュー・レビュー・ラインナップセクションを全スクロールした後にしか到達できない。

AI チャットは Tryline Premium の最大差別化機能であるにもかかわらず、
ほとんどのユーザーが存在を認識しないまま離脱している。

```tsx
// 現状（最下部）
<MatchEventsSection ... />
<MatchLineupsSection ... />
<section> {/* preview + recap */} </section>
<PremiumMatchChat matchId={id} />  // ← ここ
```

## スコープ

対象:
- `app/matches/[id]/page.tsx` — `PremiumMatchChat` の配置位置変更
- `app/matches/[id]/en/page.tsx` — 英語版も同様に対応

対象外:
- チャットの機能自体（API・プロンプト）の変更

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 配置変更

`PremiumMatchChat` を `MatchHeader`（スコア表示）の直後、
`MatchEventsSection` の前に移動する。

```tsx
// 変更後（スコア直下）
<MatchHeader match={match} />
<PremiumMatchChat matchId={id} />  // ← スコアの直下
<MatchEventsSection ... />
<MatchLineupsSection ... />
<section> {/* preview + recap */} </section>
```

非 Premium ユーザーにはスコア直下でアップセル訴求が表示されることになり、
購買動機としても機能する。チャットの表示条件（Premium 判定ロジック）は変更しない。

## LLM 連携

なし（配置変更のみ）

## 受け入れ条件

1. `PremiumMatchChat` が `MatchHeader` の直後に配置されている
2. `MatchEventsSection`・`MatchLineupsSection`・コンテンツセクションはチャットの下に来る
3. `app/matches/[id]/en/page.tsx` も同様に対応されている
4. Playwright でモバイル（375px）のスクリーンショットを撮り、
   チャットがスクロール 2 回以内に見える位置にあることを確認
5. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `PremiumMatchChat` がサーバーコンポーネントかクライアントコンポーネントかを確認し、
  スコア直下への移動で SSR / hydration の問題が起きないことを確認すること
