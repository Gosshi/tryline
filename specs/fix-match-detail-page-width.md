# fix-match-detail-page-width

## 背景

GPT-5.6によるデザイン監査（2026-07-20、1440px・1920px実機確認）で判明: 試合詳細ページ（`app/matches/[id]/page.tsx:485`）のコンテナが `max-w-4xl`（896px）に固定されており、1920px幅では左右各512pxが余白になる。トップページは直近の `fix-home-width-expansion.md`（PR #616）で `max-w-[1536px]` に拡張済みだが、試合詳細ページには波及していない。

試合詳細ページは `feat-match-page-redesign.md`（PR済み）で視覚刷新済み、`fix-match-detail-page-flow.md`（PR済み）で末尾の「次に見る」導線も実装済みだが、いずれもコンテナ幅そのものは変更していない。本specはこの2つの既存specの対象外だった「幅」だけを扱う。

GPT-5.6の指摘: 896px固定は本文だけを読む分には適切だが、スコア・得点推移・順位表という「横方向に比較したい情報」まで同じ狭い幅に閉じ込めているのは未調整。外側を1152〜1280px程度に広げつつ、本文（レビュー/プレビューのMarkdown）だけは720〜800px程度の内側カラムに保つ二層構造が望ましい。

## スコープ

対象:
- `app/matches/[id]/page.tsx:485` の外側コンテナ幅を `max-w-4xl`（896px）から `max-w-5xl` 〜 `max-w-6xl`（1152〜1280px目安）へ拡張する
- `components/match-content.tsx`（本文Markdown表示部分）に、外側コンテナより狭い内側カラム（`max-w-2xl` 〜 `max-w-3xl`、720〜800px目安）を適用し、本文の可読性（1行の文字数）を保つ
- スコアヒーロー（`components/match-header.tsx`）・得点グラフ（`score-graph.tsx`）・順位テーブル（`standings-table.tsx`）・ラインアップ（`match-lineups-section.tsx`）等、本文以外のセクションは拡張後の外側コンテナ幅をそのまま使う（横に広く使えるレイアウトへの調整は本spec対象。ただし要素の再配置・カラム分割などレイアウト構造自体の作り直しは対象外、幅の調整に限定する）

対象外:
- `feat-match-page-redesign.md` で定義されたコンポーネント構成・デザイントークンの変更
- `fix-match-detail-page-flow.md` で実装済みの「次に見る」ブロックの内容変更
- 試合一覧・順位表のデータ取得ロジック変更
- 選手ページ・チームページの幅変更（`fix-player-page-width-and-navigation.md` で別途対応）

## UI サーフェス

- 参照: `app/page.tsx` の `max-w-[1536px]` 拡張パターン（PR #616）
- 使用トークン: なし（Tailwindの `max-w-*` クラス変更のみ）
- 二層構造の考え方: 外側コンテナ（スコアヒーロー・得点推移・順位表・ラインアップに適用）と、内側の本文カラム（レビュー/プレビューのMarkdown本文のみに適用）を分ける
- **完了の定義にビジュアル確認を含める**: 実装後、Owner が1440px・1920px・375pxで確認し、本文の可読性が損なわれていないこと・スタッツ系セクションが間延びして見えないことを承認する

## 受け入れ条件

1. `app/matches/[id]/page.tsx` の外側コンテナが `max-w-5xl` 〜 `max-w-6xl` に拡張されていること
2. 本文Markdown表示（`components/match-content.tsx`）が外側コンテナより狭い内側カラム幅を持ち、1行あたりの文字数が可読な範囲（目安: 全角35〜45文字程度）に収まっていること
3. 375px幅でオーバーフロー・横スクロールが発生しないこと
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
5. Owner による1440px・1920px・375pxのスクリーンショット目視確認で承認を得ること

## 未解決の質問

- 外側コンテナの正確な幅（`max-w-5xl`=1024pxか`max-w-6xl`=1152pxか、あるいは`max-w-[1280px]`のような任意値か）は実装時のバランスを見てOwnerが最終判断する。実装時は複数パターンをスクリーンショットで比較提示してよい
