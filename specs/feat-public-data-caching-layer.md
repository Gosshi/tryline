# feat-public-data-caching-layer

## 背景

`[[project_site_performance]]` の通り、サイト全ページが `cache-control: private, no-cache, no-store` + `x-vercel-cache: MISS` で、毎リクエストごとにフルSSRが走っている。`fix-public-page-auth-decoupling.md` ・ `fix-middleware-auth-scope.md` ・ `fix-home-competition-summary-query-fanout.md` で認証呼び出しとクエリの無駄を減らした上で、公開データ（試合結果・順位表・大会一覧等、ユーザー個別化されていないデータ）自体をキャッシュすることで、DB往復そのものを減らす。

## スコープ

対象:
- 公開データ取得系のクエリ関数（`lib/db/queries/` 配下、`getSupabasePublicServerClient()` を使う関数群）のうち、更新頻度が低い・許容できるstalenessがあるものに `unstable_cache`（Next.js）を適用する。目安のTTL:
  - ライブ中・今週の試合一覧: 60秒
  - 順位表・今後の予定: 5〜30分
  - 大会一覧・チーム一覧: 1時間
- 同一レンダー内で複数回呼ばれる可能性がある関数（`getUser()` を除く。認証系は別spec対応）には `React.cache()` を適用し、レンダー内の重複呼び出しを排除する
- データ更新（試合取り込み・記事公開等のcronジョブ）が走った際に、対応するキャッシュタグを無効化する仕組み（`revalidateTag`）を導入する。無効化のトリガーは既存のcronワークフロー（`app/api/cron/` 配下）に組み込む

対象外:
- `fix-public-page-auth-decoupling.md` ・ `fix-middleware-auth-scope.md` ・ `fix-home-competition-summary-query-fanout.md` の実装内容そのもの（別spec、本specはこれらの後に着手することを想定）
- ユーザー個別データ（お気に入りチーム、プレミアム状態等）のキャッシュ（個別化データは対象外）
- `lib/db/queries/matches.ts` 内の `Promise.all` 化（クエリの並列化はキャッシュとは別の最適化のため、本specでは対応してもよいが必須ではない。Codexの判断で余裕があれば含めてよい）

## LLM 連携

なし。

## 受け入れ条件

1. 指定した公開データ取得関数に `unstable_cache` が適用され、TTL内であればDBへの再クエリが発生しないことを確認するテストがある
2. cronジョブ（試合取り込み・記事公開）実行後、対応するキャッシュタグが無効化され、次回リクエストで最新データが取得されることを確認するテストがある
3. ユーザー個別データがキャッシュに混入していないこと（異なるユーザーが同じキャッシュされたレスポンスを共有しないこと）を確認するテストがある
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
5. 変更後、本番デプロイ後にVercelのキャッシュヒット率・TTFBの変化をOwnerに報告する

## 未解決の質問

- キャッシュタグの命名規則・無効化トリガーの具体的な組み込み方（どのcronジョブがどのタグを無効化するか）は、実装時に既存の `app/api/cron/` 構成を確認してから設計すること
- `fix-public-page-auth-decoupling.md` ・ `fix-middleware-auth-scope.md` ・ `fix-home-competition-summary-query-fanout.md` の実装完了を待たずに本specへ着手してよいか（並行実装が可能か）はOwnerが判断する
