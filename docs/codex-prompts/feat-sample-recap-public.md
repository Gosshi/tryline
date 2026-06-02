# Codex プロンプト: サンプル recap の公開（非ペイウォール化）— O2

`specs/feat-sample-recap-public.md` を実装してください。少数の固定サンプル試合の recap を**ペイウォール無しでサーバーサイド全文レンダリング**し、未課金/ログアウト/クローラ/SNS でも読める「無料サンプル」にします。転換（try-before-buy）と配布（シェア可能資産）の同時解消が狙い。

## コンテキスト
- `CLAUDE.md` の規約を読む。設計は `docs/architecture.md`、過去判断は `docs/decisions.md`。
- 現状 recap は `components/premium-recap-section.tsx`（client で `/api/me/premium` を見てゲート）→ `MatchContentSection` で teaser+paywall。preview は無料（`pr100-preview-always-free`）。

## 確定方針（spec より）
- **方針 A**: `SAMPLE_MATCH_IDS`（`lib/` の定数）＋ `isSampleMatch(matchId)` ヘルパー。マイグレーション無し。
- **recap 全文公開**（部分公開はしない）。
- サンプル試合 8件は **spec の「確定」テーブルの match_id をそのまま定数に**（全て2026年5月の現行シーズン試合）。

## 実装
1. `lib/sample-matches.ts` に `SAMPLE_MATCH_IDS: readonly string[]`（spec の8 match_id）と `isSampleMatch(matchId: string): boolean` を追加。1箇所管理・差し替え容易。
2. `app/matches/[id]/page.tsx`（recap 描画箇所・`PremiumRecapSection` 付近 L310）で分岐:
   - **サンプル試合**: `PremiumRecapSection`（client ゲート）を**使わず**、recap を `MatchContentSection`（`isPremium={true}` 相当＝全文）で**サーバーサイド描画**。初期 HTML に recap 全文が入ること。
   - **非サンプル試合**: 従来どおり `PremiumRecapSection`（変更しない）。
3. `app/matches/[id]/en/page.tsx` も同様に分岐（英語 recap がある場合のみ全文公開）。
4. **無料サンプル明示＋CTA**: サンプル recap の末尾に「これは無料サンプルです。他の全試合のレビューは Premium（¥980/月・7日間無料トライアル）で」を表示し pricing/トライアルへ誘導。`components/paywall.tsx` / `premium-upsell-banner.tsx` を**本文を隠さないバナー型**に流用。
5. **GA 計測**: サンプル経由のトライアル/Premium CTA クリックを既存 GA イベント方式で計測。

## 必ず処理すべきエッジケース
1. サンプル試合でも recap が未生成（draft/無し）の場合は通常の空状態にフォールバック（全文公開は recap が published のときのみ）。
2. 未ログイン・未課金で**サンプルは全文・非サンプルは従来どおり paywall**（取り違えない）。
3. canonical / `/api/og` OGP は既存のまま（変更不要・サンプルも通常 match URL）。
4. サンプル判定は `/` と `/en` の両方で機能。
5. premium ユーザーがサンプルを見ても二重 CTA 等で崩れない（全文は同じ、CTA はサンプル明示のみ）。

## テスト
- `isSampleMatch` の単体テスト。
- サンプル match ページが recap 全文を**サーバー描画**する（`PremiumRecapSection` を使わない）こと、非サンプルは従来どおりであることのページ/コンポーネントテスト。

## 完了の定義
- サンプル match の `/matches/[id]` がログアウトでも recap 全文を初期 HTML に含む（`curl -s <url> | grep <本文の一節>` で確認可能）。
- 非サンプルは従来どおり paywall。
- サンプルに「無料サンプル」明示＋CTA、本文は隠れない。
- `pnpm typecheck` / `pnpm build` / `pnpm test`（全件）グリーン。
- 変更ファイル・サンプル定数の場所・未解決質問を末尾に要約。

## 完了時に報告してほしいこと
- サンプル定数の場所と差し替え方法。
- サンプル/非サンプルの分岐箇所（`/` と `/en`）。
- ログアウト時にサンプル recap 全文が HTML に出ることの確認方法。

## Owner 側の後続（対象外）
デプロイ後、サンプル URL を X bio / 固定ポスト / note に貼って配布資産として使う（[[project-growth-strategy]]）。サンプルはシーズン進行で月1程度入れ替え推奨。
