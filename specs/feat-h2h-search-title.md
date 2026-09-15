# H2H ページの検索タイトルに競技語を入れる

## 背景

GA4 の 2026-08-18〜09-14 の実測で、Google 自然検索からの最大の着地ページは `/h2h/japan-vs-usa`（29 セッション）だった。現行 H2H ページの検索タイトルは「日本 対 アメリカ 対戦成績 | Tryline」であり、検索意図に含まれる競技語「ラグビー」が title / description にない。

H2H の結果を通算成績と断定しない既存の制約は維持する。対象は検索メタデータのみであり、表示本文・収録範囲・データ取得に変更を加えない。

## スコープ

対象:

- `app/h2h/[pair]/page.tsx` の title、description、Open Graph title / description
- 対応テスト

対象外:

- H2H ページの本文・見出し・導線・構造化データ
- H2H の収録範囲、勝敗数・勝率の表示、データ取得、sitemap
- 新規ページ、DB クエリ、LLM、依存追加

## メタデータ仕様

有効な H2H ページでは以下を返す。

- title: `ラグビー ${teamA.name} 対 ${teamB.name} 対戦成績 | Tryline`
- description: `ラグビー${teamA.name}と${teamB.name}の対戦成績（Tryline 収録分）。直近の対戦結果とスコア、日本語レビューへのリンク。`
- Open Graph の title / description は同じ文言を使う

「Tryline 収録分」の限定を残し、全対戦の通算成績であるように表現しない。

## 受け入れ条件

1. `generateMetadata` の title と Open Graph title に先頭の「ラグビー」が含まれる
2. description と Open Graph description に「ラグビー」と「Tryline 収録分」が含まれる
3. canonical URL、not found、canonical redirect の既存挙動に差分がない
4. ページ本文と JSON-LD に差分がない
5. `tests/app/h2h-page.test.tsx` で metadata を検証する
6. `pnpm lint`、`pnpm typecheck`、関連テスト、`pnpm build` を実行する

## 未解決の質問

なし。検索 CTR の評価は Search Console が読める状態で、クロール反映後に同一期間で行う。
