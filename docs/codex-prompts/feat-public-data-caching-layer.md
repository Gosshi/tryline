`/specs/feat-public-data-caching-layer.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- サイト全ページが `cache-control: private, no-cache, no-store` でフルSSRしている。本specは公開データ（試合結果・順位表・大会一覧等、ユーザー個別化されていないデータ）自体をキャッシュする層を追加する
- `fix-public-page-auth-decoupling.md` ・ `fix-middleware-auth-scope.md` ・ `fix-home-competition-summary-query-fanout.md`（別spec）の実装が前提として望ましいが、着手可否はOwner確認済みの前提で進めてよい

やること:
- `lib/db/queries/` 配下の公開データ取得関数のうち、更新頻度が低いものに `unstable_cache` を適用する（TTL目安: ライブ中・今週の試合60秒、順位・予定5〜30分、大会・チーム一覧1時間）
- 同一レンダー内で複数回呼ばれる可能性がある関数に `React.cache()` を適用する（`getUser()` 等の認証系は対象外）
- cronジョブ（試合取り込み・記事公開等）実行時に対応するキャッシュタグを `revalidateTag` で無効化する仕組みを、既存の `app/api/cron/` 構成に組み込む

処理すべきエッジケース:
- ユーザー個別データ（お気に入りチーム・プレミアム状態）をキャッシュに混入させないこと
- TTL内に元データが更新されても、キャッシュタグ無効化がなければ古いデータが返り続けてよい（許容staleness）

完了の定義:
- specs の受け入れ条件1〜4を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- ユーザー個別データはキャッシュ対象に含めない
- `matches.ts` の `Promise.all` 化は必須ではないが、余裕があれば含めてよい
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 適用したキャッシュタグの命名規則と無効化トリガーの一覧を報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
