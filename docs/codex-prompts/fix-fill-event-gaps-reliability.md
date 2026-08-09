`specs/fix-fill-event-gaps-reliability.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要。2026-08-09 に実測）**:
  - `app/api/cron/fill-event-gaps/route.ts` は `maxDuration = 60`（13行目）、`CRON_BATCH_SIZE = 25`（15行目）
  - 1件ごとに `await sleep(1_500)` があり、**待機だけで 25 × 1.5 = 37.5秒**を消費する
  - 実行2回とも 504 で打ち切られたが、**2回目はサーバ側の処理が継続して19イベントが正しく登録されていた**。ワークフローは failure と報告した
  - ギャップ判定のため `client.from("match_events").select("match_id")` を**フィルタなしで**実行している。`finished` は1,034件あり、イベント総数は1万行超
  - ルートは既に `matchIds`（最大40件）をボディで受け付ける（25-27行目）。`matchIds` 指定時は `CRON_BATCH_SIZE` の制限が外れる。**ワークフローが使っていないだけ**
  - `scripts/fill-event-gaps.ts` の `loadGapMatches`（332-356行）は `ORDER BY` を持たない。`--limit=50` では「Found 0 matches」、`--limit=1100` で22件検出
  - ルート側は `.order("kickoff_at", { ascending: false })` を持つため直近試合は対象に入る
- 変更対象:
  - `app/api/cron/fill-event-gaps/route.ts`
  - `scripts/fill-event-gaps.ts`
  - `.github/workflows/cron-fill-event-gaps.yml`

実装のポイント:
- **ギャップ判定を DB 側で行うこと。** `match_events` 全行をアプリへ持ってきて `Set` で突き合わせる現在の方式は廃してください。実現方法（left join + null 判定など）は既存の他クエリの書き方に合わせて判断してください
- **60秒以内に完走させること。** `maxDuration` を延ばすか、バッチを小さくするかは判断してよいですが、**1件あたり1.5秒の待機は必須**（robots.txt 遵守）なので短縮しないでください
- バッチを小さくする場合、**古いギャップが永久に処理されない状態を作らないこと**。`kickoff_at` 降順だけだと直近の試合が常に優先され、古いギャップに到達しません。優先順位の設計を報告してください
- ワークフローがレスポンスの `{ errors, filled, gaps }` を**ログの要約行に出す**ようにしてください。現状は件数がどこにも残りません
- **成功したのに failure と報告される状態を解消してください。** 方法は判断してよいです
- ワークフローに `workflow_dispatch` の入力を追加し `matchIds` を渡せるようにしてください。`cron-post-match-recap-refresh.yml` の `from` / `to` 入力が参考例です

エッジケース:
- ギャップが0件のときに正常終了すること
- `matchIds` 指定時にバッチ上限が適用されないこと（既存挙動の維持）
- `external_ids.wikipedia_url` が無い試合は従来どおりスキップすること
- Wikipedia の取得が失敗した1件で全体が止まらないこと（既存の try/catch を維持）

やらないこと:
- **`event totals exceed final score` によるスキップの無効化・緩和**。これは誤ったイベント登録を防ぐ正常なガードです。2026-06 のイベント汚染事故の教訓であり、絶対に弱めないでください
- `no unique event block found` の解析改善（別課題）
- `parseMatchEventsFromVeventHtml` の ja.wikipedia 対応
- `lib/ingestion/live-ingest.ts` や リポビタンのアダプタの `rawHtml` 対応（別 spec）
- `sleep(1_500)` の短縮
- cron の実行頻度の変更

テスト:
- ギャップ判定が DB 側で行われ、`match_events` 全行取得が無いこと
- ギャップ0件で正常終了すること
- `matchIds` 指定時にバッチ上限が外れること
- `scripts/fill-event-gaps.ts` が並び順とギャップ絞り込みを持つこと
- **スコア不一致によるスキップが引き続き機能すること**（ガードを弱めていないことの担保）

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **60秒に収めるためにどの方式を採ったか（`maxDuration` 変更 / バッチ縮小 / その他）を報告してください**
- **古いギャップが永久に未処理にならないための優先順位設計を報告してください**
- ギャップ判定のクエリをどう書いたかを示してください
- 成功時に failure と報告される問題をどう解消したかを報告してください
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
