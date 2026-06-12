# レビュー（recap）ペイウォールのサーバーサイドゲート化

## 背景

ロックしたはずの recap 全文が、無料・未ログインを含む全訪問者に配信されている。

- リーク経路: `components/premium-recap-section.tsx`（`"use client"`）が `content`（recap 全文の `contentMdJa`）を prop で受けるため、**全文が RSC ペイロードとしてページ HTML（インライン script）に平文で埋め込まれる**。呼び出し元は `app/matches/[id]/page.tsx` と `app/matches/[id]/en/page.tsx`
- Premium 判定はクライアントの `fetch("/api/me/premium")` のみ。表示上の分割（`components/match-content.tsx` の `splitRecapAtThirdHeading`）はクライアントで行われるため、ページソースを見れば誰でも全文を読める
- 副作用として、Premium ユーザーには判定 fetch が返るまでロック済み表示が一瞬見える（paywall のフラッシュ）

あわせて、無料/ロックの分割位置を見直す。recap は本日 recap@4.9.0 に刷新済みで、セクション構成は「# この試合の核心 / # 試合全体像 / # ターニングポイント / # 次戦への示唆」の4部（MOM 分析は「ターニングポイント」末尾に統合済み）。**Owner 内諾済みの分割方針: 無料=「この試合の核心」+「試合全体像」（先頭2セクション）、ロック=「ターニングポイント」+「次戦への示唆」**。

> 注（実装前に要検証）: 本ブランチ（332f015）の `splitRecapAtThirdHeading` は「3つ目の H1 以降をロック」と読める一方、別セッションのコード検証では「現行ではロックされるのは『次戦への示唆』1本のみ」とされており、認識が食い違っている。recap 本文に先頭タイトル見出しが含まれるか等で1つずれる可能性があるため、**published の 4.9.0 recap 実データ1件の見出し列を確認してから分割インデックスを確定すること**。正とするのは下記「受け入れ条件」の表示結果であり、関数名や現行実装ではない。

## スコープ

対象:
- `app/matches/[id]/page.tsx` / `app/matches/[id]/en/page.tsx` — recap の無料部分のみをサーバーで分割・描画
- `components/premium-recap-section.tsx` — 全文 prop 渡しの廃止、ロック部分の認証付き取得への置き換え
- `components/match-content.tsx` — 分割ロジックの移設・分割位置の変更（描画 markup は維持）
- 新規 API ルート（ロック部分の配信、サーバー側 Premium 判定）

対象外:
- プレビュー（全文無料のまま）
- サンプル8試合（`lib/sample-matches.ts`。全文を静的 HTML に含めたまま＝SEO 用に意図的に公開）
- AI チャットの `Paywall`（blur 方式。`components/match-chat.tsx`）— 同種の課題だが別 spec
- recap 生成プロンプト・パイプライン（分割はレンダリング側で独立しており、再生成バッチとは無関係）
- `/api/me/premium` ルート自体（`premium-upsell-banner` / `premium-match-chat` が利用中のため残す）

## データモデル変更

なし

## API サーフェス

新規: `GET /api/matches/[id]/recap-locked?lang=ja|en`

- サーバー側で `getUser()` + `isPremium(user.id)`（`lib/auth/server.ts:30,62`。実装例は `app/api/me/premium/route.ts`）を判定
- Premium: `200 { isPremium: true, lockedMd: string }`（ロック部分の markdown のみ）
- 非 Premium / 未ログイン: `200 { isPremium: false, lockedMd: null }`（**ロック本文を一切含めない**）
- recap が存在しない / 全文無料（サンプル）の場合: `lockedMd: null`
- `Cache-Control: private, no-store`（共有キャッシュ厳禁）

## UI サーフェス

### アーキテクチャ

両試合ページは `revalidate = 3600` + `generateStaticParams` の静的レンダリングであり、ページ内で `getUser()` を呼ぶと静的化が壊れる。よって:

1. **サーバー（静的ページ）**: recap markdown をサーバーで分割し、**無料ブロックのみ**をクライアントコンポーネントに渡して描画する。ロック部分のテキストは RSC ペイロードに含めない。あわせて `hasLocked: boolean` と「次のセクション」見出しテキスト（現行のティーザー表示用）を渡す
2. **クライアント**: `hasLocked` の場合のみ `/api/matches/[id]/recap-locked` を fetch。`isPremium: true` ならロック部分を無料部分の直後に描画、`false` なら現行どおりフェード+CTA（`match_content_locked_pricing` の analytics はそのまま）
3. 分割関数（`splitRecapAtThirdHeading` / `splitAtSecondHeading`）は `lib/match-content/` 配下へ移設し、ページ（server）と API ルートの両方から import する。`components/match-content.tsx` には描画のみ残す

### 分割ルール（見出し数ベースを維持）

- **見出し名でのマッチングは禁止**。published には旧5セクション構成（「# 注目選手」あり・lineups 有無分岐の世代）も残存するため、見出し**数**ベースを維持する
- ルール: ドキュメントが実際に使っているトップレベル見出し（H1。H1 が1個以下なら H2 にフォールバック）を「セクション」とし、**先頭2セクション＝無料、3セクション目以降＝ロック**
- 4.9.0 構成での結果: 無料=核心+全体像 / ロック=ターニングポイント+次戦への示唆
- 旧5セクション構成での結果: 先頭2セクション無料・残り3セクションロック（現行で旧構成が全文無料になっている場合、その挙動は本 spec で是正される）

## LLM 連携

なし（レンダリングと配信制御のみ）

## 受け入れ条件

1. **リーク遮断**: 未ログインで `curl https://.../matches/<非サンプルのrecapあり試合ID>` した HTML 全体（インライン script 含む）に、ロック対象セクション（例:「ターニングポイント」配下の本文の一節）が**一切含まれない**
2. **分割位置**: 非 Premium 表示で、4.9.0 recap は「この試合の核心」「試合全体像」が全文読め、「ターニングポイント」見出し以降がロックされている（ティーザーの「次のセクション: ターニングポイント →」表示と CTA は現行踏襲）
3. **旧構成recap**: 旧5セクション構成の published recap でも、先頭2セクション無料・以降ロックで描画エラーがない
4. **Premium 表示**: Premium ユーザーは全文が読める（fetch 完了までの間、ロック部分にスケルトン等の控えめなローディングを表示し、paywall CTA をフラッシュさせない）
5. **サンプル維持**: `lib/sample-matches.ts` の8試合は引き続き静的 HTML に recap 全文が含まれる
6. **プレビュー無変更**: preview は全文無料のまま
7. **en ページ**: `app/matches/[id]/en/page.tsx` にも同一のゲートが適用される
8. **静的性の維持**: 両ページの `revalidate = 3600` と `generateStaticParams` が維持され、ページ render 内で `getUser()` を呼んでいない（`next build` の出力でルートが静的のままであることを確認）
9. **API 判定**: `recap-locked` が (a) 未ログイン→`lockedMd: null`、(b) 無料ユーザー→`lockedMd: null`、(c) Premium→ロック markdown、をテストで担保。レスポンスヘッダが `private, no-store`
10. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

1. **【Owner 判断・SEO トレードオフ】** 現在はリーク（RSC ペイロード内の平文）経由で recap 全文テキストが Google にインデックスされている。サーバーサイドゲート化により非サンプル試合の検索インデックスは「無料2セクションぶん」に縮む。ロングテール検索流入（英語選手名クエリ等が recap 後半に当たっている可能性）をどこまで許容するか、サンプル枠の拡大（全文公開試合を増やす）で相殺するかは Owner 判断
2. 分割インデックスの確定（背景の「要検証」注記参照）: 4.9.0 実データの見出し列を確認し、先頭タイトル見出しの有無でインデックスを調整する
3. `premium-recap-section.tsx` の `/api/me/premium` 依存は本 spec で消えるが、目次（現行 Premium のみ表示）の扱いは現行踏襲で良いか（ロック中でも目次を見せる案は design 系 spec で別途）
