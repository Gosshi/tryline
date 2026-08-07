`specs/fix-content-pipeline-revalidate-outside-request.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- キャッシュ層の成り立ちは `docs/codex-prompts/feat-public-data-caching-layer.md` を参照（`revalidatePublicData` を導入した側の指示書）
- 背景: `lib/cache/public-data.ts` の `revalidatePublicData` が Next.js の `revalidateTag` を呼んでいる。`revalidateTag` はリクエスト／静的生成コンテキストを必要とするため、素の Node スクリプトから実行すると必ず `Invariant: static generation store missing` を投げる
- **最も重要な点**: 例外が発生するのは `match_content` への保存の**後**。そのためスクリプトは「失敗」と報告するのに DB は更新済みという食い違いが起きる。実際に 2026-08-07 の実行で `failed=1 / regenerated=0` と報告されながらコンテンツは 691文字 → 582文字 に書き換わっていた
- 変更対象:
  - `lib/cache/public-data.ts`（例外を投げないようにする、戻り値の追加）
  - `scripts/regenerate-overseas-content.ts`（集計とレポートの整合）
- 影響範囲の確認結果（調査済み、再調査不要）:
  - `revalidatePublicData` の呼び出し元は3箇所。`lib/llm/pipeline.ts:685`（ルートとスクリプト両方から実行される）、`app/api/cron/ingest-fixtures/route.ts:42`、`app/api/cron/ingest-standings/route.ts:20`
  - 壊れるのはパイプライン経路のみ。ただしそこは `regenerate-overseas-content` / `generate-world-rugby-content` / `generate-recaps` / `generate-league-one-content` / `import-news-digest-facts` / `diagnose-winner-mismatch` の**6本共通の出口**

実装のポイント:
- コンテキストの有無を事前判定する API に依存せず、**例外を捕捉する方式**にすること。Next.js のバージョン差で判定 API が変わるリスクを避けるため
- **静かに握りつぶさないこと**。捕捉時は `console.warn` を出し、対象タグが判別できるようにする。今回の問題が気づかれなかったのは失敗が可視化されていなかったためで、そこを再現させない
- 戻り値で「再検証できたか」を呼び出し側が判定できるようにする
- スクリプト側は、保存された件数を `regenerated` に正しく計上し、再検証スキップは `failed` とは別枠で集計する

エッジケース:
- ルート経由の実行では従来どおり `revalidateTag` が呼ばれること。既存の cron の挙動を変えないこと
- `revalidateTag` がコンテキスト不在**以外**の理由で投げた場合、握りつぶして正常扱いにしないこと。区別が難しければ、いずれの場合も warn を出したうえで処理継続とし、その判断を完了報告に書くこと
- 複数 match_id のバッチで1件が例外になっても後続が処理されること
- 再検証がスキップされたとき、完了ログに「本番サイトの表示は更新されていない可能性がある」旨が出ること

やらないこと:
- スクリプトから本番キャッシュを無効化する仕組みの新設（再検証エンドポイントの追加など）。本 spec はクラッシュを止めるところまで
- `app/api/cron/ingest-fixtures` / `ingest-standings` の変更
- 他5本のスクリプトのロジック変更。`revalidatePublicData` が投げなくなれば自然に直る
- ページ側のキャッシュ戦略の変更（時間ベース再検証の追加など）
- 既に乖離している本番キャッシュの修正（運用作業なので実装外）
- `lib/llm/pipeline.ts` の生成ロジック・プロンプト・QA への変更

テスト:
- リクエストコンテキストがない状態で `revalidatePublicData` を呼んでも投げないこと
- そのとき `console.warn` に対象タグが出ること
- コンテキストがある状態では `revalidateTag` が呼ばれること
- 戻り値で再検証の成否が判定できること
- スクリプトのバッチで1件例外が出ても後続が処理されること

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- コンテキスト不在以外の例外をどう扱う設計にしたかを報告する
- `node --env-file=.env.production.local tools/run-ts.cjs scripts/regenerate-overseas-content.ts --match-ids=<任意の1件> --content-type=preview --dry-run` が正常終了することを確認して報告する（**dry-run のみ。LLM を実行する本実行は行わないこと**）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
