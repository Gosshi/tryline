# Codex プロンプト: recap ペイウォールのサーバーサイドゲート化

## 仕様書

`specs/fix-paywall-server-side-gating.md` を読んで実装してください。

## 概要

recap 全文が client component（`PremiumRecapSection`）への prop として RSC ペイロードに平文で埋め込まれ、無料ユーザーもページソースから読めてしまっています。これを「静的ページは無料部分のみ描画 + ロック部分は認証付き API から取得」の構成に直します。あわせて無料/ロックの分割を「先頭2セクション無料・3セクション目以降ロック」に揃えます。

## 着手前の必須確認

published の 4.9.0 recap 実データ1件（`match_content`、content_type=recap, language=ja）の markdown 見出し列を確認し、先頭にタイトル見出しがあるか・セクションが H1 か H2 かを把握してから分割インデックスを確定してください。**正は仕様書の受け入れ条件（無料=核心+全体像 / ロック=ターニングポイント以降）であり、現行関数名 `splitRecapAtThirdHeading` の挙動ではありません。**

## 対象ファイル

1. `lib/match-content/` 配下（新規）— 分割ロジックを `components/match-content.tsx` から移設。**見出し名でなく見出し数ベース**（H1 が1個以下なら H2 フォールバック）。旧5セクション構成の recap も先頭2セクション無料で動くこと
2. `app/api/matches/[id]/recap-locked/route.ts`（新規）— `getUser` / `isPremium`（`lib/auth/server.ts`、参考実装 `app/api/me/premium/route.ts`）でサーバー判定し、Premium のみロック部分 markdown を返す。`Cache-Control: private, no-store`
3. `app/matches/[id]/page.tsx` / `app/matches/[id]/en/page.tsx` — サーバーで分割し無料ブロックのみをクライアントへ。`revalidate = 3600` と `generateStaticParams` は維持（ページ render 内で `getUser()` を呼ばない）
4. `components/premium-recap-section.tsx` — 全文 prop 受けと `/api/me/premium` fetch を廃止し、`recap-locked` fetch に置き換え。Premium はロック部分を追記描画、非 Premium は現行のフェード+CTA（analytics の `cta_id` 等は現行値を維持）
5. `components/match-content.tsx` — 描画 markup は維持しつつ、分割済みブロックを受ける形に調整
6. テスト — API の3分岐（未ログイン / 無料 / Premium）と分割ロジック（4.9.0 構成・旧5セクション構成・H2 フォールバック）

## 変更しないファイル（触らない）

- プレビューの表示（全文無料のまま）
- `lib/sample-matches.ts` とサンプル試合の全文 SSR（意図的な公開。変更禁止）
- `components/match-chat.tsx` の `Paywall`（別 spec）
- `app/api/me/premium/route.ts`（`premium-upsell-banner` / `premium-match-chat` が利用中。削除しない）
- recap 生成プロンプト・パイプライン（`lib/llm/` 配下）

## 確認方法

```bash
pnpm test && pnpm tsc --noEmit && pnpm lint && pnpm build
```

加えて:

1. `next build` の出力で `/matches/[id]` が静的（ISR）のままであること
2. ローカルで未ログインの状態で非サンプル試合ページを `curl` し、ロック対象セクションの本文がレスポンス全体（インライン script 含む）に**含まれない**ことを grep で確認
3. サンプル試合（`PRIMARY_SAMPLE_MATCH_ID`）は全文が静的 HTML に含まれることを同様に確認
4. 非 Premium 表示: 「この試合の核心」「試合全体像」が読め、「次のセクション: ターニングポイント →」のティーザーと CTA が出る

## 完了条件

- 上記の確認がすべて通る（特に curl での リーク0件 と サンプル全文維持 の両立）
- ja / en 両ページに適用済み
- API の3分岐と分割ロジック（新旧構成）のテストが追加されている
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- **PR の base は必ず main にすること**
