# fix-home-competition-summary-query-fanout

## 背景

実コード確認（2026-07-20）で判明: トップページ（`app/page.tsx:149`）は表示対象の大会ファミリーごとに `listSeasonsByFamily(family)`（`lib/db/queries/competitions.ts`）を `Promise.all` で並列に呼び出している。

問題は `listSeasonsByFamily()` 内部にある。この関数は1回の呼び出しで2クエリを実行する:

1. `competitions` テーブルを `family` で絞り込んだクエリ（正しく絞り込まれている）
2. `match_content` テーブルから `status = 'published'` の全件を取得するクエリ（`client.from("match_content").select("matches!inner(competition_id)").eq("status", "published")`）— **こちらは `family` は愚か、大会（competition）ですら絞り込まれていない。呼び出しのたびにサイト全体のpublishedコンテンツ件数を毎回全件取得している**

トップページに表示する大会ファミリーが11件あれば、この「サイト全体のpublishedコンテンツ全件取得」クエリが**11回**、内容は毎回同一のまま実行される。これは `[[project_site_performance]]` で報告されているTTFB悪化の主要因の一つと推測される、明確な無駄。

## スコープ

対象:
- `lib/db/queries/competitions.ts` の `listSeasonsByFamily()` を変更し、以下のいずれかの方式で「大会ファミリーごとのpublishedコンテンツ件数」取得の重複を排除する:
  - (a) `match_content` の全件取得＋大会ID別カウントを1回だけ実行し、呼び出し元（`app/page.tsx`）で全ファミリー分をまとめて計算する新しい集約関数を用意する
  - (b) DB側で大会ファミリー横断のカウントを1クエリで返す関数・view・RPCを新設する
  - 実装方式はCodexの裁量とするが、**「サイト全体のpublishedコンテンツ全件取得」が表示対象ファミリー数の回数だけ繰り返される現状の重複を解消すること**が必須条件
- トップページ（`app/page.tsx`）側の呼び出し方法も、新しい集約関数・クエリに合わせて変更する

対象外:
- `competitions` テーブル自体の絞り込みクエリ（`family`で正しく絞られており問題なし）の変更
- `isRecentlyActive` 等のソートロジックの変更
- 大会ファミリー一覧の選定ロジック自体の変更

## データモデル変更

DB view・RPCで対応する場合は、読み取り専用の集約用オブジェクト（マイグレーション）を追加してよい。既存テーブルのスキーマ変更は不要。

## 受け入れ条件

1. トップページの描画時、`match_content` に対する「published全件取得」相当のクエリが、表示対象の大会ファミリー数に関わらず**1回**しか発行されないことを確認するテスト（DBクエリ回数をモックで検証する統合テスト、または `lib/db/queries/competitions.ts` の単体テスト）がある
2. 各大会ファミリーごとのpublishedコンテンツ件数の計算結果が、変更前と変更後で一致することを確認する回帰テストがある
3. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
4. 変更後、トップページのTTFBが改善傾向にあることを本番デプロイ後に確認し、Ownerに報告する

## 未解決の質問

- なし（`fix-public-page-auth-decoupling.md` ・ `fix-middleware-auth-scope.md` とは独立して実装・レビュー可能）
